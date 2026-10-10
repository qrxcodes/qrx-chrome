import { config } from '../config';
import { ApiError, problemFromResponse } from './problem';
import type { Account, Code, CreateCodeRequest, List, Style } from './types';

/**
 * The QRX REST API (`/v1`). Every call goes through the service worker, which holds the credentials; the popup only
 * sends messages. Extension requests to a host in host_permissions are not subject to CORS, so the API needs no change.
 */

export type BearerSource = {
  /** A token or API key for the next request; null when signed out. */
  get(): Promise<string | null>;
  /** After a 401: a fresh token, or null when the session can't be renewed (the caller then signs out). */
  renew(): Promise<string | null>;
};

let bearerSource: BearerSource | undefined;

export function setBearerSource(source: BearerSource) {
  bearerSource = source;
}

const notSignedIn = () =>
  new ApiError(401, { type: 'unauthorized', title: 'Not signed in', detail: 'Sign in to QRX first.' });

/** One request with an explicit bearer: used to check new credentials before they are saved. */
export async function requestWith(bearer: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${bearer}`);
  headers.set('Accept', 'application/json');
  return fetch(`${config.apiBase}${path}`, { ...init, headers });
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  if (!bearerSource) throw notSignedIn();
  const bearer = await bearerSource.get();
  if (!bearer) throw notSignedIn();
  let res = await requestWith(bearer, path, init);
  if (res.status === 401) {
    const renewed = await bearerSource.renew();
    if (!renewed) throw await problemFromResponse(res);
    res = await requestWith(renewed, path, init);
  }
  if (!res.ok) throw await problemFromResponse(res);
  return res;
}

export async function fetchAccount(bearer: string): Promise<Account> {
  const res = await requestWith(bearer, '/v1/account');
  if (!res.ok) throw await problemFromResponse(res);
  return (await res.json()) as Account;
}

export const api = {
  async createCode(body: CreateCodeRequest, idempotencyKey: string): Promise<Code> {
    const res = await request('/v1/codes?wait=0', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    });
    return (await res.json()) as Code;
  },

  /** Waits up to `wait` seconds for the code to finish; kept under the service worker's 30 s fetch limit. */
  async getCode(id: string, wait = 0): Promise<Code> {
    const res = await request(`/v1/codes/${encodeURIComponent(id)}?wait=${wait}`);
    return (await res.json()) as Code;
  },

  async listCodes(cursor?: string, limit = 9): Promise<List<Code>> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set('cursor', cursor);
    const res = await request(`/v1/codes?${query}`);
    return (await res.json()) as List<Code>;
  },

  async listStyles(): Promise<List<Style>> {
    const res = await request('/v1/styles');
    return (await res.json()) as List<Style>;
  },

  async account(): Promise<Account> {
    const res = await request('/v1/account');
    return (await res.json()) as Account;
  },
};
