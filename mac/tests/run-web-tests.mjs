// Headless smoke/behaviour tests for the web game, run with Playwright's bundled Chromium.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = resolve(new URL('../game/web', import.meta.url).pathname);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/' || p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, p);
    await stat(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${base}/index.html`);
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 15000 });
check(true, 'page boots and exposes window.__game');
await page.keyboard.press('Space');
await page.waitForTimeout(400);
check(await page.evaluate(() => window.__game.particles() > 0), 'input spawns particles');
check(errors.length === 0, `no page errors (${errors.length})`);
if (errors.length) console.log(errors.join('\n'));

const outDir = process.env.SHOT_DIR;
if (outDir) await page.screenshot({ path: join(outDir, 'smoke.png') });

await browser.close();
server.close();
if (failures.length) { console.error(`\n${failures.length} test(s) failed`); process.exit(1); }
console.log('\nAll web tests passed');
