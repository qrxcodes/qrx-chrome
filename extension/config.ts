/** Settings baked in at build time (see build.config.ts and vite.config.extension.ts). */
export const config = {
  env: __QRX_ENV__,
  version: __EXTENSION_VERSION__,
  apiBase: __QRX_API_BASE__,
  issuer: __QRX_ISSUER__,
  /** A pre-registered OAuth client; empty means register dynamically on first sign-in. */
  oauthClientId: __QRX_OAUTH_CLIENT_ID__,
  /** What the extension asks to do: read codes and make codes; offline_access gets a refresh token. */
  scopes: ['qrx:read', 'qrx:generate', 'offline_access'],
  clientName: 'QRX for Chrome',
} as const;

/** The site's own pages the popup links to. */
export const links = {
  home: config.apiBase,
  apiKeys: `${config.apiBase}/developers/keys`,
  privacy: 'https://qrx.codes/privacy',
  support: 'https://qrx.codes/support',
};
