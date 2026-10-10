/** Shapes from the QRX REST API (https://qrx.codes/v1/openapi.json). */

export type CodeStatus = 'queued' | 'processing' | 'succeeded' | 'failed' | (string & {});

export type Code = {
  id: string;
  object: 'code';
  status: CodeStatus;
  type: string;
  prompt: string;
  style: string | null;
  destination: string | null;
  shortUrl: string | null;
  imageUrl: string | null;
  pageUrl: string;
  error: { message: string } | null;
  createdAt: string;
};

export type List<T> = { object: 'list'; data: T[]; hasMore: boolean; nextCursor: string | null };

export type Style = { id: string; object: 'style'; name: string; previewUrl: string | null };

export type Account = {
  object: 'account';
  plan: string;
  credentials: { type: string; prefix: string | null; environment: string };
};

export type CreateCodeRequest = { prompt: string; destination: string; style?: string };

/** What the popup shows for a failure: a stable problem slug from the API (or our own) and words for people. */
export type ProblemInfo = { type: string; title: string; detail: string; retryAfter?: number };

/** A code the extension asked for. It lives in chrome.storage until it is dismissed, so a closed popup loses nothing. */
export type Job = {
  /** Local id, also the Idempotency-Key sent with the create request. */
  id: string;
  request: CreateCodeRequest;
  createdAt: number;
  /** Set once the API has answered the create request. */
  codeId?: string;
  state: 'submitting' | 'processing' | 'succeeded' | 'failed';
  code?: Code;
  problem?: ProblemInfo;
  /** The user has seen the finished code (in the popup or from the notification). */
  seen?: boolean;
};

export type AuthMethod = 'oauth' | 'apiKey';

export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms. */
  expiresAt: number;
  clientId: string;
  resource: string;
  tokenEndpoint: string;
  revocationEndpoint?: string;
};

export type AuthState =
  { method: 'oauth'; tokens: OAuthTokens; account?: Account } | { method: 'apiKey'; apiKey: string; account?: Account };

/** What the popup and options page may know about the sign-in, without the secrets. */
export type AuthStatus = {
  signedIn: boolean;
  method?: AuthMethod;
  environment?: string;
  keyPrefix?: string | null;
  /** The last sign-in failed or the session expired; words for people. */
  error?: string;
  signingIn?: boolean;
};
