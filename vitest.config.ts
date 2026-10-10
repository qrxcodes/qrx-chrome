import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __EXTENSION_VERSION__: JSON.stringify('0.0.0-test'),
    __DEV__: 'true',
    __QRX_ENV__: JSON.stringify('dev'),
    __QRX_API_BASE__: JSON.stringify('https://dev.qrx.codes'),
    __QRX_ISSUER__: JSON.stringify('https://issuer.example'),
    __QRX_OAUTH_CLIENT_ID__: JSON.stringify(''),
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
