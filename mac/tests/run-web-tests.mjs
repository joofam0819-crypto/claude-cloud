// Headless browser tests for APPROACH (Playwright + bundled Chromium). Run after sim.test.mjs.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = resolve(new URL('../approach/web', import.meta.url).pathname);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/' || p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, p); await stat(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${base}/index.html`);
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 15000 });
check(true, 'page boots and exposes window.__game');
check((await page.textContent('#btn-start')).includes('근무 시작'), 'Korean UI strings applied for ko-KR locale');
check(await page.evaluate(() => window.__game.game.attract && window.__game.game.attract.sim.state === 'running'), 'attract mode plays behind the title');

await page.click('#btn-start');
check(await page.evaluate(() => window.__game.mode === 'playing' && window.__game.sim.state === 'running'), 'start button begins a run');
await page.evaluate(() => window.__game.step(12));

// draw a path with the mouse from a fixed-wing aircraft to its runway
const info = await page.evaluate(() => {
  const s = window.__game.sim; const a = s.aircraft.find(q => q.state === 'flying' && q.dest !== 'H') || s.spawnAircraft('prop');
  const r = s.airport.runways.find(r => r.id === a.dest); return { id: a.id, ax: a.x, ay: a.y, r: { tx: r.tx, ty: r.ty, dx: r.dx, dy: r.dy } };
});
const pts = []; const fx = info.r.tx - info.r.dx * 140, fy = info.r.ty - info.r.dy * 140;
for (let i = 0; i <= 25; i++) { const t = i / 25; pts.push({ x: info.ax + (fx - info.ax) * t, y: info.ay + (fy - info.ay) * t }); }
for (let i = 1; i <= 8; i++) pts.push({ x: fx + info.r.dx * (140 * i / 8 + 10), y: fy + info.r.dy * (140 * i / 8 + 10) });
const scr = await page.evaluate(pts => pts.map(p => window.__game.toScreen(p.x, p.y)), pts);
await page.mouse.move(scr[0].x, scr[0].y); await page.mouse.down();
for (const p of scr.slice(1)) await page.mouse.move(p.x, p.y, { steps: 2 });
check(await page.evaluate(() => !!window.__game.game.drawing), 'dragging from an aircraft starts a path');
await page.mouse.up();
check(await page.evaluate(id => { const a = window.__game.sim.aircraft.find(q => q.id === id); return !!(a && a.path && a.path.length > 2); }, info.id), 'releasing assigns the path to the aircraft');
const flight = await page.evaluate(id => { const g = window.__game; for (let t = 0; t < 60; t += 0.5) { g.step(0.5); const a = g.sim.aircraft.find(q => q.id === id); if (!a || a.state !== 'flying') break; } return { landings: g.sim.landings, score: g.sim.score }; }, info.id);
check(flight.landings >= 1 && flight.score >= 100, `the aircraft lands and scores (${flight.landings} landing, ${flight.score} pts)`);
check(await page.evaluate(() => window.__game.particles() >= 0 && document.getElementById('hud').classList.contains('on')), 'HUD is visible during play');

// pause / resume via keyboard
await page.keyboard.press('Escape'); check(await page.evaluate(() => window.__game.mode === 'paused'), 'Escape pauses');
await page.keyboard.press('Escape'); check(await page.evaluate(() => window.__game.mode === 'playing'), 'Escape resumes');

// force the shift to end -> upgrade screen -> pick with keyboard
await page.evaluate(() => { const g = window.__game.game; g.sim.shiftTime = g.sim.cfg.duration + 1; for (const a of g.sim.aircraft) a.state = 'gone'; g.update(1 / 60); g.update(1 / 60); });
check(await page.evaluate(() => window.__game.mode === 'upgrade' && document.querySelectorAll('#upgrade .card').length === 3), 'shift clear shows three upgrade cards');
await page.keyboard.press('Digit2');
check(await page.evaluate(() => window.__game.mode === 'playing' && window.__game.sim.shiftIndex === 2 && Object.keys(window.__game.sim.upgrades).length === 1), 'keyboard pick applies the upgrade and starts shift 2');

// crash -> game over screen -> restart
await page.evaluate(() => { const g = window.__game.game; g.sim.gameOver('crash'); g.mode = 'over'; g.overTimer = 0; g.update(1 / 60); g.update(1 / 60); });
check(await page.evaluate(() => document.getElementById('over').classList.contains('on')), 'game over screen appears after a crash');
check(await page.evaluate(() => (JSON.parse(localStorage.getItem('macgame.save.v1') || '{}').totalRuns || 0) >= 1), 'progress is saved to localStorage');
await page.click('#btn-over-restart');
check(await page.evaluate(() => window.__game.mode === 'playing' && window.__game.sim.shiftIndex === 1), 'restart begins a fresh run');

// daily mode
await page.evaluate(() => window.__game.game.quitToTitle());
await page.click('#btn-daily');
const daily = await page.evaluate(() => ({ daily: window.__game.sim.daily, dur: window.__game.sim.cfg.duration }));
check(daily.daily === true && daily.dur === 180, 'daily shift is a single 3-minute shift');

check(errors.length === 0, `no page errors (${errors.length})`);
if (errors.length) console.log(errors.join('\n'));
const outDir = process.env.SHOT_DIR;
if (outDir) await page.screenshot({ path: join(outDir, 'approach-play.png') });
await browser.close(); server.close();
if (failures.length) { console.error(`\n${failures.length} test(s) failed`); process.exit(1); }
console.log('\nAll web tests passed');
