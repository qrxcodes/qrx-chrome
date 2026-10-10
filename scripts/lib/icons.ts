import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
export const MARK_SVG = path.join(ROOT, 'public/qrx-mark.svg');
export const LOGO_CODE_PNG = path.join(ROOT, 'public/qrx-code-512.png');

async function roundedLogo(size: number): Promise<Buffer> {
  const radius = Math.round(size * 0.14);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></svg>`
  );
  return sharp(LOGO_CODE_PNG)
    .resize(size, size)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** The logo code with transparent padding: `art` px of artwork centred in a `size` px square. */
export async function paddedLogo(size: number, art: number): Promise<Buffer> {
  const pad = Math.round((size - art) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await roundedLogo(art), left: pad, top: pad }])
    .png()
    .toBuffer();
}

/**
 * Toolbar icons (16/32/48) are the QRX mark on a white rounded tile, so they read on light and dark toolbars. The
 * 128 icon (install dialog, store, extensions page) is the QRX logo code: 96x96 artwork with 16px transparent padding,
 * as the Chrome Web Store asks.
 */
export async function renderIcon(size: number): Promise<Buffer> {
  if (size >= 128) return paddedLogo(size, Math.round((size * 96) / 128));
  const radius = Math.max(2, Math.round(size * 0.2));
  const inset = Math.max(1, Math.round(size * 0.1));
  const tile = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#ffffff"/></svg>`
  );
  const mark = await sharp(MARK_SVG, { density: 384 })
    .resize(size - inset * 2, size - inset * 2)
    .png()
    .toBuffer();
  return sharp(tile)
    .composite([{ input: mark, left: inset, top: inset }])
    .png()
    .toBuffer();
}
