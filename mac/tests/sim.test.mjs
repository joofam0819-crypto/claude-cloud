// Deterministic unit tests for the APPROACH simulation (Node, no browser).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SIM = require('../approach/web/js/sim.js');
const CONTENT = require('../approach/web/js/content.js');

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ', name); } catch (e) { failed++; console.log('FAIL ', name, '\n   ', e.message); } }
const run = (sim, seconds, before) => { const dt = 1 / 60; for (let t = 0; t < seconds; t += dt) { if (before) before(); sim.update(dt); } };
const events = sim => sim.drainEvents().map(e => e.type);

test('same seed => identical runs', () => {
  const a = new SIM.Sim({ seed: 7 }), b = new SIM.Sim({ seed: 7 }); a.startShift(1); b.startShift(1);
  run(a, 30); run(b, 30);
  assert.equal(JSON.stringify(a.aircraft.map(q => [q.id, q.x.toFixed(3), q.y.toFixed(3), q.type])), JSON.stringify(b.aircraft.map(q => [q.id, q.x.toFixed(3), q.y.toFixed(3), q.type])));
  assert.deepEqual(a.airport.runways.map(r => r.heading), b.airport.runways.map(r => r.heading));
});

test('aircraft spawn at the airspace edge and head inward', () => {
  const s = new SIM.Sim({ seed: 3 }); s.startShift(1); run(s, 20);
  assert.ok(s.aircraft.length >= 1);
  for (const a of s.aircraft) assert.ok(Math.hypot(a.x, a.y) <= CONTENT.WORLD.spawnR + 1, 'inside spawn radius');
});

test('resample/smooth keep endpoints and spacing', () => {
  const pts = SIM.resamplePath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }], 7);
  assert.deepEqual(pts[0], { x: 0, y: 0 }); assert.ok(Math.hypot(pts[pts.length - 1].x - 100, pts[pts.length - 1].y - 50) < 1.01);
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); assert.ok(d > 3 && d < 7.01, `spacing ${d}`); }
  const sm = SIM.smoothPath(pts, 2); assert.equal(sm.length, pts.length); assert.deepEqual(sm[0], pts[0]);
});

test('an aligned approach lands and scores; perfect bonus applies', () => {
  const s = new SIM.Sim({ seed: 5 }); s.startShift(1);
  const a = s.spawnAircraft('prop'); const r = s.airport.runways.find(r => r.id === 'B');
  a.x = r.tx - r.dx * 200; a.y = r.ty - r.dy * 200; a.heading = r.heading;
  s.assignPath(a.id, [{ x: a.x, y: a.y }, { x: r.tx, y: r.ty }, { x: r.ex, y: r.ey }]);
  s.drainEvents(); run(s, 12);
  const ev = s.drainEvents(); const land = ev.find(e => e.type === 'land');
  assert.ok(land, 'landed'); assert.equal(land.perfect, true); assert.equal(land.pts, 150); assert.equal(s.landings, 1); assert.equal(s.score, 150);
});

test('misaligned arrival triggers a go-around, wrong runway too', () => {
  const s = new SIM.Sim({ seed: 5 }); s.startShift(1);
  const a = s.spawnAircraft('prop'); const r = s.airport.runways.find(r => r.id === 'B');
  // approach about 55 degrees off the runway heading (outside tolerance, but clearly an attempt)
  const off = 0.95, hx = Math.cos(r.heading + off), hy = Math.sin(r.heading + off);
  a.x = r.tx - hx * 150; a.y = r.ty - hy * 150; a.heading = Math.atan2(hy, hx);
  s.assignPath(a.id, [{ x: a.x, y: a.y }, { x: r.tx, y: r.ty }, { x: r.tx + hx * 60, y: r.ty + hy * 60 }]);
  s.drainEvents(); run(s, 10);
  const ev = s.drainEvents(); assert.ok(ev.some(e => e.type === 'goAround' && e.reason === 'align'), 'go-around for alignment'); assert.equal(s.landings, 0);
  // wrong runway: a jet aligned on runway B
  const j = s.spawnAircraft('jet'); j.x = r.tx - r.dx * 120; j.y = r.ty - r.dy * 120; j.heading = r.heading;
  s.assignPath(j.id, [{ x: j.x, y: j.y }, { x: r.tx, y: r.ty }, { x: r.ex, y: r.ey }]);
  s.drainEvents(); run(s, 8);
  assert.ok(s.drainEvents().some(e => e.type === 'goAround' && e.reason === 'wrong'), 'wrong runway go-around');
});

test('helicopters land on pads from any heading and hover when their path ends', () => {
  const s = new SIM.Sim({ seed: 9 }); s.startShift(1);
  const h = s.spawnAircraft('heli'); const p = s.airport.pads[0];
  h.x = p.x + 120; h.y = p.y + 40; h.heading = 0;
  s.assignPath(h.id, [{ x: h.x, y: h.y }, { x: p.x, y: p.y }]);
  s.drainEvents(); run(s, 12);
  assert.ok(s.drainEvents().some(e => e.type === 'land' && e.dest === 'H'));
  const h2 = s.spawnAircraft('heli'); h2.x = 200; h2.y = 200; s.assignPath(h2.id, [{ x: 200, y: 200 }, { x: 150, y: 150 }]);
  run(s, 8); assert.equal(h2.hover, true); assert.ok(h2.speed < 2, 'hovering slows to a stop');
});

