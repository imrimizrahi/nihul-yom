// Renders the app icons with Playwright: node tools/icon.js
const { chromium } = require('playwright');
const path = require('path');
const out = path.resolve(__dirname, '..', 'icons');
const html = (size, pad) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;width:${size}px;height:${size}px;background:#0B0B10;overflow:hidden}
.w{position:absolute;inset:0;display:grid;place-items:center}
.r{position:absolute;width:${size * (0.78 - pad)}px;height:${size * (0.78 - pad)}px;border-radius:50%;
background:conic-gradient(from 200deg,#FF4D8D,#FFB547,#F2F26B,#4DFFC3,#4DB8FF,#9B6BFF,#FF4D8D);filter:blur(${size * 0.02}px)}
.r2{position:absolute;width:${size * (0.78 - pad) - size * 0.075}px;height:${size * (0.78 - pad) - size * 0.075}px;border-radius:50%;background:#0B0B10}
.g{position:absolute;width:${size * 0.9}px;height:${size * 0.9}px;border-radius:50%;background:radial-gradient(circle,rgba(255,77,141,.28),transparent 60%)}
.t{position:relative;font-family:Heebo,sans-serif;font-weight:900;font-size:${size * (0.26 - pad * 0.3)}px;letter-spacing:-.04em;line-height:1;color:#F2F3F5;direction:rtl;margin-top:${size * 0.01}px}
.d{position:absolute;width:${size * 0.06}px;height:${size * 0.06}px;border-radius:50%;background:#4DFFC3;box-shadow:0 0 ${size * 0.04}px #4DFFC3;
top:${size * (0.11 + pad / 2)}px;left:${size * 0.47}px}</style></head>
<body><div class="w"><div class="g"></div><div class="r"></div><div class="r2"></div><svg class="t" viewBox="0 0 24 24" width="${size*0.34}" height="${size*0.34}"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#F2F3F5" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="d"></div></div></body></html>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [name, size, pad] of [['icon-512.png', 512, 0], ['icon-192.png', 192, 0], ['apple-touch-icon.png', 180, 0], ['icon-maskable-512.png', 512, 0.16]]) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(html(size, pad));
    await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(out, name) });
  }
  await b.close();
})();
