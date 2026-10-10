import type { AuthState, Job, Style } from './types';

/** Everything the extension keeps, in chrome.storage.local. */
export type StoredData = {
  auth?: AuthState;
  /** Dynamically registered OAuth clients, by `${issuer} ${redirectUri}`. */
  oauthClients?: Record<string, string>;
  /** The last sign-in error, for the popup. */
  authError?: string;
  /** A sign-in window is open. */
  signingIn?: boolean;
  jobs?: Record<string, Job>;
  /** The job the popup should open on. */
  focusJobId?: string;
  styles?: { fetchedAt: number; data: Style[] };
  /** The style picked last time. */
  lastStyle?: string;
};

export async function getStored<K extends keyof StoredData>(key: K): Promise<StoredData[K]> {
  const result = await chrome.storage.local.get(key);
  return result[key] as StoredData[K];
}

export async function setStored<K extends keyof StoredData>(key: K, value: StoredData[K]): Promise<void> {
  if (value === undefined) await chrome.storage.local.remove(key);
  else await chrome.storage.local.set({ [key]: value });
}

let queue: Promise<unknown> = Promise.resolve();

/** Runs read-modify-write updates one at a time, so concurrent pollers never overwrite each other's changes. */
export function serialised<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export function updateJobs(mutate: (jobs: Record<string, Job>) => void): Promise<Record<string, Job>> {
  return serialised(async () => {
    const jobs = { ...((await getStored('jobs')) ?? {}) };
    mutate(jobs);
    await setStored('jobs', jobs);
    return jobs;
  });
}
