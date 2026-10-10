/**
 * Build-time settings for each QRX environment. `QRX_ENV=dev` builds against dev.qrx.codes and its Clerk instance;
 * `QRX_ENV=prod` (the store build) against qrx.codes. Host permissions are per environment, so the store build never
 * asks for the dev hosts.
 */

export type QrxEnv = 'dev' | 'prod';

export type EnvSettings = {
  /** The QRX site and REST API origin. */
  apiBase: string;
  /** The Clerk OAuth issuer (authorisation server) for sign-in. */
  issuer: string;
  /** Match patterns for host_permissions: the API (which also serves the images) and the Clerk issuer. */
  hostPermissions: string[];
  /** Extension name suffix, so a dev build is easy to tell apart. */
  nameSuffix: string;
  /**
   * The pre-registered Clerk OAuth app (a public client: PKCE, no secret). Empty means the extension registers itself
   * with the authorisation server on first sign-in (dynamic client registration). QRX_OAUTH_CLIENT_ID overrides it.
   */
  oauthClientId: string;
};

export const ENVIRONMENTS: Record<QrxEnv, EnvSettings> = {
  dev: {
    apiBase: 'https://dev.qrx.codes',
    issuer: 'https://summary-bobcat-19.clerk.accounts.dev',
    hostPermissions: ['https://dev.qrx.codes/*', 'https://*.clerk.accounts.dev/*'],
    nameSuffix: ' (dev)',
    // "QRX Chrome extension" on the dev Clerk instance
    oauthClientId: 'jx7gjiU0aXBK7bBb',
  },
  prod: {
    apiBase: 'https://qrx.codes',
    issuer: 'https://clerk.qrx.codes',
    hostPermissions: ['https://qrx.codes/*', 'https://clerk.qrx.codes/*'],
    nameSuffix: '',
    // set once the prod Clerk app exists (see store/README.md)
    oauthClientId: '',
  },
};

/**
 * Public half of the key that fixes the unpacked dev build's extension ID (bcpkdmcioonkndjhpfogabejhemhahge), so its
 * OAuth redirect URI, https://bcpkdmcioonkndjhpfogabejhemhahge.chromiumapp.org/, never changes. Only dev builds carry
 * it: the Chrome Web Store and Edge Add-ons assign their own IDs to the store build.
 */
export const DEV_MANIFEST_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwIgxGIaWSq5fme+bEVLVLH6lomCGEgbsJMTrafv7ZxZ2PPZ59kxUaEg6meKVvVi0VWyCq0u1qzJaHfoGrjb48AlPn5/ABdxJffnoRvulu8Ue5kQxD0ZYW2iwM+QOU2ScpwO5b1Of7qqj/+1MSq9BdZGoS9oZ5dyBJGisioQHlUZI/QeggCxHROU617oH9ifVVBQIPimcPb+at/YB9rtmwA6DKo7McIb1EgoMZcPFjSCjG2PE0b1zKdwTrq+ndKesYgr0N8289ONRZQ3/MN/BeZEfpL8Cp0cjgkKojVtCWNgNqhl93wzidpj7EiVR8YTyWwddnOGZVyQlWNxhcf0WKQIDAQAB';

export function resolveEnv(value = process.env.QRX_ENV): QrxEnv {
  if (!value) return 'prod';
  if (value === 'dev' || value === 'prod') return value;
  throw new Error(`QRX_ENV must be "dev" or "prod", not "${value}"`);
}
