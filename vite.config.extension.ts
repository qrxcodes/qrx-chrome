import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx, type ManifestV3Export } from '@crxjs/vite-plugin';
import path from 'path';
import fs from 'fs';
import manifestJson from './manifest.json';
import { DEV_MANIFEST_KEY, ENVIRONMENTS, resolveEnv } from './build.config';
import { renderIcon } from './scripts/lib/icons';

const qrxEnv = resolveEnv();
const env = ENVIRONMENTS[qrxEnv];
const isProd = process.env.NODE_ENV === 'production' || process.env.CI === 'true';

// Version priority: EXTENSION_VERSION env var > manifest.json
const extensionVersion = process.env.EXTENSION_VERSION || manifestJson.version;

// The pre-registered Clerk OAuth client for this environment. Without one, the extension registers itself with the
// authorisation server (dynamic client registration) the first time someone signs in.
const oauthClientId = process.env.QRX_OAUTH_CLIENT_ID || env.oauthClientId;

// The manifest key fixes the extension ID. Dev builds use the repo's dev key; a store build carries none unless
// QRX_MANIFEST_KEY is set (for example the public key the Chrome Web Store dashboard shows, for local testing).
const manifestKey = process.env.QRX_MANIFEST_KEY || (qrxEnv === 'dev' ? DEV_MANIFEST_KEY : '');

const ICON_SIZES = [16, 32, 48, 128];

function generateIcons() {
  return {
    name: 'generate-icons',
    async buildStart() {
      const iconsDir = path.resolve(__dirname, 'extension/icons');
      fs.mkdirSync(iconsDir, { recursive: true });
      await Promise.all(
        ICON_SIZES.map(async (size) =>
          fs.promises.writeFile(path.join(iconsDir, `icon-${size}.png`), await renderIcon(size))
        )
      );
      console.log(`✓ Generated ${ICON_SIZES.length} icon sizes to extension/icons/`);
    },
  };
}

const manifest = {
  ...manifestJson,
  name: `${manifestJson.name}${env.nameSuffix}`,
  version: extensionVersion,
  host_permissions: env.hostPermissions,
  action: {
    ...manifestJson.action,
    default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png' },
  },
  ...(manifestKey ? { key: manifestKey } : {}),
} as unknown as ManifestV3Export;

export default defineConfig({
  base: './',
  root: path.resolve(__dirname, 'extension'),
  publicDir: false,
  define: {
    __EXTENSION_VERSION__: JSON.stringify(extensionVersion),
    __DEV__: JSON.stringify(!isProd),
    __QRX_ENV__: JSON.stringify(qrxEnv),
    __QRX_API_BASE__: JSON.stringify(env.apiBase),
    __QRX_ISSUER__: JSON.stringify(env.issuer),
    __QRX_OAUTH_CLIENT_ID__: JSON.stringify(oauthClientId),
  },
  plugins: [react(), generateIcons(), crx({ manifest })],
  esbuild: {
    drop: isProd ? ['debugger'] : [],
  },
  build: {
    outDir: path.resolve(__dirname, qrxEnv === 'dev' ? 'dist/extension-dev' : 'dist/extension'),
    emptyOutDir: true,
    sourcemap: false,
  },
});
