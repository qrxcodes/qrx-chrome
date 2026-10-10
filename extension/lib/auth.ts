import { config } from '../config';
import { fetchAccount, setBearerSource } from './api';
import { createPkcePair, randomString } from './pkce';
import { ApiError, toProblem } from './problem';
import { getStored, serialised, setStored } from './storage';
import type { AuthState, AuthStatus, OAuthTokens } from './types';

/**
 * Sign-in with QRX: OAuth 2.1 authorisation code + PKCE against QRX's Clerk instance, run entirely in the service
 * worker with chrome.identity.launchWebAuthFlow. The popup closes as soon as the sign-in window takes focus, so it only
 * asks the worker to start; the worker finishes the exchange and saves the tokens whether or not the popup is open.
 *
 * An API key (from qrx.codes/developers/keys) pasted on the options page is the fallback.
 */

type ServerMetadata = {
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint?: string;
  registration_endpoint?: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

/** Renew this long before the access token expires. */
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

/** The redirect URI for this browser and extension ID: https://<extension-id>.chromiumapp.org/ in Chrome and Edge. */
export const redirectUri = () => chrome.identity.getRedirectURL();

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * The resource (RFC 8707) to ask a token for: the REST API, `<origin>/v1`, as its protected resource metadata names it.
 * The API accepts a token at /v1 only when its audience is that resource, so it goes on both the authorisation and the
 * token requests.
 */
export async function discoverResource(): Promise<string> {
  const metadata = await getJson<{ resource?: string }>(`${config.apiBase}/.well-known/oauth-protected-resource/v1`);
  return metadata?.resource ?? `${config.apiBase}/v1`;
}

async function serverMetadata(): Promise<ServerMetadata> {
  const issuer = config.issuer.replace(/\/$/, '');
  const metadata =
    (await getJson<ServerMetadata>(`${issuer}/.well-known/oauth-authorization-server`)) ??
    (await getJson<ServerMetadata>(`${issuer}/.well-known/openid-configuration`));
  if (!metadata?.authorization_endpoint || !metadata.token_endpoint) {
    throw new Error("Couldn't reach the QRX sign-in service. Check your connection and try again.");
  }
  return metadata;
}

/** The OAuth client: the pre-registered one from the build, or one this extension registered for itself. */
async function clientId(metadata: ServerMetadata, redirect: string): Promise<string> {
  if (config.oauthClientId) return config.oauthClientId;
  const key = `${config.issuer} ${redirect}`;
  const known = (await getStored('oauthClients')) ?? {};
  if (known[key]) return known[key];
  if (!metadata.registration_endpoint) throw new Error('Sign-in is not set up for this build yet.');
  const res = await fetch(metadata.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_name: config.clientName,
      redirect_uris: [redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: config.scopes.join(' '),
    }),
  });
  if (!res.ok) throw new Error(`Couldn't register with the QRX sign-in service (HTTP ${res.status}).`);
  const registered = (await res.json()) as { client_id?: string };
  if (!registered.client_id) throw new Error('The QRX sign-in service gave no client id.');
  await setStored('oauthClients', { ...known, [key]: registered.client_id });
  return registered.client_id;
}

async function tokenRequest(endpoint: string, params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || `Sign-in failed (HTTP ${res.status}).`);
  }
  return body;
}

function tokensFrom(
  response: TokenResponse,
  base: Omit<OAuthTokens, 'accessToken' | 'refreshToken' | 'expiresAt'>,
  previousRefresh?: string
): OAuthTokens {
  return {
    ...base,
    accessToken: response.access_token,
    // refresh tokens rotate; keep the old one only if the server sent none
    refreshToken: response.refresh_token ?? previousRefresh,
    expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
  };
}

/** Parses the redirect the sign-in window ended on: the code, after checking state; or the server's error. */
export function parseRedirect(responseUrl: string, expectedState: string): string {
  const url = new URL(responseUrl);
  const params = url.searchParams;
  if (params.get('error')) {
    throw new Error(params.get('error_description') || `Sign-in failed: ${params.get('error')}`);
  }
  if (params.get('state') !== expectedState) throw new Error('Sign-in failed: the response did not match the request.');
  const code = params.get('code');
  if (!code) throw new Error('Sign-in failed: no authorisation code came back.');
  return code;
}

function isCancelled(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return /did not approve|user cancel|canceled|cancelled|closed/i.test(message);
}

let signInInFlight: Promise<AuthStatus> | undefined;

export function signIn(): Promise<AuthStatus> {
  signInInFlight ??= runSignIn().finally(() => (signInInFlight = undefined));
  return signInInFlight;
}

