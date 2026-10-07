// Renders tools/icon.svg into the PNG icons used by pwa/ (run once when the icon changes).
// Usage: node haru/tools/make-icons.js   (needs Playwright + Chromium)
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
const out = path.join(__dirname, '..', 'pwa', 'icons');
const jobs = [
  { file: 'apple-touch-icon.png', size: 180, radius: 0, scale: 1 },
  { file: 'icon-192.png', size: 192, radius: 0.22, scale: 1 },
  { file: 'icon-512.png', size: 512, radius: 0.22, scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, radius: 0, scale: 0.8 },
];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const j of jobs) {
    await page.setViewportSize({ width: j.size, height: j.size });
    const inner = svg.replace('<svg ', `<svg width="${j.size}" height="${j.size}" `);
    await page.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${j.size}px;height:${j.size}px;border-radius:${j.radius * 100}%;overflow:hidden;background:#2A57C9;display:grid;place-items:center"><div style="transform:scale(${j.scale});width:${j.size}px;height:${j.size}px">${inner}</div></div></body></html>`);
    await page.screenshot({ path: path.join(out, j.file), omitBackground: true });
    console.log('wrote', j.file);
  }
  await browser.close();
})();
