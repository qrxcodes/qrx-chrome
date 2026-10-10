import { api } from './api';
import { isTransient, toProblem } from './problem';
import { getStored, setStored, updateJobs } from './storage';
import type { Code, CreateCodeRequest, Job, ProblemInfo } from './types';

/**
 * Codes take about a minute, longer than the popup stays open and longer than a service worker may wait on one fetch.
 * So a request is saved first (with its Idempotency-Key) and driven from the worker:
 * - POST /v1/codes answers at once with the code id;
 * - GET /v1/codes/{id}?wait=20 long-polls, safely under the 30 s fetch limit;
 * - an alarm every 30 s wakes the worker if Chrome stopped it, and `reconcile` (run every time the worker script loads)
 *   resends unanswered requests with their saved key, which returns the same code rather than making a second one.
 */

export const POLL_ALARM = 'qrx-poll';
const POLL_WAIT_SECONDS = 20;
/** The API honours an Idempotency-Key for 24 hours; past that, resending could make a second code. */
const IDEMPOTENCY_WINDOW_MS = 23 * 60 * 60 * 1000;
/** Finished jobs kept for the popup. */
const KEEP_FINISHED = 20;
const KEEP_FINISHED_MS = 7 * 24 * 60 * 60 * 1000;

const driving = new Set<string>();
let onFinished: (job: Job) => void | Promise<void> = () => undefined;

export function setFinishedHandler(handler: (job: Job) => void | Promise<void>) {
  onFinished = handler;
}

export const isPending = (job: Job) => job.state === 'submitting' || job.state === 'processing';

export function stateFromCode(code: Code): Job['state'] {
  if (code.status === 'succeeded') return 'succeeded';
  if (code.status === 'failed') return 'failed';
  return 'processing';
}

function failureProblem(code: Code): ProblemInfo {
  return {
    type: 'generation-failed',
    title: "This one didn't work out",
    detail: code.error?.message ?? 'QRX could not make a code that scans. Try another prompt.',
  };
}

/** Drops old finished jobs so storage stays small. */
export function prune(jobs: Record<string, Job>, now = Date.now()): void {
  const finished = Object.values(jobs)
    .filter((job) => !isPending(job))
    .sort((a, b) => b.createdAt - a.createdAt);
  finished.forEach((job, index) => {
    if (index >= KEEP_FINISHED || now - job.createdAt > KEEP_FINISHED_MS) delete jobs[job.id];
  });
}

async function saveJob(id: string, patch: Partial<Job>): Promise<Job | undefined> {
  const jobs = await updateJobs((all) => {
    if (all[id]) all[id] = { ...all[id], ...patch };
  });
  return jobs[id];
}

export async function createJob(request: CreateCodeRequest): Promise<Job> {
  const job: Job = { id: crypto.randomUUID(), request, createdAt: Date.now(), state: 'submitting' };
  await updateJobs((jobs) => {
    prune(jobs);
    jobs[job.id] = job;
  });
  await setStored('focusJobId', job.id);
  // the alarm exists before the request goes out, so nothing is left without a way to resume
  await ensureAlarm();
  void drive(job.id);
  return job;
}

export async function retryJob(id: string): Promise<Job | undefined> {
  const job = (await getStored('jobs'))?.[id];
  if (!job) return undefined;
  // a failed code is final; ask for a new one with the same request
  return createJob(job.request);
}

export async function dismissJob(id: string): Promise<void> {
  await updateJobs((jobs) => {
    delete jobs[id];
  });
}

export async function markSeen(id: string): Promise<void> {
  await saveJob(id, { seen: true });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Moves one job forward until it finishes, or until it needs the alarm to try again later. */
export async function drive(id: string): Promise<void> {
  if (driving.has(id)) return;
  driving.add(id);
  try {
    let transientFailures = 0;
    for (;;) {
      const job = (await getStored('jobs'))?.[id];
      if (!job || !isPending(job)) return;
      let code: Code;
      try {
        if (!job.codeId) {
          if (Date.now() - job.createdAt > IDEMPOTENCY_WINDOW_MS) {
            await saveJob(id, {
              state: 'failed',
              problem: {
                type: 'expired',
                title: 'This request ran out of time',
                detail: 'Check Recent to see whether the code was made.',
              },
            });
            return;
          }
          code = await api.createCode(job.request, job.id);
        } else {
          code = await api.getCode(job.codeId, POLL_WAIT_SECONDS);
        }
      } catch (err) {
        const problem = toProblem(err);
        if (problem.type === 'unauthorized') {
          // keep the job; it resumes after the next sign-in
          await saveJob(id, { problem });
          return;
        }
        if (isTransient(problem)) {
          await saveJob(id, { problem });
          transientFailures += 1;
          if (transientFailures >= 3) return; // the alarm tries again
          await sleep(Math.min((problem.retryAfter ?? 5) * 1000, 20_000));
          continue;
        }
        const failed = await saveJob(id, { state: 'failed', problem });
        if (failed) await onFinished(failed);
        return;
      }
      transientFailures = 0;
      const state = stateFromCode(code);
      const updated = await saveJob(id, {
        codeId: code.id,
        code,
        state,
        problem: state === 'failed' ? failureProblem(code) : undefined,
      });
      if (updated && !isPending(updated)) {
        await onFinished(updated);
        return;
      }
    }
  } finally {
    driving.delete(id);
    await clearAlarmIfIdle();
  }
}

export async function ensureAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(POLL_ALARM);
  if (!existing) await chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
}

async function clearAlarmIfIdle(): Promise<void> {
  const jobs = Object.values((await getStored('jobs')) ?? {});
  if (!jobs.some(isPending)) await chrome.alarms.clear(POLL_ALARM);
}

/** Resumes every unfinished job. Runs whenever the worker starts and on each alarm. */
export async function reconcile(): Promise<void> {
  const auth = await getStored('auth');
  const pending = Object.values((await getStored('jobs')) ?? {}).filter(isPending);
  if (!pending.length || !auth) {
    // with no credentials nothing can move; signing in runs this again
    await chrome.alarms.clear(POLL_ALARM);
    return;
  }
  await ensureAlarm();
  await Promise.all(pending.map((job) => drive(job.id)));
}