async function runSignIn(): Promise<AuthStatus> {
  await setStored('authError', undefined);
  await setStored('signingIn', true);
  // Chrome stops an idle worker after 30 s; an extension API call resets that timer, so a slow sign-in isn't cut off
  const keepAlive = setInterval(() => void chrome.runtime.getPlatformInfo(), 20_000);
  try {
    const redirect = redirectUri();
    const [metadata, resource] = await Promise.all([serverMetadata(), discoverResource()]);
    const client = await clientId(metadata, redirect);
    const { verifier, challenge } = await createPkcePair();
    const state = randomString(16);
    const authorizeUrl = new URL(metadata.authorization_endpoint);
    authorizeUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: client,
      redirect_uri: redirect,
      scope: config.scopes.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource,
    }).toString();

    const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authorizeUrl.toString(), interactive: true });
    if (!responseUrl) throw new Error('Sign-in was cancelled.');
    const code = parseRedirect(responseUrl, state);

    const response = await tokenRequest(metadata.token_endpoint, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect,
      client_id: client,
      code_verifier: verifier,
      resource,
    });
    const tokens = tokensFrom(response, {
      clientId: client,
      resource,
      tokenEndpoint: metadata.token_endpoint,
      revocationEndpoint: metadata.revocation_endpoint,
    });
    const account = await fetchAccount(tokens.accessToken);
    await setStored('auth', { method: 'oauth', tokens, account });
    return status();
  } catch (err) {
    const message = isCancelled(err) ? undefined : toProblem(err).detail || String(err);
    await setStored('authError', message);
    return status();
  } finally {
    clearInterval(keepAlive);
    await setStored('signingIn', undefined);
  }
}

/** Saves an API key after checking it against the API. */
export async function saveApiKey(apiKey: string): Promise<AuthStatus> {
  const key = apiKey.trim();
  if (!/^qrx_[A-Za-z0-9_]+$/.test(key)) throw new Error('That doesn’t look like a QRX API key (it starts with qrx_).');
  try {
    const account = await fetchAccount(key);
    await setStored('auth', { method: 'apiKey', apiKey: key, account });
    await setStored('authError', undefined);
    return status();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) throw new Error('QRX did not accept that API key.');
    throw err;
  }
}

export async function signOut(reason?: string): Promise<void> {
  const auth = await getStored('auth');
  await setStored('auth', undefined);
  await setStored('authError', reason);
  if (auth?.method === 'oauth' && auth.tokens.revocationEndpoint && auth.tokens.refreshToken) {
    // best effort: the tokens are already gone from this browser
    fetch(auth.tokens.revocationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: auth.tokens.refreshToken,
        token_type_hint: 'refresh_token',
        client_id: auth.tokens.clientId,
      }),
    }).catch(() => undefined);
  }
}

/** Refreshes the access token once at a time; null (and signed out) when the refresh token no longer works. */
function refresh(force: boolean): Promise<string | null> {
  return serialised(async () => {
    const auth = await getStored('auth');
    if (!auth) return null;
    if (auth.method === 'apiKey') return force ? null : auth.apiKey;
    const { tokens } = auth;
    if (!force && tokens.expiresAt - REFRESH_MARGIN_MS > Date.now()) return tokens.accessToken;
    if (!tokens.refreshToken) return null;
    try {
      const response = await tokenRequest(tokens.tokenEndpoint, {
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
        client_id: tokens.clientId,
        resource: tokens.resource,
      });
      const next = tokensFrom(response, tokens, tokens.refreshToken);
      await setStored('auth', { ...auth, tokens: next });
      return next.accessToken;
    } catch (err) {
      if (err instanceof TypeError) throw err; // offline: keep the session and let the caller retry later
      return null;
    }
  });
}

setBearerSource({
  async get() {
    const auth = await getStored('auth');
    if (!auth) return null;
    if (auth.method === 'apiKey') return auth.apiKey;
    if (auth.tokens.expiresAt - REFRESH_MARGIN_MS > Date.now()) return auth.tokens.accessToken;
    const token = await refresh(false);
    if (!token) await signOut('Your QRX session ended. Sign in again.');
    return token;
  },
  async renew() {
    const auth = await getStored('auth');
    const token = auth?.method === 'oauth' ? await refresh(true) : null;
    if (!token) {
      await signOut(
        auth?.method === 'apiKey'
          ? 'QRX no longer accepts the saved API key.'
          : 'Your QRX session ended. Sign in again.'
      );
    }
    return token;
  },
});

export async function status(): Promise<AuthStatus> {
  const [auth, error, signingIn] = await Promise.all([
    getStored('auth') as Promise<AuthState | undefined>,
    getStored('authError'),
    getStored('signingIn'),
  ]);
  return {
    signedIn: !!auth,
    method: auth?.method,
    environment: auth?.account?.credentials.environment,
    keyPrefix: auth?.method === 'apiKey' ? auth.account?.credentials.prefix : undefined,
    error,
    signingIn: !!signingIn,
  };
}
