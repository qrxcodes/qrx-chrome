// Service worker: holds the credentials, makes every API call, and drives codes to completion so the popup can close.

import { api } from './lib/api';
import { redirectUri, signIn, signOut, status, saveApiKey } from './lib/auth';
import {
  createJob,
  dismissJob,
  isPending,
  markSeen,
  POLL_ALARM,
  reconcile,
  retryJob,
  setFinishedHandler,
} from './lib/jobs';
import type { Message, Reply, RequestType, Requests } from './lib/messages';
import { toProblem } from './lib/problem';
import { getStored, setStored } from './lib/storage';
import type { Job, Style } from './lib/types';

const STYLES_TTL_MS = 24 * 60 * 60 * 1000;
const NOTIFICATION_PREFIX = 'job:';

// ---------------------------------------------------------------------------------------------------------------------
// Badge: "…" while a code is being made, then the number of finished codes not yet looked at.

async function updateBadge() {
  const jobs = Object.values((await getStored('jobs')) ?? {});
  const pending = jobs.filter(isPending).length;
  const unseen = jobs.filter((job) => job.state === 'succeeded' && !job.seen).length;
  const text = pending ? '…' : unseen ? String(unseen) : '';
  await chrome.action.setBadgeBackgroundColor({ color: '#2453d6' });
  await chrome.action.setBadgeText({ text });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.jobs) void updateBadge();
});

// ---------------------------------------------------------------------------------------------------------------------
// Notifications. Images in notifications must be data or blob URLs, so the worker fetches the PNG and shrinks it.

async function thumbnailDataUrl(imageUrl: string, size = 192): Promise<string> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`image HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.drawImage(bitmap, 0, 0, size, size);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(binary)}`;
}

function shorten(text: string, max = 90) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function notifyFinished(job: Job) {
  const fallbackIcon = chrome.runtime.getURL('icons/icon-128.png');
  const succeeded = job.state === 'succeeded';
  let iconUrl = fallbackIcon;
  if (succeeded && job.code?.imageUrl) iconUrl = await thumbnailDataUrl(job.code.imageUrl).catch(() => fallbackIcon);
  const link = job.code?.shortUrl?.replace(/^https?:\/\//, '');
  await chrome.notifications.create(`${NOTIFICATION_PREFIX}${job.id}`, {
    type: 'basic',
    iconUrl,
    title: succeeded ? 'Your QR code is ready' : "Your QR code didn't work out",
    message: succeeded ? shorten(job.request.prompt) : (job.problem?.detail ?? 'Open QRX to try again.'),
    contextMessage: succeeded ? link : undefined,
    priority: 1,
  });
}

setFinishedHandler(async (job) => {
  await updateBadge();
  await notifyFinished(job).catch((err) => console.warn('[QRX] notification failed', err));
});

/** Opens the finished code: in the popup where the browser allows it, otherwise as a tab. */
async function openJob(jobId: string) {
  await setStored('focusJobId', jobId);
  try {
    await chrome.action.openPopup();
  } catch {
    await chrome.tabs.create({ url: chrome.runtime.getURL(`popup.html?job=${encodeURIComponent(jobId)}`) });
  }
}

chrome.notifications.onClicked.addListener((notificationId) => {
  if (!notificationId.startsWith(NOTIFICATION_PREFIX)) return;
  void chrome.notifications.clear(notificationId);
  void openJob(notificationId.slice(NOTIFICATION_PREFIX.length));
});

// ---------------------------------------------------------------------------------------------------------------------
// Messages from the popup and options page.

async function styles(): Promise<Style[]> {
  const cached = await getStored('styles');
  if (cached && Date.now() - cached.fetchedAt < STYLES_TTL_MS && cached.data.length) return cached.data;
  const list = await api.listStyles();
  await setStored('styles', { fetchedAt: Date.now(), data: list.data });
  return list.data;
}

type Handlers = { [T in RequestType]: (message: Message<T>) => Promise<Requests[T]['res']> };

const handlers: Handlers = {
  'auth/status': () => status(),
  'auth/signIn': async () => {
    const result = await signIn();
    if (result.signedIn) void reconcile();
    return result;
  },
  'auth/signOut': async () => {
    await signOut();
    await setStored('styles', undefined);
    return status();
  },
  'auth/apiKey': async ({ apiKey }) => {
    const result = await saveApiKey(apiKey);
    await setStored('styles', undefined);
    void reconcile();
    return result;
  },
  'auth/redirectUri': async () => redirectUri(),
  'account/get': () => api.account(),
  'styles/list': () => styles(),
  'codes/list': ({ cursor }) => api.listCodes(cursor),
  'codes/get': ({ id }) => api.getCode(id),
  'jobs/create': async ({ request }) => {
    if (request.style) await setStored('lastStyle', request.style);
    return createJob(request);
  },
  'jobs/retry': ({ id }) => retryJob(id),
  'jobs/dismiss': ({ id }) => dismissJob(id),
  'jobs/seen': async ({ id }) => {
    await markSeen(id);
    await updateBadge();
  },
};

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  // only this extension's own pages talk to the worker
  if (sender.id !== chrome.runtime.id) return false;
  const handler = handlers[message?.type] as ((m: Message) => Promise<Requests[RequestType]['res']>) | undefined;
  if (!handler) return false;
  handler(message).then(
    (value) => sendResponse({ ok: true, value } satisfies Reply),
    (err: unknown) => sendResponse({ ok: false, problem: toProblem(err) } satisfies Reply)
  );
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) void reconcile();
});

// Runs every time the worker script loads, not only on startup or install: Chrome may have stopped the worker in the
// middle of a request, and alarms don't always survive a browser restart.
void setStored('signingIn', undefined);
void reconcile();
void updateBadge();

export {};
