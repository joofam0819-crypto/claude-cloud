/* APPROACH — deterministic simulation core. No DOM, no canvas: runs in the browser and in Node tests. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./content.js'), require('./rng.js'));
  } else {
    root.SIM = factory(CONTENT, { RNG: RNG, hashString: hashString });   // classic scripts share the global lexical scope
  }
})(typeof self !== 'undefined' ? self : this, function (CONTENT, rngMod) {
  const { WORLD, AIRCRAFT, shiftConfig, CALLSIGNS } = CONTENT;
  const RNG = rngMod.RNG;
  const TAU = Math.PI * 2;

  const norm = a => { a = a % TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- airport layout ---------- */
  function makeAirport(rng, cfg) {
    const wind = rng.range(0, TAU);                 // wind FROM this direction; aircraft land INTO the wind
    const landHeading = norm(wind + Math.PI);        // movement direction while landing
    const runways = [];
    // Runway A: long, near the centre, rotated with the wind. Runway B crosses at an angle.
    runways.push({ id: 'A', x: rng.range(-40, 40), y: rng.range(-30, 30), heading: landHeading, length: 150, width: 16, busy: 0, color: CONTENT.DEST_COLORS.A });
    const bAngle = norm(landHeading + rng.pick([1, -1]) * rng.range(0.9, 1.6));
    runways.push({ id: 'B', x: rng.range(-120, 120), y: rng.range(-120, 120), heading: bAngle, length: 110, width: 13, busy: 0, color: CONTENT.DEST_COLORS.B });
    if (cfg.runwayC) {
      const cAngle = norm(landHeading + rng.pick([1, -1]) * rng.range(0.5, 1.2) + Math.PI);
      runways.push({ id: 'C', x: rng.range(-200, 200), y: rng.range(-200, 200), heading: cAngle, length: 110, width: 13, busy: 0, color: CONTENT.DEST_COLORS.B, acceptsB: true });
    }
    for (const r of runways) {
      const dx = Math.cos(r.heading), dy = Math.sin(r.heading);
      r.dx = dx; r.dy = dy;
      r.tx = r.x - dx * r.length / 2; r.ty = r.y - dy * r.length / 2;   // threshold (approach end)
      r.ex = r.x + dx * r.length / 2; r.ey = r.y + dy * r.length / 2;   // far end
    }
    const pads = [];
    const padAngle = rng.range(0, TAU);
    pads.push({ id: 'H', x: Math.cos(padAngle) * rng.range(150, 230), y: Math.sin(padAngle) * rng.range(150, 230), radius: 17, busy: 0, color: CONTENT.DEST_COLORS.H });
    if (cfg.secondPad) pads.push({ id: 'H2', x: Math.cos(padAngle + Math.PI) * rng.range(150, 230), y: Math.sin(padAngle + Math.PI) * rng.range(150, 230), radius: 17, busy: 0, color: CONTENT.DEST_COLORS.H });
    // keep pads away from runways
    for (const p of pads) for (const r of runways) {
      const d = pointSegDist(p, { x: r.tx, y: r.ty }, { x: r.ex, y: r.ey });
      if (d < 70) { const ang = Math.atan2(p.y - r.y, p.x - r.x); p.x = r.x + Math.cos(ang) * 140; p.y = r.y + Math.sin(ang) * 140; }
    }
    return { wind, landHeading, runways, pads };
  }

  function pointSegDist(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y, l2 = abx * abx + aby * aby;
    let t = l2 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
  }

  /* ---------- path utilities ---------- */
  function resamplePath(points, spacing) {
    if (points.length < 2) return points.slice();
    const out = [points[0]];
    let carry = 0;
    for (let i = 1; i < points.length; i++) {
      let a = out[out.length - 1], b = points[i];
      let d = dist(a, b);
      while (d >= spacing - carry) {
        const t = (spacing - carry) / d;
        const n = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        out.push(n); a = n; d = dist(a, b); carry = 0;
      }
      carry += d;
    }
    const last = points[points.length - 1];
    if (dist(out[out.length - 1], last) > 1) out.push({ x: last.x, y: last.y });
    return out;
  }

  function smoothPath(points, passes = 2) {
    let p = points;
    for (let k = 0; k < passes; k++) {
      if (p.length < 3) return p;
      const q = [p[0]];
      for (let i = 1; i < p.length - 1; i++) q.push({ x: (p[i - 1].x + 2 * p[i].x + p[i + 1].x) / 4, y: (p[i - 1].y + 2 * p[i].y + p[i + 1].y) / 4 });
      q.push(p[p.length - 1]); p = q;
    }
    return p;
  }

  /* ---------- the simulation ---------- */
  class Sim {
    constructor(opts = {}) {
      this.seed = opts.seed == null ? 1 : opts.seed;
      this.rng = new RNG(this.seed);
      this.daily = !!opts.daily;
      this.upgrades = {};            // id -> level
      this.score = 0; this.landings = 0; this.perfects = 0; this.nearMisses = 0; this.shiftIndex = 0;
      this.streak = 0; this.mult = 1; this.events = []; this.aircraft = []; this.storms = []; this.incoming = [];
      this.time = 0; this.shiftTime = 0; this.state = 'idle';   // idle | running | shiftClear | over
      this.overReason = null; this.incidents = 0; this.nextId = 1; this.tcasLeft = 0; this.slowLeft = 0;
      this.totalTime = 0; this.shiftLandings = 0; this.shiftScore = 0; this.history = [];
      this.pendingUpgradeChoices = null;
    }

    hasUpgrade(id) { return this.upgrades[id] || 0; }

    /* Start shift n (1-based). */
    startShift(n) {
      this.shiftIndex = n;
      this.cfg = shiftConfig(n, this.daily);
      this.rng = new RNG((this.seed * 1000003 + n * 7919) >>> 0);
      this.airport = makeAirport(this.rng, this.cfg);
      this.aircraft = []; this.storms = []; this.incoming = []; this.events = [];
      this.shiftTime = 0; this.spawnTimer = 3.5; this.state = 'running'; this.incidents = 0;
      this.shiftLandings = 0; this.shiftScore = 0; this.lastSpawnAngle = this.rng.range(0, TAU);
      this.tcasLeft = this.hasUpgrade('tcas'); this.slowLeft = 12 * this.hasUpgrade('slow');
      for (let i = 0; i < this.cfg.storms; i++) this.spawnStorm(true);
      this.emit({ type: 'shiftStart', index: n });
    }

    emit(e) { e.t = this.time; this.events.push(e); }
    drainEvents() { const e = this.events; this.events = []; return e; }

    /* ---- spawning ---- */
    pickType() {
      const w = this.cfg.weights; let total = 0; for (const k in w) total += w[k] * (AIRCRAFT[k].weight || 1);
      let r = this.rng.next() * total;
      for (const k in w) { r -= w[k] * (AIRCRAFT[k].weight || 1); if (r <= 0) return k; }
      return 'prop';
    }

    nextSpawnAngle() {
      // spread spawn angles so aircraft don't stack on one edge
      let ang = this.lastSpawnAngle + this.rng.range(1.2, 2.6) * this.rng.sign();
      ang = norm(ang); this.lastSpawnAngle = ang;
      return ang;
    }

    spawnAircraft(forcedType, forcedAngle) {
      const type = forcedType || this.pickType();
      const def = AIRCRAFT[type];
      const ang = forcedAngle == null ? this.nextSpawnAngle() : forcedAngle;
      const x = Math.cos(ang) * WORLD.spawnR, y = Math.sin(ang) * WORLD.spawnR;
      const tx = this.rng.range(-0.3, 0.3) * WORLD.R, ty = this.rng.range(-0.3, 0.3) * WORLD.R;
      const heading = Math.atan2(ty - y, tx - x);
      const fuelBase = this.rng.range(def.fuel[0], def.fuel[1]) * this.cfg.fuelScale * (1 + 0.3 * this.hasUpgrade('fuel'));
      const emergency = this.cfg.emergencyChance > 0 && this.rng.chance(this.cfg.emergencyChance);
      const a = {
        id: this.nextId++, type, def, x, y, heading, speed: def.speed, targetSpeed: def.speed, radius: def.radius,
        path: null, pathIndex: 0, fuel: emergency ? Math.min(fuelBase, 45) : fuelBase, fuelMax: fuelBase,
        emergency, lowFuel: emergency, state: 'flying', landT: 0, goAroundCooldown: 0, stormT: 0, inStorm: false,
        callsign: this.rng.pick(CALLSIGNS) + this.rng.int(100, 999), warn: 0, trail: [], age: 0, hover: false,
        dest: def.dest,
      };
      this.aircraft.push(a);
      this.emit({ type: 'spawn', id: a.id, emergency, atype: type, x, y });
      return a;
    }

    spawnStorm(initial) {
      const weather = this.hasUpgrade('weather');
      const ang = this.rng.range(0, TAU), r = initial ? this.rng.range(80, 320) : WORLD.spawnR + 40;
      const s = { x: Math.cos(ang) * r, y: Math.sin(ang) * r, radius: this.rng.range(55, 85) * (weather ? 0.75 : 1), vx: 0, vy: 0, age: 0, seed: this.rng.next() * 1000 };
      const drift = this.rng.range(4, 9) * (weather ? 0.6 : 1), da = initial ? this.rng.range(0, TAU) : Math.atan2(-s.y, -s.x) + this.rng.range(-0.5, 0.5);
      s.vx = Math.cos(da) * drift; s.vy = Math.sin(da) * drift;
      this.storms.push(s);
    }

    /* ---- input ---- */
    aircraftAt(x, y, pickRadius = 26) {
      let best = null, bd = pickRadius;
      for (const a of this.aircraft) { if (a.state !== 'flying') continue; const d = Math.hypot(a.x - x, a.y - y); if (d < bd) { bd = d; best = a; } }
      return best;
    }

    assignPath(id, points) {
      const a = this.aircraft.find(q => q.id === id);
      if (!a || a.state !== 'flying') return false;
      if (!points || points.length < 2) { a.path = null; a.hover = false; return true; }
      const pts = [{ x: a.x, y: a.y }, ...points.slice(1)];
      a.path = smoothPath(resamplePath(pts, 7), 2);
      a.pathIndex = 1; a.hover = false;
      this.emit({ type: 'path', id });
      return true;
    }

    /* ---- helpers for destinations ---- */
    destinationsFor(a) {
      if (a.dest === 'H') return this.airport.pads;
      if (a.dest === 'A') return this.airport.runways.filter(r => r.id === 'A');
      return this.airport.runways.filter(r => r.id === 'B' || r.acceptsB);
    }

    alignmentTolerance() { return (0.42 + 0.26 * this.hasUpgrade('ils')); }   // radians (~24° base, ~39° / 54°)

    /* ---- main update ---- */
    update(dt) {
      if (this.state !== 'running') return;
      this.time += dt; this.shiftTime += dt; this.totalTime += dt;
      const cfg = this.cfg;
      const progress = Math.min(1, this.shiftTime / cfg.duration);

      // spawning
      this.spawnTimer -= dt;
      const airborne = this.aircraft.filter(a => a.state === 'flying').length;
      if (this.spawnTimer <= 0 && this.shiftTime < cfg.duration - 8) {
        if (airborne < cfg.maxAirborne) {
          if (this.hasUpgrade('radar')) {
            // pre-announce: push to incoming, actual spawn after 5s
            this.incoming.push({ t: 5, type: this.pickType(), angle: this.nextSpawnAngle() });
          } else this.spawnAircraft();
        }
        this.spawnTimer = lerp(cfg.interval0, cfg.interval1, progress) * this.rng.range(0.8, 1.2);
      }
      for (let i = this.incoming.length - 1; i >= 0; i--) { const inc = this.incoming[i]; inc.t -= dt; if (inc.t <= 0) { this.spawnAircraft(inc.type, inc.angle); this.incoming.splice(i, 1); } }

      // storms
      for (let i = this.storms.length - 1; i >= 0; i--) {
        const s = this.storms[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.age += dt;
        if (Math.hypot(s.x, s.y) > WORLD.spawnR + 120) { this.storms.splice(i, 1); this.spawnStorm(false); }
      }

      // runway/pad busy timers
      const taxi = this.hasUpgrade('taxi') ? 0.5 : 1;
      for (const r of this.airport.runways) if (r.busy > 0) r.busy -= dt / taxi;
      for (const p of this.airport.pads) if (p.busy > 0) p.busy -= dt / taxi;

      // aircraft
      for (const a of this.aircraft) this.updateAircraft(a, dt);
      this.aircraft = this.aircraft.filter(a => a.state !== 'gone');

      // separation
      this.checkSeparation(dt);
      if (this.state !== 'running') return;

      // shift end
      if (this.shiftTime >= cfg.duration && this.aircraft.every(a => a.state !== 'flying')) this.endShift();
      else if (this.shiftTime >= cfg.duration + 90) this.endShift(); // safety: never stall forever
    }

    updateAircraft(a, dt) {
      a.age += dt;
      if (a.state === 'landing') {
        a.landT += dt;
        const spd = a.def.speed * Math.max(0.25, 1 - a.landT / 1.6);
        a.x += Math.cos(a.heading) * spd * dt; a.y += Math.sin(a.heading) * spd * dt;
        if (a.landT > 1.5) a.state = 'gone';
        return;
      }
      if (a.state !== 'flying') return;

      // fuel
      a.fuel -= dt;
      if (!a.lowFuel && a.fuel < 30) { a.lowFuel = true; this.emit({ type: 'lowFuel', id: a.id }); }
      if (a.fuel <= 0) {
        a.state = 'gone'; this.incidents++; this.streak = 0; this.mult = 1; this.addScore(-150);
        this.emit({ type: 'fuelOut', id: a.id, x: a.x, y: a.y });
        if (this.incidents >= 3) this.gameOver('incidents');
        return;
      }
      if (a.goAroundCooldown > 0) a.goAroundCooldown -= dt;

      // steering
      let desired = a.heading;
      if (a.path && a.pathIndex < a.path.length) {
        // advance past waypoints we've reached OR flown by (projection test), looking a few points ahead
        const P = a.path;
        let advanced = true;
        while (advanced && a.pathIndex < P.length) {
          advanced = false;
          const lim = Math.min(P.length - 1, a.pathIndex + 5);
          for (let i = a.pathIndex; i <= lim; i++) {
            const wp = P[i], prev = P[i - 1] || P[i];
            const d = Math.hypot(wp.x - a.x, wp.y - a.y);
            const sx = wp.x - prev.x, sy = wp.y - prev.y;
            const passed = (sx * (a.x - wp.x) + sy * (a.y - wp.y)) > 0 && d < 40;
            if (d < 9 || passed) { a.pathIndex = i + 1; advanced = true; break; }
          }
        }
        if (a.pathIndex < P.length) {
          const wp = P[Math.min(P.length - 1, a.pathIndex + 1)];
          desired = Math.atan2(wp.y - a.y, wp.x - a.x);
        } else { a.path = null; if (a.type === 'heli') a.hover = true; }
      } else if (!a.path) {
        // no path: helicopters hover; others fly straight and turn back toward centre at the boundary
        if (a.type === 'heli' && a.hover) { a.targetSpeed = 0; }
        const rr = Math.hypot(a.x, a.y);
        if (rr > WORLD.holdR) desired = Math.atan2(-a.y, -a.x);
      }
      if (a.path || a.type !== 'heli') a.targetSpeed = a.def.speed;
      // turbulence in storms
      if (a.inStorm) desired += Math.sin(a.age * 9 + a.id) * 0.5;
      const diff = norm(desired - a.heading);
      const maxTurn = a.def.turn * dt;
      a.heading = norm(a.heading + Math.max(-maxTurn, Math.min(maxTurn, diff)));
      a.speed += (a.targetSpeed - a.speed) * Math.min(1, dt * 1.5);
      const stormSlow = a.inStorm ? 0.8 : 1;
      a.x += Math.cos(a.heading) * a.speed * stormSlow * dt;
      a.y += Math.sin(a.heading) * a.speed * stormSlow * dt;

      // trail
      if (a.trail.length === 0 || Math.hypot(a.x - a.trail[a.trail.length - 1].x, a.y - a.trail[a.trail.length - 1].y) > 6) {
        a.trail.push({ x: a.x, y: a.y }); if (a.trail.length > 28) a.trail.shift();
      }

      // storms
      let inStorm = false;
      for (const s of this.storms) if (Math.hypot(a.x - s.x, a.y - s.y) < s.radius) inStorm = true;
      if (inStorm && !a.inStorm) { this.emit({ type: 'stormEnter', id: a.id, x: a.x, y: a.y }); this.addScore(-30); this.streak = 0; this.mult = 1; }
      a.inStorm = inStorm;
      if (inStorm) { a.stormT += dt; if (a.stormT > 6) { a.state = 'gone'; this.incidents++; this.addScore(-150); this.emit({ type: 'stormDivert', id: a.id, x: a.x, y: a.y }); if (this.incidents >= 3) this.gameOver('incidents'); return; } }
      else a.stormT = Math.max(0, a.stormT - dt * 2);

      // landing checks
      this.checkLanding(a);
    }

    checkLanding(a) {
      const dests = this.destinationsFor(a);
      if (a.dest === 'H') {
        for (const p of dests) {
          if (Math.hypot(a.x - p.x, a.y - p.y) < p.radius + 4) {
            if (p.busy > 0) { this.goAround(a, 'busy'); return; }
            p.busy = 3.5; this.land(a, p, 0); return;
          }
        }
        return;
      }
      for (const r of dests) {
        const d = Math.hypot(a.x - r.tx, a.y - r.ty);
        if (d < 22) {
          const off = Math.abs(norm(a.heading - r.heading));
          if (off <= this.alignmentTolerance()) {
            if (r.busy > 0) { this.goAround(a, 'busy'); return; }
            r.busy = 4.5; a.heading = r.heading; a.x = r.tx; a.y = r.ty; this.land(a, r, off); return;
          } else if (off < 1.4 && a.goAroundCooldown <= 0) { this.goAround(a, 'align'); return; }
        }
      }
      // wrong runway: aligned arrival at a runway of another colour => go-around too
      for (const r of this.airport.runways) {
        if (dests.includes(r)) continue;
        if (Math.hypot(a.x - r.tx, a.y - r.ty) < 16 && Math.abs(norm(a.heading - r.heading)) < 0.6 && a.goAroundCooldown <= 0) { this.goAround(a, 'wrong'); return; }
      }
    }

    goAround(a, reason) {
      a.goAroundCooldown = 6; a.path = null; a.hover = false;
      this.emit({ type: 'goAround', id: a.id, reason, x: a.x, y: a.y });
    }

    land(a, dest, off) {
      a.state = 'landing'; a.landT = 0; a.path = null;
      const base = a.def.score;
      this.streak++;
      this.mult = this.streak >= 20 ? 3 : this.streak >= 10 ? 2 : this.streak >= 5 ? 1.5 : 1;
      let pts = base * this.mult;
      const perfect = a.dest !== 'H' && off <= 0.14;
      if (perfect) { pts += 50; this.perfects++; }
      if (a.emergency) pts += 200;
      else if (a.lowFuel) pts += 60;
      pts *= 1 + 0.25 * this.hasUpgrade('pay');
      pts = Math.round(pts);
      this.addScore(pts); this.landings++; this.shiftLandings++;
      this.emit({ type: 'land', id: a.id, x: a.x, y: a.y, pts, perfect, emergency: a.emergency, streak: this.streak, mult: this.mult, dest: dest.id });
      if (this.streak === 5 || this.streak === 10 || this.streak === 20) this.emit({ type: 'streak', streak: this.streak, mult: this.mult });
    }

    addScore(n) { this.score = Math.max(0, this.score + n); this.shiftScore += n; }

    checkSeparation(dt) {
      const flying = this.aircraft.filter(a => a.state === 'flying');
      const sepScale = this.hasUpgrade('sep') ? 0.75 : 1;
      for (const a of flying) a.warn = Math.max(0, a.warn - dt);
      for (let i = 0; i < flying.length; i++) for (let j = i + 1; j < flying.length; j++) {
        const a = flying[i], b = flying[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const rr = a.radius + b.radius;
        if (d < rr) {
          if (this.tcasLeft > 0) {
            this.tcasLeft--;
            // resolve: push apart and send both away
            const ang = Math.atan2(b.y - a.y, b.x - a.x);
            a.x -= Math.cos(ang) * rr; a.y -= Math.sin(ang) * rr; b.x += Math.cos(ang) * rr; b.y += Math.sin(ang) * rr;
            a.heading = norm(ang + Math.PI); b.heading = ang; a.path = null; b.path = null; a.warn = 2; b.warn = 2;
            this.emit({ type: 'tcas', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            continue;
          }
          this.emit({ type: 'crash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, ids: [a.id, b.id] });
          a.state = 'crashed'; b.state = 'crashed';
          this.gameOver('crash');
          return;
        }
        if (d < rr * 2.3 * sepScale) {
          if (a.warn <= 0 && b.warn <= 0) {
            this.nearMisses++; this.streak = 0; this.mult = 1; this.addScore(-50);
            this.emit({ type: 'nearMiss', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, ids: [a.id, b.id] });
          }
          a.warn = Math.max(a.warn, 1.2); b.warn = Math.max(b.warn, 1.2);
        }
      }
    }

    endShift() {
      this.state = 'shiftClear';
      const bonus = Math.round(this.shiftLandings * 20 * (1 + 0.25 * this.hasUpgrade('pay')));
      this.addScore(bonus);
      this.history.push({ shift: this.shiftIndex, landings: this.shiftLandings, score: this.shiftScore, bonus });
      this.pendingUpgradeChoices = this.daily ? null : this.rollUpgrades();
      this.emit({ type: 'shiftEnd', index: this.shiftIndex, landings: this.shiftLandings, bonus, daily: this.daily });
      if (this.daily) { this.state = 'over'; this.overReason = 'dailyDone'; }
    }

    rollUpgrades() {
      const pool = CONTENT.UPGRADES.filter(u => (this.upgrades[u.id] || 0) < u.max);
      const r = new RNG((this.seed * 31 + this.shiftIndex * 977) >>> 0);
      return r.shuffle(pool.slice()).slice(0, 3);
    }

    chooseUpgrade(id) {
      if (this.state !== 'shiftClear' || !this.pendingUpgradeChoices) return false;
      if (!this.pendingUpgradeChoices.some(u => u.id === id)) return false;
      this.upgrades[id] = (this.upgrades[id] || 0) + 1;
      this.pendingUpgradeChoices = null;
      this.emit({ type: 'upgrade', id });
      return true;
    }

    nextShift() { if (this.state !== 'shiftClear') return false; this.startShift(this.shiftIndex + 1); return true; }

    gameOver(reason) { this.state = 'over'; this.overReason = reason; this.emit({ type: 'gameOver', reason, score: this.score, landings: this.landings, shift: this.shiftIndex }); }

    /* consumable slow-motion */
    useSlow(dt) { if (this.slowLeft > 0) { this.slowLeft = Math.max(0, this.slowLeft - dt); return true; } return false; }

    /* text summary for sharing */
    shareText(lang) {
      const S = CONTENT.STRINGS[lang] || CONTENT.STRINGS.en;
      const planes = Math.min(20, this.landings);
      return `${S.title} ${this.daily ? '#' + (this.seed % 100000) : ''} — ${S.score} ${this.score} · ${S.landings} ${this.landings}${this.daily ? '' : ' · ' + S.shift + ' ' + this.shiftIndex}\n${'✈'.repeat(planes)}${this.perfects ? ' ★' + this.perfects : ''}`;
    }
  }

  /* ---------- AI dispatcher: sequences arrivals per destination (balance tests & attract mode) ---------- */
  function pathLength(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; }

  function approachPlan(a, best) {
    if (a.dest === 'H') return [{ x: a.x, y: a.y }, { x: best.x, y: best.y }];
    const fx = best.tx - best.dx * 130, fy = best.ty - best.dy * 130;      // final approach fix
    const pts = [{ x: a.x, y: a.y }];
    const toFix = Math.atan2(fy - a.y, fx - a.x);
    if (Math.abs(norm(toFix - best.heading)) > 1.1) {
      // swing out to the side we're already on, then line up
      const side = norm(Math.atan2(a.y - best.ty, a.x - best.tx) - best.heading) > 0 ? 1 : -1;
      pts.push({ x: fx - best.dx * 80 + (-best.dy) * side * 110, y: fy - best.dy * 80 + best.dx * side * 110 });
    }
    pts.push({ x: fx, y: fy }, { x: best.tx, y: best.ty }, { x: best.tx + best.dx * 20, y: best.ty + best.dy * 20 });
    return pts;
  }

  /* Inserts a loop near the aircraft so the path takes `delay` seconds longer. */
  function addDelay(pts, a, delay) {
    const extra = delay * a.def.speed;
    const r = Math.max(45, extra / (Math.PI * 2));
    const h = a.heading, cx = a.x + Math.cos(h + Math.PI / 2) * r, cy = a.y + Math.sin(h + Math.PI / 2) * r;
    const loop = [];
    for (let k = 1; k <= 12; k++) { const ang = h - Math.PI / 2 + (k / 12) * Math.PI * 2; loop.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r }); }
    return [pts[0], ...loop, ...pts.slice(1)];
  }

  class Autopilot {
    constructor(sim, opts = {}) { this.sim = sim; this.sepTime = opts.sepTime || 11; this.timer = 0; this.plans = new Map(); this.avoiding = new Map(); this.skill = opts.skill == null ? 1 : opts.skill; }
    /* mid-air conflict avoidance: the lower-priority aircraft of a converging pair turns away for a moment */
    avoid(dt) {
      const sim = this.sim;
      for (const [id, t] of this.avoiding) { const nt = t - dt; if (nt <= 0) { this.avoiding.delete(id); const a = sim.aircraft.find(q => q.id === id); if (a) { a.path = null; this.plans.delete(id); } } else this.avoiding.set(id, nt); }
      const fl = sim.aircraft.filter(a => a.state === 'flying');
      for (let i = 0; i < fl.length; i++) for (let j = i + 1; j < fl.length; j++) {
        const a = fl[i], b = fl[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d > 150 * this.skill) continue;
        const vax = Math.cos(a.heading) * a.speed, vay = Math.sin(a.heading) * a.speed, vbx = Math.cos(b.heading) * b.speed, vby = Math.sin(b.heading) * b.speed;
        const dvx = vbx - vax, dvy = vby - vay, dv2 = dvx * dvx + dvy * dvy;
        if (dv2 < 1e-6) continue;
        const tca = -(dx * dvx + dy * dvy) / dv2;
        if (tca < 0 || tca > 7) continue;
        const mx = dx + dvx * tca, my = dy + dvy * tca;
        if (Math.hypot(mx, my) > (a.radius + b.radius) * 2.6) continue;
        // pick the one to divert: not emergency, later ETA
        const pa = this.plans.get(a.id), pb = this.plans.get(b.id);
        let v = a; if (a.emergency && !b.emergency) v = b; else if (!b.emergency && pa && pb && pa.eta < pb.eta) v = b;
        if (this.avoiding.has(v.id)) continue;
        const other = v === a ? b : a;
        const away = Math.atan2(v.y - other.y, v.x - other.x);
        const turn = norm(away - v.heading) > 0 ? 1 : -1;
        const h = v.heading + turn * 1.2;
        sim.assignPath(v.id, [{ x: v.x, y: v.y }, { x: v.x + Math.cos(h) * 70, y: v.y + Math.sin(h) * 70 }, { x: v.x + Math.cos(h) * 140, y: v.y + Math.sin(h) * 140 }]);
        this.avoiding.set(v.id, 3.5);
        this.plans.delete(v.id);
      }
    }
    update(dt) {
      this.avoid(dt);
      this.timer -= dt; if (this.timer > 0) return;
      this.timer = 0.4;
      const sim = this.sim;
      // forget plans for aircraft that are gone
      for (const id of Array.from(this.plans.keys())) if (!sim.aircraft.some(a => a.id === id && a.state === 'flying')) this.plans.delete(id);
      for (const a of sim.aircraft) {
        if (a.state !== 'flying' || a.age < 0.3 || this.avoiding.has(a.id)) continue;
        const plan = this.plans.get(a.id);
        if (a.path && plan) { plan.eta -= 0.4; continue; }          // still flying its plan
        if (a.path && !plan) continue;
        // (re)plan
        const dests = sim.destinationsFor(a);
        let best = null, bd = Infinity;
        for (const d of dests) {
          const d0 = a.dest === 'H' ? Math.hypot(a.x - d.x, a.y - d.y) : Math.hypot(a.x - d.tx, a.y - d.ty);
          // prefer idle destinations
          const score = d0 + (this.destLoad(d) * 90);
          if (score < bd) { bd = score; best = d; }
        }
        if (!best) continue;
        let pts = approachPlan(a, best);
        let eta = pathLength(pts) / a.def.speed;
        // sequence against others heading to the same destination
        let guard = 0;
        while (guard++ < 8) {
          let conflict = 0;
          for (const [id, p] of this.plans) { if (id === a.id || p.dest !== best.id) continue; const gap = eta - p.eta; if (Math.abs(gap) < this.sepTime) conflict = Math.max(conflict, this.sepTime - gap); }
          if (!conflict) break;
          pts = addDelay(pts, a, conflict + 1);
          eta = pathLength(pts) / a.def.speed;
        }
        // emergency aircraft jump the queue: others on this destination get delayed on their next replan (simplified)
        sim.assignPath(a.id, pts);
        this.plans.set(a.id, { dest: best.id, eta });
      }
    }
    destLoad(d) { let n = 0; for (const p of this.plans.values()) if (p.dest === d.id) n++; return n; }
  }

  function autopilotPlan(sim, a) {
    const dests = sim.destinationsFor(a);
    if (!dests.length) return null;
    let best = null, bd = Infinity;
    for (const d of dests) { const d0 = a.dest === 'H' ? Math.hypot(a.x - d.x, a.y - d.y) : Math.hypot(a.x - d.tx, a.y - d.ty); if (d0 < bd) { bd = d0; best = d; } }
    return approachPlan(a, best);
  }

  return { Sim, Autopilot, makeAirport, resamplePath, smoothPath, autopilotPlan, pathLength, norm, pointSegDist };
});
