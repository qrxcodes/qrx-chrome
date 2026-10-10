/**
 * Store images: the 128 store icon, Edge's 300x300 logo, the 440x280 small promo tile and the 1400x560 marquee.
 *
 *   npm run screenshots      (first: the marquee uses the popup capture from test-results/screenshots)
 *   npm run store:assets
 *
 * The art is the QRX logo code and a real QRX code (QRX_PROMO_CODE_IMAGE, default the watercolour lighthouse on
 * qrx.codes), so every code in the images is one QRX made and scans.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { LOGO_CODE_PNG, MARK_SVG, paddedLogo, renderIcon } from './lib/icons';

const OUT = path.resolve('store/assets');
const POPUP_CAPTURE = path.resolve('test-results/screenshots/popup-result.png');
const PROMO_CODE_IMAGE = process.env.QRX_PROMO_CODE_IMAGE ?? 'https://qrx.codes/media/premium/z3ss2y.png';

const HEADLINE = 'Art QR codes for the page you’re on';
const SUBLINE = 'Describe a picture, pick a style. Each code is checked to scan and gets a qrx.to short link.';

const dataUrl = (buffer: Buffer, type = 'image/png') => `data:${type};base64,${buffer.toString('base64')}`;

function tile(width: number, height: number, body: string, css: string) {
  return `<!doctype html><html><head><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif;
      background: radial-gradient(120% 140% at 85% 20%, #26324f 0%, #16171a 55%);
      color: #f4f5f7; position: relative;
    }
    .brand { display: flex; align-items: center; font-weight: 700; letter-spacing: .01em; }
    .brand img { display: block; }
    .art { position: absolute; border-radius: 18px; box-shadow: 0 24px 60px rgba(0,0,0,.45); }
    ${css}
  </style></head><body>${body}</body></html>`;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // icons and logos
  fs.writeFileSync(path.join(OUT, 'icon-128.png'), await renderIcon(128));
  fs.writeFileSync(path.join(OUT, 'edge-logo-300.png'), await paddedLogo(300, 300));
  console.log('✓ icon-128.png, edge-logo-300.png');

  const res = await fetch(PROMO_CODE_IMAGE);
  if (!res.ok) throw new Error(`promo code image: HTTP ${res.status}`);
  const codeArt = dataUrl(Buffer.from(await res.arrayBuffer()));
  const logo = dataUrl(fs.readFileSync(LOGO_CODE_PNG));
  const mark = dataUrl(
    Buffer.from(
      fs
        .readFileSync(MARK_SVG, 'utf8')
        .replace(/#16171a/g, '#f4f5f7')
        .replace('#2453d6', '#6f93ff')
    ),
    'image/svg+xml'
  );
  const popup = fs.existsSync(POPUP_CAPTURE) ? dataUrl(fs.readFileSync(POPUP_CAPTURE)) : undefined;

  const browser = await chromium.launch();
  const render = async (name: string, width: number, height: number, html: string) => {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(html);
    await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
    await page.screenshot({ path: path.join(OUT, name) });
    await page.close();
    console.log(`✓ ${name}`);
  };

  // small promo tile, 440x280
  await render(
    'promo-small-440x280.png',
    440,
    280,
    tile(
      440,
      280,
      `<div class="brand" style="position:absolute;left:26px;top:24px;gap:9px;font-size:22px">
         <img src="${mark}" width="26" height="26">QRX</div>
       <h1 style="position:absolute;left:26px;top:72px;width:250px;font-size:24px;line-height:1.18">${HEADLINE}</h1>
       <p style="position:absolute;left:26px;top:150px;width:230px;font-size:14px;line-height:1.35;color:#c3c8d4">
         Each code is checked to scan.</p>
       <img class="art" src="${codeArt}" style="right:-26px;top:52px;width:176px;height:176px;transform:rotate(4deg)">`,
      ''
    )
  );

  // marquee, 1400x560
  await render(
    'marquee-1400x560.png',
    1400,
    560,
    tile(
      1400,
      560,
      `<div class="brand" style="position:absolute;left:84px;top:70px;gap:14px;font-size:34px">
         <img src="${mark}" width="40" height="40">QRX</div>
       <h1 style="position:absolute;left:84px;top:150px;width:560px;font-size:56px;line-height:1.08">${HEADLINE}</h1>
       <p style="position:absolute;left:84px;top:350px;width:520px;font-size:22px;line-height:1.4;color:#c3c8d4">${SUBLINE}</p>
       <img class="art" src="${logo}" style="left:740px;top:96px;width:300px;height:300px;transform:rotate(-5deg);opacity:.95">
       ${
         popup
           ? `<img class="art" src="${popup}" style="right:84px;top:40px;height:480px;border-radius:14px">`
           : `<img class="art" src="${codeArt}" style="right:110px;top:110px;width:340px;height:340px;transform:rotate(4deg)">`
       }`,
      ''
    )
  );

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
