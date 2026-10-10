/**
 * Store screenshots (1280x800) from the real extension UI.
 *
 *   npm run build:extension
 *   QRX_SCREENSHOT_API_KEY_FILE=path/to/key.txt QRX_SCREENSHOT_CODE_ID=<an existing code id> npm run screenshots
 *
 * Loads the store build in Playwright's Chromium, signs in with an API key from a file (never printed), and captures
 * the popup in each state. Each popup capture is placed over a screenshot of the page the code links to, where the
 * popup opens under the toolbar. The run only reads (account, styles, codes); it never makes a code. The "painting"
 * state is shown by saving an in-progress job for the existing code, which the worker can only read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { extensionPage, launchWithExtension, readSecretFile } from './lib/browser';

const EXTENSION_DIR = path.resolve(process.env.SCREENSHOT_EXTENSION_DIR ?? 'dist/extension');
const OUT = path.resolve(process.env.SCREENSHOTS_DIR ?? 'store/assets/screenshots');
const WORK = path.resolve('test-results/screenshots');
const CODE_ID = process.env.QRX_SCREENSHOT_CODE_ID;
const API_BASE = process.env.QRX_SCREENSHOT_API_BASE ?? 'https://qrx.codes';
const WIDTH = 1280;
const HEIGHT = 800;

type Code = { id: string; prompt: string; destination: string; style: string | null; shortUrl: string };

async function popupShot(page: Page, name: string): Promise<string> {
  const file = path.join(WORK, `${name}.png`);
  await page.waitForTimeout(300);
  await page.locator('.popup').screenshot({ path: file });
  return file;
}

async function waitForImages(page: Page) {
  await page.waitForFunction(() =>
    Array.from(document.images).every((img) => !img.src || (img.complete && img.naturalWidth > 0))
  );
}

/** Places a popup capture over the backdrop page, where Chrome opens it: under the toolbar, at the right. */
async function compose(context: BrowserContext, backdrop: string, popup: string, name: string) {
  const page = await context.newPage();
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  const dataUrl = (file: string) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;position:relative">
    <img src="${dataUrl(backdrop)}" style="position:absolute;inset:0;width:${WIDTH}px;height:${HEIGHT}px;filter:saturate(.9)">
    <div style="position:absolute;inset:0;background:rgba(15,16,20,.18)"></div>
    <img src="${dataUrl(popup)}" style="position:absolute;top:12px;right:24px;border-radius:12px;
      box-shadow:0 18px 50px rgba(0,0,0,.28),0 2px 8px rgba(0,0,0,.18)">
  </body></html>`);
  await waitForImages(page);
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  await page.close();
  console.log(`✓ ${name}.png`);
}

async function main() {
  const apiKey = readSecretFile('QRX_SCREENSHOT_API_KEY_FILE');
  if (!apiKey || !CODE_ID) throw new Error('Set QRX_SCREENSHOT_API_KEY_FILE and QRX_SCREENSHOT_CODE_ID.');
  fs.mkdirSync(WORK, { recursive: true });

  const { context, extensionId, profileDir } = await launchWithExtension(EXTENSION_DIR, {
    viewport: { width: 420, height: 640 },
  });
  try {
    // the existing code, read through the API like the extension does
    const res = await fetch(`${API_BASE}/v1/codes/${CODE_ID}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`GET /v1/codes/${CODE_ID}: HTTP ${res.status}`);
    const code = (await res.json()) as Code;

    // backdrop: the page the code links to
    const browser = await chromium.launch();
    const site = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    await site.goto(code.destination, { waitUntil: 'networkidle' });
    const backdrop = path.join(WORK, 'backdrop.png');
    await site.screenshot({ path: backdrop });
    await browser.close();

    // 1. signed out
    const popup = await extensionPage(context, extensionId, 'popup.html?tab');
    await popup.getByRole('button', { name: 'Sign in to QRX' }).waitFor();
    await waitForImages(popup);
    const signedOut = await popupShot(popup, 'signed-out');

    // sign in with the API key (options page)
    const options = await extensionPage(context, extensionId, 'options.html');
    await options.getByLabel('API key').fill(apiKey);
    await options.getByRole('button', { name: 'Save key' }).click();
    await options.getByText(/Using an API key/).waitFor({ timeout: 15_000 });
    await options.close();

    // 2. create form, filled in as for the existing code
    await popup.reload();
    await popup.locator('.styles button.style').first().waitFor({ timeout: 15_000 });
    await popup.locator('#destination').fill(code.destination);
    await popup.locator('#prompt').fill(code.prompt);
    await popup.getByRole('button', { name: 'Water color' }).click();
    await popup.locator('#prompt').blur();
    await waitForImages(popup);
    const create = await popupShot(popup, 'create');

    // 3. painting: an in-progress job for the existing code (the worker can only read it)
    const jobId = 'screenshot-job';
    await popup.evaluate(
      ([id, c]) =>
        chrome.storage.local.set({
          jobs: {
            [id]: {
              id,
              request: { prompt: c.prompt, destination: c.destination },
              createdAt: Date.now(),
              codeId: c.id,
              state: 'processing',
            },
          },
          focusJobId: id,
        }),
      [jobId, code] as const
    );
    const painting = await extensionPage(context, extensionId, `popup.html?job=${jobId}`);
    await painting.getByText('Painting your code…').waitFor();
    const paintingShot = await popupShot(painting, 'painting');
    await painting.close();
    await popup.evaluate(() => chrome.storage.local.remove(['jobs', 'focusJobId']));

    // 4. the finished code, opened from Recent
    await popup.reload();
    await popup.getByRole('tab', { name: 'Recent' }).click();
    const item = popup.locator('.recent-item', { has: popup.locator(`img[src*="${code.id}"]`) });
    await item.waitFor({ timeout: 15_000 });
    await item.click();
    await popup.locator('.short-link').waitFor();
    await waitForImages(popup);
    const result = await popupShot(popup, 'result');

    await compose(context, backdrop, create, '1-create');
    await compose(context, backdrop, paintingShot, '2-painting');
    await compose(context, backdrop, result, '3-result');
    await compose(context, backdrop, signedOut, '4-sign-in');
    fs.copyFileSync(result, path.join(WORK, 'popup-result.png'));
  } finally {
    await context.close();
    // the profile held the API key: remove it
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
