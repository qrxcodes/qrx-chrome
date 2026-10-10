/**
 * End-to-end run of the unpacked dev build against dev.qrx.codes in Playwright's Chromium.
 *
 *   npm run build:extension:dev
 *   QRX_TEST_API_KEY_FILE=path/to/key.txt E2E_GENERATE=1 npm run test:e2e
 *
 * Without E2E_GENERATE=1 it stops before making a code. With it, it makes exactly one code through the popup, stops the
 * service worker while the code is processing, and checks the alarm brings it back to finish the job.
 *
 * E2E_RESUME_JOB_ID=<job id> E2E_RESUME_EXPECT_CODE=<code id> instead replays a request an earlier run made (same
 * prompt, link and style) with its saved Idempotency-Key, and checks the API answers with that same code: no new code.
 *
 * Sign-in with QRX needs a person, so the run only checks that the sign-in window opens on the right authorisation
 * request, then closes it.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { ENVIRONMENTS } from '../build.config';
import { currentWorker, extensionPage, launchWithExtension, readSecretFile } from './lib/browser';

/** E2E_CHANNEL=msedge runs the same build in Microsoft Edge. */
const EXTENSION_DIR = path.resolve(process.env.E2E_EXTENSION_DIR ?? 'dist/extension-dev');
const OUT = path.resolve(process.env.E2E_OUT ?? 'test-results/e2e');
const EXPECTED_DEV_ID = 'bcpkdmcioonkndjhpfogabejhemhahge';
const GENERATE = process.env.E2E_GENERATE === '1';
/** Resend a request this extension already made, by its saved Idempotency-Key (no new code). */
const RESUME_JOB_ID = process.env.E2E_RESUME_JOB_ID;
const RESUME_EXPECT_CODE = process.env.E2E_RESUME_EXPECT_CODE;
const RESUME_STYLE = process.env.E2E_RESUME_STYLE ?? 'ae4c1';
const DESTINATION = process.env.E2E_DESTINATION ?? 'https://dev.qrx.codes/developers';
const PROMPT = process.env.E2E_PROMPT ?? 'A watercolour lighthouse on a rocky coast at dawn, soft blues and gold';

const results: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function storage(context: BrowserContext, id: string, key: string): Promise<any> {
  const page = await extensionPage(context, id, 'options.html');
  const value = await page.evaluate(async (k) => (await chrome.storage.local.get(k))[k], key);
  await page.close();
  return value;
}

