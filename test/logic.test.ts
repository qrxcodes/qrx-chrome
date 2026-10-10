import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseRedirect } from '../extension/lib/auth';
import { prune, stateFromCode } from '../extension/lib/jobs';
import { createPkcePair, randomString } from '../extension/lib/pkce';
import { describeProblem, isTransient, problemFromResponse, problemSlug } from '../extension/lib/problem';
import { isLinkable, sitePreviewUrl } from '../extension/popup/CreateForm';
import type { Code, Job } from '../extension/lib/types';

describe('PKCE', () => {
  it('makes an S256 challenge from the verifier', async () => {
    const { verifier, challenge } = await createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(challenge).toBe(expected);
  });

  it('makes url-safe random strings', () => {
    expect(randomString(16)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(randomString()).not.toBe(randomString());
  });
});

describe('parseRedirect', () => {
  const base = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/';

  it('returns the code when the state matches', () => {
    expect(parseRedirect(`${base}?code=abc&state=s1`, 's1')).toBe('abc');
  });

  it('refuses a mismatched state', () => {
    expect(() => parseRedirect(`${base}?code=abc&state=other`, 's1')).toThrow(/did not match/);
  });

  it("reports the server's error", () => {
    expect(() => parseRedirect(`${base}?error=access_denied&error_description=Denied&state=s1`, 's1')).toThrow(
      'Denied'
    );
  });
});

describe('problems', () => {
  it('reads the slug from the problem type URI', () => {
    expect(problemSlug('https://qrx.codes/developers/docs/errors#daily-limit')).toBe('daily-limit');
    expect(problemSlug(undefined)).toBe('unknown');
  });

  it('parses an RFC 9457 response with Retry-After and field errors', async () => {
    const res = new Response(
      JSON.stringify({
        type: 'https://qrx.codes/developers/docs/errors#invalid-request',
        title: 'Invalid request',
        status: 400,
        detail: 'The request is not valid.',
        errors: [{ field: 'destination', message: 'must be a URL' }],
      }),
      { status: 400, headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '7' } }
    );
    const err = await problemFromResponse(res);
    expect(err.status).toBe(400);
    expect(err.problem).toMatchObject({ type: 'invalid-request', retryAfter: 7 });
    expect(err.problem.detail).toContain('destination: must be a URL');
  });

  it('treats a bare 401 as unauthorized', async () => {
    const err = await problemFromResponse(new Response('nope', { status: 401, statusText: 'Unauthorized' }));
    expect(err.problem.type).toBe('unauthorized');
  });

  it('retries only transient problems', () => {
    expect(isTransient({ type: 'rate-limited', title: '', detail: '' })).toBe(true);
    expect(isTransient({ type: 'network', title: '', detail: '' })).toBe(true);
    expect(isTransient({ type: 'daily-limit', title: '', detail: '' })).toBe(false);
    expect(isTransient({ type: 'invalid-request', title: '', detail: '' })).toBe(false);
  });

  it('never mentions prices or plan numbers for the daily limit', () => {
    const { title, detail } = describeProblem({ type: 'daily-limit', title: 'x', detail: 'Free plan: 42 a day' });
    expect(`${title} ${detail}`).not.toMatch(/\$|\d/);
  });
});

describe('jobs', () => {
  const code = (status: string): Code => ({
    id: 'abc123',
    object: 'code',
    status,
    type: 'url',
    prompt: 'p',
    style: null,
    destination: 'https://example.com',
    shortUrl: 'https://qrx.to/abc123',
    imageUrl: null,
    pageUrl: 'https://qrx.codes/view/abc123',
    error: null,
    createdAt: new Date().toISOString(),
  });

  it('treats unknown statuses as still in progress', () => {
    expect(stateFromCode(code('succeeded'))).toBe('succeeded');
    expect(stateFromCode(code('failed'))).toBe('failed');
    expect(stateFromCode(code('queued'))).toBe('processing');
    expect(stateFromCode(code('something-new'))).toBe('processing');
  });

  it('prunes old finished jobs but never pending ones', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const job = (id: string, state: Job['state'], age: number): Job => ({
      id,
      state,
      createdAt: now - age,
      request: { prompt: 'p', destination: 'https://example.com' },
    });
    const jobs: Record<string, Job> = {
      old: job('old', 'succeeded', 8 * day),
      recent: job('recent', 'succeeded', day),
      pending: job('pending', 'processing', 30 * day),
    };
    for (let i = 0; i < 25; i++) jobs[`f${i}`] = job(`f${i}`, 'failed', i * 1000);
    prune(jobs, now);
    expect(jobs.old).toBeUndefined();
    expect(jobs.pending).toBeDefined();
    expect(Object.values(jobs).filter((j) => j.state !== 'processing')).toHaveLength(20);
  });
});

describe('links', () => {
  it('accepts only absolute http and https links', () => {
    expect(isLinkable('https://example.com/menu')).toBe(true);
    expect(isLinkable('http://example.com')).toBe(true);
    expect(isLinkable('chrome://extensions')).toBe(false);
    expect(isLinkable('file:///C:/x.html')).toBe(false);
    expect(isLinkable('https://exa mple.com')).toBe(false);
    expect(isLinkable(undefined)).toBe(false);
  });
});

describe('style previews', () => {
  it("maps the API's preview URL to the site's own preview image", () => {
    expect(sitePreviewUrl('https://qrx.codes/images/styles/watercolor.png')).toBe(
      'https://qrx.codes/img/styles/watercolor-192.webp'
    );
    expect(sitePreviewUrl('https://qrx.codes/img/styles/watercolor-192.webp')).toBeUndefined();
  });
});
