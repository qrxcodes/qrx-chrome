/**
 * Zips a built extension for upload: the same file goes to the Chrome Web Store and to Edge Add-ons.
 *
 *   npm run build:extension && npm run zip          -> release/qrx-extension-<version>.zip
 *   ZIP_SOURCE=dist/extension-dev npm run zip       -> release/qrx-extension-<version>-dev.zip
 */
import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';

const source = path.resolve(process.env.ZIP_SOURCE ?? 'dist/extension');
const manifestPath = path.join(source, 'manifest.json');
if (!fs.existsSync(manifestPath)) throw new Error(`No build at ${source}. Run npm run build:extension first.`);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
  version: string;
  key?: string;
  host_permissions?: string[];
};
const isDev = manifest.host_permissions?.some((host) => host.includes('dev.qrx.codes')) ?? false;
if (!isDev && manifest.key) {
  throw new Error('The store build must not carry a manifest key: the stores assign the extension ID.');
}

const outDir = path.resolve('release');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `qrx-extension-${manifest.version}${isDev ? '-dev' : ''}.zip`);
const output = fs.createWriteStream(outFile);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => console.log(`✓ ${path.relative(process.cwd(), outFile)} (${archive.pointer()} bytes)`));
archive.on('error', (err) => {
  throw err;
});
archive.pipe(output);
// manifest.json at the root of the zip, as both stores require
archive.directory(source, false);
await archive.finalize();