/** Stops the extension's service worker, as Chrome does when it is idle; true once it has gone. */
async function stopWorkers(context: BrowserContext, id: string): Promise<boolean> {
  const page = await extensionPage(context, id, 'options.html');
  const cdp = await context.newCDPSession(page);
  const stopped = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(false), 10_000);
    cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
      if (versions.some((v) => v.scriptURL.includes(id) && v.runningStatus === 'stopped')) resolve(true);
    });
  });
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  const result = await stopped;
  await cdp.detach();
  await page.close();
  return result;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { context, extensionId } = await launchWithExtension(EXTENSION_DIR, { channel: process.env.E2E_CHANNEL });
  try {
    check('extension loads with the fixed dev ID', extensionId === EXPECTED_DEV_ID, extensionId);

    // ------------------------------------------------------------------------------------------------ options page
    const options = await extensionPage(context, extensionId, 'options.html');
    const redirect = await options.locator('code').first().textContent({ timeout: 10_000 });
    check(
      'redirect URI is https://<id>.chromiumapp.org/',
      redirect === `https://${extensionId}.chromiumapp.org/`,
      redirect ?? ''
    );
    await shot(options, 'options-signed-out');

    // ------------------------------------------------------------------------------------------ signed-out popup
    const popup = await extensionPage(context, extensionId, 'popup.html?tab');
    await popup.getByRole('button', { name: 'Sign in to QRX' }).waitFor();
    check('popup shows Sign in to QRX when signed out', true);
    await shot(popup, 'popup-signed-out');

    // ------------------------------------------------------------- sign-in window opens on the Clerk authorisation
    let authorizeRequest: URL | undefined;
    context.on('request', (request) => {
      if (!authorizeRequest && request.url().includes('/oauth/authorize')) authorizeRequest = new URL(request.url());
    });
    const authPagePromise = context.waitForEvent('page', { timeout: 20_000 }).catch(() => undefined);
    await popup.getByRole('button', { name: 'Sign in to QRX' }).click();
    const authPage = await authPagePromise;
    if (authPage) {
      await authPage.waitForLoadState('domcontentloaded').catch(() => undefined);
      const firstUrl = new URL(authPage.url());
      check(
        'sign-in window opens on the QRX dev Clerk instance',
        /(^|\.)accounts\.dev$/.test(firstUrl.host),
        firstUrl.host
      );
      await authPage.waitForTimeout(4000);
      await authPage.screenshot({ path: path.join(OUT, 'signin-window.png') }).catch(() => undefined);
      const params = authorizeRequest?.searchParams;
      check(
        'authorisation request uses PKCE S256, the chromiumapp.org redirect and the QRX scopes',
        params?.get('code_challenge_method') === 'S256' &&
          params?.get('redirect_uri') === `https://${extensionId}.chromiumapp.org/` &&
          params?.get('scope') === 'qrx:read qrx:generate offline_access' &&
          params?.get('response_type') === 'code',
        authorizeRequest ? `resource=${params?.get('resource')}` : 'request not seen'
      );
      check(
        'authorisation request asks for a token for the REST API (resource <origin>/v1)',
        params?.get('resource') === `${ENVIRONMENTS.dev.apiBase}/v1`
      );
      check(
        'authorisation request uses the pre-registered dev client',
        params?.get('client_id') === ENVIRONMENTS.dev.oauthClientId,
        params?.get('client_id') ?? ''
      );
      check(
        'the sign-in page shows no OAuth error (Clerk accepts the chromiumapp.org redirect URI)',
        !(await authPage.locator('text=/invalid|redirect_uri|error/i').count()),
        authPage.url().split('?')[0]
      );
      await authPage.close();
      await popup.waitForTimeout(1500);
      const clients = await storage(context, extensionId, 'oauthClients');
      check('no dynamic client registration when a client is configured', !clients);
      const authError = await storage(context, extensionId, 'authError');
      check('closing the sign-in window counts as a cancel, not an error', !authError, authError);
    } else {
      check('sign-in window opens', false, 'no window appeared within 20 s');
    }

    // ------------------------------------------------------------------------------------- API key fallback
    const apiKey = readSecretFile('QRX_TEST_API_KEY_FILE');
    if (!apiKey) {
      console.log('No QRX_TEST_API_KEY_FILE: stopping before the signed-in checks.');
      return;
    }
    await options.reload();
    await options.getByLabel('API key').fill('qrx_test_not_a_real_key_000');
    await options.getByRole('button', { name: 'Save key' }).click();
    await options.locator('.error-text').waitFor({ timeout: 15_000 });
    check(
      'a wrong API key is refused',
      (await options.locator('.error-text').textContent())?.includes('did not accept') ?? false
    );
    await options.getByLabel('API key').fill(apiKey);
    await options.getByRole('button', { name: 'Save key' }).click();
    await options.getByText(/Using an API key/).waitFor({ timeout: 15_000 });
    check('a valid API key signs the extension in', true);
    await shot(options, 'options-api-key');

    // --------------------------------------------------------------------------------------------- create form
    await popup.reload();
    const styleButtons = popup.locator('.styles button.style');
    await styleButtons.first().waitFor({ timeout: 15_000 });
    const styleCount = await styleButtons.count();
    check('style picker lists the styles from GET /v1/styles', styleCount >= 10, `${styleCount} styles`);
    check('first style is No style', (await styleButtons.first().textContent()) === 'No style');

    const link = popup.locator('#destination');
    await link.fill('not a link');
    check('a bad link is flagged', await popup.getByText('Use a full http:// or https:// link.').isVisible());
    check(
      'Create is disabled without a prompt and link',
      await popup.getByRole('button', { name: 'Create QR code' }).isDisabled()
    );
    await link.fill(DESTINATION);
    await popup.locator('#prompt').fill(PROMPT);
    await popup.getByRole('button', { name: 'Water color' }).click();
    await shot(popup, 'popup-create');

    let job: any;
    let expectedCodeId: string | undefined;
    if (GENERATE) {
      // ---------------------------------------------------------------------------- create, then lose the popup
      await popup.getByRole('button', { name: 'Create QR code' }).click();
      await popup.getByText('Painting your code…').waitFor({ timeout: 15_000 });
      check('popup switches to the progress view', true);
      await shot(popup, 'popup-processing');
      await popup.close();

      // wait until the API has given the job a code id, then stop the worker mid-poll
      let jobs: Record<string, any> = {};
      for (let i = 0; i < 30; i++) {
        jobs = (await storage(context, extensionId, 'jobs')) ?? {};
        if (Object.values(jobs).some((j: any) => j.codeId)) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      job = Object.values(jobs)[0];
      check('the worker created the code (POST /v1/codes)', !!job?.codeId, `job ${job?.id}, code ${job?.codeId}`);
      check('service worker stopped while the code was processing', await stopWorkers(context, extensionId));
    } else if (RESUME_JOB_ID) {
      // ------------------------- a request saved before its answer arrived is resent with its Idempotency-Key
      await popup.close();
      const request = { prompt: PROMPT, destination: DESTINATION, style: RESUME_STYLE };
      job = { id: RESUME_JOB_ID, request, createdAt: Date.now(), state: 'submitting' };
      const seed = await extensionPage(context, extensionId, 'options.html');
      await seed.evaluate((j) => chrome.storage.local.set({ jobs: { [j.id]: j } }), job);
      await seed.close();
      check('service worker stopped with an unanswered request saved', await stopWorkers(context, extensionId));
      // any message wakes the worker; its module scope reconciles the stored jobs
      const waker = await extensionPage(context, extensionId, 'popup.html?tab');
      await waker.waitForTimeout(1000);
      await waker.close();
      expectedCodeId = RESUME_EXPECT_CODE;
    } else {
      console.log('Neither E2E_GENERATE=1 nor E2E_RESUME_JOB_ID: stopping before making a code.');
      return;
    }

    const started = Date.now();
    let finished: any;
    while (Date.now() - started < 5 * 60_000) {
      const current = ((await storage(context, extensionId, 'jobs')) ?? {})[job.id];
      if (current && current.state !== 'processing' && current.state !== 'submitting') {
        finished = current;
        break;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    check(
      'the restarted worker resumed the job and it finished',
      finished?.state === 'succeeded',
      finished ? `${finished.state} after ${Math.round((Date.now() - started) / 1000)} s` : 'timed out'
    );
    if (!finished) return;
    if (expectedCodeId) {
      check(
        'resending with the saved Idempotency-Key returned the same code, not a new one',
        finished.codeId === expectedCodeId,
        `${finished.codeId} (expected ${expectedCodeId})`
      );
    }

    const worker = currentWorker(context, extensionId);
    const notifications = worker ? await worker.evaluate(() => chrome.notifications.getAll()) : {};
    check(
      'a notification was shown',
      Object.keys(notifications).includes(`job:${job.id}`),
      Object.keys(notifications).join(',')
    );
    const badge = worker ? await worker.evaluate(() => chrome.action.getBadgeText({})) : '';
    check('the badge counts the unseen code', badge === '1', JSON.stringify(badge));

    // ---------------------------------------------------------------------------------------------- result view
    // opened the way a notification click falls back to when the browser can't open the popup itself
    const result = await extensionPage(context, extensionId, `popup.html?job=${job.id}`);
    const image = result.locator('.result-image img');
    await image.waitFor({ timeout: 15_000 });
    await result.waitForFunction(
      () => (document.querySelector('.result-image img') as HTMLImageElement)?.naturalWidth > 0
    );
    check('result shows the finished image', true);
    const shortLink = await result.locator('.short-link a').textContent();
    check('result shows the short link', !!shortLink && shortLink.endsWith(finished.codeId), shortLink ?? '');
    await shot(result, 'popup-result');

    // Playwright can't grant clipboard permissions to extension origins, so stand in for the clipboard and check
    // what the popup writes to it
    // (a string, because the TypeScript loader adds helpers to functions that don't exist in the page)
    await result.evaluate(`
      window.__clipboard = [];
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async (text) => { window.__clipboard.push({ text }); },
          write: async (items) => {
            for (const item of items) {
              const blob = await item.getType('image/png');
              window.__clipboard.push({ type: blob.type, size: blob.size });
            }
          },
        },
      });
    `);
    await result.getByRole('button', { name: 'Copy link' }).click();
    await result.getByText('Link copied').waitFor();
    await result.getByRole('button', { name: 'Copy image' }).click();
    await result.getByText('Image copied').waitFor({ timeout: 20_000 });
    const clip = await result.evaluate(() => (window as any).__clipboard);
    check('Copy link writes the short link', clip[0]?.text === finished.code.shortUrl, clip[0]?.text);
    check(
      'Copy image writes the PNG',
      clip[1]?.type === 'image/png' && clip[1]?.size > 1000,
      `${clip[1]?.type}, ${clip[1]?.size} bytes`
    );

    const downloadPromise = result.waitForEvent('download', { timeout: 20_000 });
    await result.getByRole('button', { name: 'Download PNG' }).click();
    const download = await downloadPromise;
    const saved = path.join(OUT, download.suggestedFilename());
    await download.saveAs(saved);
    const header = fs.readFileSync(saved).subarray(0, 8).toString('hex');
    check(
      'Download PNG saves a PNG',
      header === '89504e470d0a1a0a',
      `${download.suggestedFilename()}, ${fs.statSync(saved).size} bytes`
    );

    const badgeAfter = await currentWorker(context, extensionId)?.evaluate(() => chrome.action.getBadgeText({}));
    check('opening the result clears the badge', badgeAfter === '', JSON.stringify(badgeAfter));

    // ------------------------------------------------------------------------------------------------ recent
    await result.getByRole('tab', { name: 'Recent' }).click();
    await result.locator('.recent-item').first().waitFor({ timeout: 15_000 });
    const recentImages = await result
      .locator('.recent-item img')
      .evaluateAll((items) => items.map((i) => (i as HTMLImageElement).src));
    check(
      'Recent lists the code',
      recentImages.some((src) => src.includes(finished.codeId)),
      `${recentImages.length} codes`
    );
    await shot(result, 'popup-recent');

    // ---------------------------------------------------------------------------------------------- sign out
    await options.reload();
    await options.getByRole('button', { name: 'Sign out' }).click();
    await options.getByText(/Not signed in/).waitFor();
    const auth = await storage(context, extensionId, 'auth');
    check('sign out removes the stored credentials', auth === undefined);
  } finally {
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
    await context.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