test('collision ends the run; near miss costs 50 and resets the streak', () => {
  const s = new SIM.Sim({ seed: 11 }); s.startShift(1); s.streak = 6; s.mult = 1.5; s.score = 500;
  const a = s.spawnAircraft('jet'), b = s.spawnAircraft('jet');
  a.x = -60; a.y = 0; a.heading = 0; b.x = 60; b.y = 0; b.heading = Math.PI; a.path = null; b.path = null;
  s.drainEvents(); run(s, 0.9);
  let ev = s.drainEvents(); assert.ok(ev.some(e => e.type === 'nearMiss'), 'near miss first'); assert.ok(!ev.some(e => e.type === 'crash'), 'no crash yet'); assert.equal(s.streak, 0); assert.equal(s.score, 450);
  run(s, 1.5); ev = s.drainEvents();
  assert.ok(ev.some(e => e.type === 'crash')); assert.equal(s.state, 'over'); assert.equal(s.overReason, 'crash');
});

test('TCAS upgrade prevents one collision per shift', () => {
  const s = new SIM.Sim({ seed: 11 }); s.upgrades.tcas = 1; s.startShift(1);
  const a = s.spawnAircraft('jet'), b = s.spawnAircraft('jet');
  a.x = -40; a.y = 0; a.heading = 0; b.x = 40; b.y = 0; b.heading = Math.PI; a.path = null; b.path = null;
  s.drainEvents(); run(s, 2.5);
  const ev = s.drainEvents(); assert.ok(ev.some(e => e.type === 'tcas')); assert.ok(!ev.some(e => e.type === 'crash')); assert.equal(s.state, 'running'); assert.equal(s.tcasLeft, 0);
});

test('fuel exhaustion is an incident; three incidents end the run', () => {
  const s = new SIM.Sim({ seed: 2 }); s.startShift(1);
  for (let i = 0; i < 3; i++) { const a = s.spawnAircraft('prop'); a.fuel = 0.05; a.x = 300 - i * 150; a.y = 300; a.heading = 0; }
  s.drainEvents(); run(s, 0.5);
  const ev = s.drainEvents(); assert.equal(ev.filter(e => e.type === 'fuelOut').length, 3); assert.equal(s.state, 'over'); assert.equal(s.overReason, 'incidents');
});

test('storm cells penalise entry and divert aircraft that linger', () => {
  const s = new SIM.Sim({ seed: 4 }); s.startShift(2);
  assert.ok(s.storms.length >= 1);
  const st = s.storms[0]; st.vx = 0; st.vy = 0;
  const a = s.spawnAircraft('heli'); a.x = st.x; a.y = st.y; a.hover = true; a.path = null; a.fuel = 500;
  s.drainEvents(); run(s, 0.2);
  assert.ok(s.drainEvents().some(e => e.type === 'stormEnter'));
  run(s, 7); assert.ok(s.drainEvents().some(e => e.type === 'stormDivert')); assert.equal(s.incidents, 1);
});

test('shift ends when time is up and the sky is clear; upgrades are offered and applied', () => {
  const s = new SIM.Sim({ seed: 8 }); s.startShift(1);
  s.shiftTime = s.cfg.duration + 1; s.aircraft = []; s.shiftLandings = 4; s.drainEvents();
  s.update(1 / 60);
  assert.equal(s.state, 'shiftClear'); assert.equal(s.pendingUpgradeChoices.length, 3); assert.equal(s.score, 80);
  const id = s.pendingUpgradeChoices[0].id; assert.ok(s.chooseUpgrade(id)); assert.equal(s.upgrades[id], 1);
  assert.ok(s.nextShift()); assert.equal(s.shiftIndex, 2); assert.equal(s.state, 'running');
});

test('daily mode: single shift, deterministic by seed, share text', () => {
  const s = new SIM.Sim({ seed: 20261007, daily: true }); s.startShift(1);
  assert.equal(s.cfg.duration, 180);
  s.shiftTime = 181; s.aircraft = []; s.update(1 / 60);
  assert.equal(s.state, 'over'); assert.equal(s.overReason, 'dailyDone'); assert.equal(s.pendingUpgradeChoices, null);
  const txt = s.shareText('ko'); assert.ok(txt.startsWith('APPROACH #')); assert.ok(txt.includes('점수'));
});

test('difficulty curve is monotonic', () => {
  let prev = CONTENT.shiftConfig(1);
  for (let n = 2; n <= 8; n++) { const c = CONTENT.shiftConfig(n); assert.ok(c.interval0 <= prev.interval0); assert.ok(c.maxAirborne >= prev.maxAirborne); prev = c; }
});

test('autopilot clears the first shift on most seeds (balance sanity)', () => {
  let cleared = 0; const N = 12;
  for (let seed = 1; seed <= N; seed++) {
    const sim = new SIM.Sim({ seed }); const ai = new SIM.Autopilot(sim, { sepTime: 12 }); sim.startShift(1);
    let t = 0; while (sim.state === 'running' && t < 400) { ai.update(1 / 30); sim.update(1 / 30); t += 1 / 30; sim.drainEvents(); }
    if (sim.state === 'shiftClear') cleared++;
  }
  assert.ok(cleared >= N * 0.6, `cleared ${cleared}/${N}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
