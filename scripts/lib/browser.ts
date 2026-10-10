import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type BrowserContext, type Page, type Worker } from 'playwright';

/** Loads an unpacked build into a fresh Chromium profile (Playwright's Chromium; branded Chrome ignores --load-extension). */
export async function launchWithExtension(
  extensionDir: string,
  options: { channel?: string; headless?: boolean; viewport?: { width: number; height: number } } = {}
): Promise<{ context: BrowserContext; worker: Worker; extensionId: string; profileDir: string }> {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qrx-ext-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: options.channel ?? 'chromium',
    headless: options.headless ?? true,
    viewport: options.viewport ?? { width: 1280, height: 800 },
    acceptDownloads: true,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker', { timeout: 20_000 });
  const extensionId = new URL(worker.url()).host;
  return { context, worker, extensionId, profileDir };
}

export async function extensionPage(context: BrowserContext, extensionId: string, pagePath: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${pagePath}`);
  return page;
}

/** The worker the browser is running now: Chrome may have stopped and restarted it. */
export function currentWorker(context: BrowserContext, extensionId: string): Worker | undefined {
  return context.serviceWorkers().find((w) => w.url().includes(extensionId));
}

export function readSecretFile(envName: string): string | undefined {
  const file = process.env[envName];
  if (!file) return undefined;
  return fs.readFileSync(file, 'utf8').trim();
}
