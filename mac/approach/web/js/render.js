/* APPROACH renderer: Canvas 2D, procedural everything. */
class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.W = 0; this.H = 0; this.dpr = 1; this.scale = 1; this.ox = 0; this.oy = 0; this.time = 0;
    this.landCache = null; this.landKey = null; this.flash = 0; this.lightning = 0; this.stars = null;
  }
  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.cv.width = Math.floor(this.W * this.dpr); this.cv.height = Math.floor(this.H * this.dpr);
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
    const R = CONTENT.WORLD.spawnR;
    this.scale = Math.min(this.W, this.H - 30) / (2 * R);
    this.ox = this.W / 2; this.oy = this.H / 2 + 14;
  }
  toScreen(x, y) { return { x: this.ox + x * this.scale, y: this.oy + y * this.scale }; }
  toWorld(sx, sy) { return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale }; }

  /* ---- palettes by time of day ---- */
  static PALETTES = [
    { name: 'morning', top: '#cfe3f5', bottom: '#f4f0e7', ring: 'rgba(60,80,110,0.16)', land: '#e8e2cd', landEdge: '#d9d0b5', sea: '#cfe0ee', runway: '#5a6474', ink: '#243141', dim: 'rgba(36,49,65,0.55)', night: false },
    { name: 'noon', top: '#b9ddfb', bottom: '#f8f5ee', ring: 'rgba(40,70,110,0.15)', land: '#ebe5cf', landEdge: '#dbd3b6', sea: '#b9d8ee', runway: '#56606f', ink: '#1f2c3b', dim: 'rgba(31,44,59,0.55)', night: false },
    { name: 'golden', top: '#f4c48a', bottom: '#f9e4cf', ring: 'rgba(120,70,30,0.16)', land: '#efdcb6', landEdge: '#e0c89c', sea: '#e6c6a4', runway: '#5c5862', ink: '#3b2a20', dim: 'rgba(59,42,32,0.55)', night: false },
    { name: 'dusk', top: '#5c4f91', bottom: '#cf8a9c', ring: 'rgba(255,230,240,0.18)', land: '#8f7a9c', landEdge: '#7d6a8a', sea: '#6f5f98', runway: '#3b3750', ink: '#fff3fa', dim: 'rgba(255,243,250,0.6)', night: true },
    { name: 'night', top: '#0a1230', bottom: '#172349', ring: 'rgba(150,180,255,0.14)', land: '#1a2642', landEdge: '#223052', sea: '#0e183a', runway: '#283049', ink: '#e4ebff', dim: 'rgba(228,235,255,0.6)', night: true },
    { name: 'dawn', top: '#273664', bottom: '#f0a27c', ring: 'rgba(255,220,200,0.18)', land: '#5c5b78', landEdge: '#6d6a86', sea: '#3d4a7a', runway: '#3b4050', ink: '#fff1e8', dim: 'rgba(255,241,232,0.6)', night: true },
  ];
  palette(sim) {
    if (!sim) return Renderer.PALETTES[0];
    if (sim.daily) { const h = new Date().getHours(); return Renderer.PALETTES[h < 6 ? 4 : h < 9 ? 5 : h < 12 ? 0 : h < 16 ? 1 : h < 18 ? 2 : h < 20 ? 3 : 4]; }
    return Renderer.PALETTES[((sim.shiftIndex || 1) - 1) % Renderer.PALETTES.length];
  }

  /* ---- land blobs (cached per airport) ---- */
  land(sim) {
    const key = sim.seed + ':' + sim.shiftIndex;
    if (this.landKey === key) return this.landCache;
    const rng = new RNG((sim.seed * 101 + sim.shiftIndex * 7) >>> 0);
    const blobs = [];
    const n = rng.int(3, 5);
    for (let i = 0; i < n; i++) {
      const ang = rng.range(0, Math.PI * 2), r = i === 0 ? 0 : rng.range(60, 300);
      const cx = Math.cos(ang) * r, cy = Math.sin(ang) * r;
      const pts = []; const k = 14; const base = i === 0 ? rng.range(190, 240) : rng.range(60, 130);
      for (let j = 0; j < k; j++) { const a = j / k * Math.PI * 2; const rr = base * (0.75 + 0.35 * rng.next()); pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * rng.range(0.7, 1) }); }
      blobs.push(pts);
    }
    this.landKey = key; this.landCache = blobs; return blobs;
  }

  drawBlob(ctx, pts) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = this.toScreen(pts[i].x, pts[i].y), q = this.toScreen(pts[(i + 1) % pts.length].x, pts[(i + 1) % pts.length].y);
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p.x, p.y, mx, my);
    }
    const p0 = this.toScreen(pts[0].x, pts[0].y), q0 = this.toScreen(pts[1].x, pts[1].y);
    ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + q0.x) / 2, (p0.y + q0.y) / 2);
    ctx.closePath();
  }

  /* ---- main draw ---- */
  draw(sim, game, dt) {
    const ctx = this.ctx; this.time += dt;
    const pal = this.palette(sim);
    const W = this.W, H = this.H, cam = game.cam;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // background
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, pal.top); g.addColorStop(1, pal.bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (pal.night) this.drawStars(ctx, pal);
    ctx.save();
    ctx.translate(cam.sx + cam.kickX, cam.sy + cam.kickY);

    if (sim) {
      const R = CONTENT.WORLD.R;
      // sea disc + rings
      const c = this.toScreen(0, 0);
      ctx.fillStyle = pal.sea; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(c.x, c.y, (R + 40) * this.scale, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = pal.ring; ctx.lineWidth = 1;
      for (let r = 100; r <= R; r += 120) { ctx.beginPath(); ctx.arc(c.x, c.y, r * this.scale, 0, Math.PI * 2); ctx.stroke(); }
      ctx.setLineDash([6, 8]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(c.x, c.y, R * this.scale, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; const r1 = (R - (i % 3 === 0 ? 14 : 7)) * this.scale, r2 = R * this.scale; ctx.beginPath(); ctx.moveTo(c.x + Math.cos(a) * r1, c.y + Math.sin(a) * r1); ctx.lineTo(c.x + Math.cos(a) * r2, c.y + Math.sin(a) * r2); ctx.stroke(); }
      // land
      const blobs = this.land(sim);
      for (const b of blobs) { this.drawBlob(ctx, b); ctx.fillStyle = pal.landEdge; ctx.fill(); }
      ctx.save(); ctx.translate(0, -2 * this.scale); for (const b of blobs) { this.drawBlob(ctx, b); ctx.fillStyle = pal.land; ctx.fill(); } ctx.restore();

      this.drawStorms(ctx, sim, pal);
      for (const r of sim.airport.runways) this.drawRunway(ctx, r, pal, sim);
      for (const p of sim.airport.pads) this.drawPad(ctx, p, pal);
      this.drawWind(ctx, sim, pal);
      // paths
      for (const a of sim.aircraft) if (a.path && a.state === 'flying') this.drawPath(ctx, a.path, a.pathIndex, a.def.color, 0.55, 2);
      if (game.drawing && game.drawing.points.length > 1) this.drawPath(ctx, game.drawing.points, 1, AIRCRAFT_COLOR(game.drawing.aircraft), 0.95, 3.5, true);
      // incoming indicators
      for (const inc of sim.incoming) this.drawIncoming(ctx, inc, pal);
      // aircraft
      for (const a of sim.aircraft) this.drawAircraft(ctx, a, pal, game);
    }
    game.particles.draw(ctx);
    game.floaters.draw(ctx);
    ctx.restore();
    // flashes
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.5, this.flash)})`; ctx.fillRect(0, 0, W, H); this.flash -= dt * 2.2; }
    if (game.dangerFlash > 0 && game.settings.flash) { ctx.fillStyle = `rgba(255,40,40,${0.18 * game.dangerFlash})`; ctx.fillRect(0, 0, W, H); }
  }

  drawStars(ctx, pal) {
    if (!this.stars || this.stars.W !== this.W) { const rng = new RNG(7); const arr = []; for (let i = 0; i < 90; i++) arr.push({ x: rng.next() * this.W, y: rng.next() * this.H * 0.7, s: rng.range(0.6, 1.8), p: rng.next() * 6 }); this.stars = { W: this.W, arr }; }
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const s of this.stars.arr) { ctx.globalAlpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(this.time * 1.3 + s.p)); ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  drawStorms(ctx, sim, pal) {
    for (const s of sim.storms) {
      const c = this.toScreen(s.x, s.y), r = s.radius * this.scale;
      ctx.save();
      for (let i = 0; i < 6; i++) {
        const a = s.seed + i * 1.1 + this.time * 0.15, rr = r * (0.55 + 0.2 * Math.sin(this.time * 0.6 + i)), ox = Math.cos(a) * r * 0.35, oy = Math.sin(a * 1.3) * r * 0.3;
        const grad = ctx.createRadialGradient(c.x + ox, c.y + oy, rr * 0.2, c.x + ox, c.y + oy, rr);
        grad.addColorStop(0, pal.night ? 'rgba(120,130,170,0.55)' : 'rgba(70,80,105,0.45)'); grad.addColorStop(1, 'rgba(70,80,105,0)');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(c.x + ox, c.y + oy, rr, 0, Math.PI * 2); ctx.fill();
      }
      // boundary hint
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.setLineDash([3, 6]); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      if (Math.random() < 0.004) s.flash = 0.12;
      if (s.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${s.flash * 3})`; ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.8, 0, Math.PI * 2); ctx.fill(); s.flash -= 1 / 60; }
      ctx.restore();
    }
  }

  drawRunway(ctx, r, pal, sim) {
    const c = this.toScreen(r.x, r.y), L = r.length * this.scale, Wd = r.width * this.scale;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(r.heading);
    // shadow + body
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(-L / 2 + 2, -Wd / 2 + 3, L, Wd);
    ctx.fillStyle = pal.runway; ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
    // centerline
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(1, Wd * 0.08); ctx.setLineDash([Wd * 0.5, Wd * 0.4]);
    ctx.beginPath(); ctx.moveTo(-L / 2 + Wd * 0.9, 0); ctx.lineTo(L / 2 - Wd * 0.6, 0); ctx.stroke(); ctx.setLineDash([]);
    // threshold piano keys at the approach end
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = -2; i <= 2; i++) { if (i === 0) continue; ctx.fillRect(-L / 2 + Wd * 0.15, i * Wd * 0.18 - Wd * 0.06, Wd * 0.45, Wd * 0.12); }
    // edge lights at night
    if (pal.night) { ctx.fillStyle = '#ffd27a'; for (let x = -L / 2; x <= L / 2; x += Wd * 0.9) { ctx.beginPath(); ctx.arc(x, -Wd / 2 - 2, 1.3, 0, Math.PI * 2); ctx.arc(x, Wd / 2 + 2, 1.3, 0, Math.PI * 2); ctx.fill(); } }
    // busy overlay
    if (r.busy > 0) { ctx.fillStyle = 'rgba(255,80,80,0.35)'; ctx.fillRect(-L / 2, -Wd / 2, L * Math.min(1, r.busy / 4.5), Wd); }
    // runway number (heading/10, aviation style)
    const num = String(Math.round((((r.heading + Math.PI / 2) * 180 / Math.PI) % 360 + 360) % 360 / 10) || 36).padStart(2, '0');
    ctx.save(); ctx.translate(-L / 2 + Wd * 1.35, 0); ctx.rotate(Math.PI / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `700 ${Math.max(8, Wd * 0.62)}px ui-rounded, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(num, 0, 0); ctx.restore();
    // approach chevrons (dest colour), pulsing
    const pulse = 0.55 + 0.35 * Math.sin(this.time * 4);
    ctx.strokeStyle = r.color; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const x = -L / 2 - (14 + i * 11) * this.scale * 0.9; ctx.globalAlpha = (pulse - i * 0.12) * (i === 0 ? 1 : 0.8);
      ctx.beginPath(); ctx.moveTo(x - 6, -7); ctx.lineTo(x, 0); ctx.lineTo(x - 6, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // label
    const t = this.toScreen(r.tx, r.ty);
    ctx.font = `900 ${Math.max(13, 20 * this.scale)}px ui-rounded, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lx = t.x - Math.cos(r.heading) * 52 * this.scale, ly = t.y - Math.sin(r.heading) * 52 * this.scale;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.strokeText(r.id === 'C' ? 'B' : r.id, lx, ly);
    ctx.fillStyle = r.color; ctx.fillText(r.id === 'C' ? 'B' : r.id, lx, ly);
  }

  drawPad(ctx, p, pal) {
    const c = this.toScreen(p.x, p.y), r = p.radius * this.scale;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.arc(c.x + 2, c.y + 3, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.runway; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = p.color; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(this.time * 4); ctx.beginPath(); ctx.arc(c.x, c.y, r + 4, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    if (p.busy > 0) { ctx.fillStyle = 'rgba(255,80,80,0.4)'; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `800 ${r * 1.2}px ui-rounded, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', c.x, c.y + 1);
    ctx.restore();
  }

  drawWind(ctx, sim, pal) {
    const a = sim.airport.wind; const x = 26, y = this.H - 30;
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = pal.dim; ctx.fillStyle = pal.dim; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
    const dx = Math.cos(a + Math.PI), dy = Math.sin(a + Math.PI); // arrow shows where the wind blows TO
    ctx.beginPath(); ctx.moveTo(-dx * 9, -dy * 9); ctx.lineTo(dx * 9, dy * 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dx * 12, dy * 12); ctx.lineTo(dx * 4 - dy * 4, dy * 4 + dx * 4); ctx.lineTo(dx * 4 + dy * 4, dy * 4 - dx * 4); ctx.closePath(); ctx.fill();
    ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const deg = Math.round(((a + Math.PI / 2) * 180 / Math.PI + 360) % 360);
    ctx.fillText(`WIND ${String(deg).padStart(3, '0')}°`, 20, 0);
    ctx.restore();
  }

  drawPath(ctx, pts, fromIndex, color, alpha, width, live) {
    if (pts.length < 2) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (!live) { ctx.setLineDash([8, 7]); ctx.lineDashOffset = -this.time * 40; }
    ctx.beginPath();
    const start = Math.max(0, Math.min(fromIndex - 1, pts.length - 1));
    const p0 = this.toScreen(pts[start].x, pts[start].y); ctx.moveTo(p0.x, p0.y);
    for (let i = start + 1; i < pts.length; i++) { const p = this.toScreen(pts[i].x, pts[i].y); ctx.lineTo(p.x, p.y); }
    ctx.stroke(); ctx.setLineDash([]);
    const e = this.toScreen(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(e.x, e.y, live ? 4 : 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawIncoming(ctx, inc, pal) {
    const R = CONTENT.WORLD.R + 24, p = this.toScreen(Math.cos(inc.angle) * R, Math.sin(inc.angle) * R);
    const k = 1 - inc.t / 5;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(inc.angle + Math.PI);
    ctx.globalAlpha = 0.35 + 0.5 * k; ctx.fillStyle = CONTENT.AIRCRAFT[inc.type].color;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-2, 0); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  drawAircraft(ctx, a, pal, game) {
    const p = this.toScreen(a.x, a.y);
    const s = this.scale * (a.state === 'landing' ? Math.max(0.55, 1 - a.landT * 0.3) : 1);
    const hovered = game.hover === a.id || (game.drawing && game.drawing.aircraft.id === a.id);
    // trail
    if (a.state === 'flying' && a.trail.length > 1) {
      ctx.save(); ctx.strokeStyle = a.def.color; ctx.lineCap = 'round';
      for (let i = 1; i < a.trail.length; i++) { const q0 = this.toScreen(a.trail[i - 1].x, a.trail[i - 1].y), q1 = this.toScreen(a.trail[i].x, a.trail[i].y); const k = i / a.trail.length; ctx.globalAlpha = k * 0.35; ctx.lineWidth = 1 + k * 2; ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.stroke(); }
      ctx.restore();
    }
    // warning ring
    if (a.warn > 0 && a.state === 'flying') {
      ctx.save(); ctx.strokeStyle = `rgba(255,60,60,${0.4 + 0.4 * Math.sin(this.time * 14)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, a.radius * 2.3 * this.scale, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    // hover / selected ring
    if (hovered && a.state === 'flying') { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -this.time * 30; ctx.beginPath(); ctx.arc(p.x, p.y, (a.radius + 10) * this.scale, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    // low fuel arc
    if (a.lowFuel && a.state === 'flying') {
      ctx.save(); ctx.strokeStyle = a.emergency ? '#ff3b3b' : '#ffb020'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(p.x, p.y, (a.radius + 6) * this.scale, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, a.fuel / Math.max(30, a.fuelMax))); ctx.stroke(); ctx.restore();
    }
    // body: shadow then silhouette
    const blink = a.emergency && Math.floor(this.time * 5) % 2 === 0;
    const color = blink ? '#ff3b3b' : a.def.color;
    const shadowOff = a.state === 'landing' ? Math.max(1, 6 - a.landT * 4) : 6;
    this.drawShape(ctx, a, p.x + shadowOff * 0.6, p.y + shadowOff, s, 'rgba(0,0,0,0.18)', pal);
    this.drawShape(ctx, a, p.x, p.y, s, color, pal, true);
    // beacon at night
    if (pal.night && a.state === 'flying' && Math.floor(this.time * 2 + a.id) % 2 === 0) { ctx.fillStyle = '#ff5050'; ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2); ctx.fill(); }
    // labels
    if (a.state === 'flying' && (a.emergency || a.lowFuel || hovered)) {
      ctx.save(); ctx.font = `700 ${Math.max(10, 11 * this.scale)}px ui-rounded, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const label = a.emergency ? (game.S.emergency + ' ' + Math.ceil(a.fuel) + 's') : a.lowFuel ? (game.S.lowFuel + ' ' + Math.ceil(a.fuel) + 's') : `${a.callsign} · ${Math.ceil(a.fuel)}s`;
      const y = p.y - (a.radius + 12) * this.scale;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeText(label, p.x, y);
      ctx.fillStyle = a.emergency ? '#ff5a5a' : a.lowFuel ? '#ffb020' : '#ffffff'; ctx.fillText(label, p.x, y);
      ctx.restore();
    }
  }

  drawShape(ctx, a, x, y, s, color, pal, main) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a.heading); ctx.fillStyle = color; ctx.strokeStyle = color;
    const r = a.radius * s * 1.3;
    ctx.lineJoin = 'round';
    if (main && pal.night) { ctx.shadowColor = color; ctx.shadowBlur = 10; }
    if (a.type === 'heli') {
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.9, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(1.5, r * 0.25); ctx.beginPath(); ctx.moveTo(-r * 0.8, 0); ctx.lineTo(-r * 2, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 2, -r * 0.5); ctx.lineTo(-r * 2, r * 0.5); ctx.stroke();
      // rotor
      ctx.save(); ctx.rotate(this.time * 25 + a.id); ctx.lineWidth = Math.max(1, r * 0.18); ctx.globalAlpha *= 0.75;
      ctx.beginPath(); ctx.moveTo(-r * 1.9, 0); ctx.lineTo(r * 1.9, 0); ctx.moveTo(0, -r * 1.9); ctx.lineTo(0, r * 1.9); ctx.stroke(); ctx.restore();
    } else {
      const heavy = a.type === 'heavy', prop = a.type === 'prop';
      const len = r * 2.4, wing = heavy ? r * 2.2 : prop ? r * 2.0 : r * 1.8, sweep = prop ? 0.1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(len * 0.55, 0);
      ctx.lineTo(len * 0.1, -r * 0.42); ctx.lineTo(-len * 0.05 - wing * sweep * 0.4, -wing); ctx.lineTo(-len * 0.2 - wing * sweep * 0.4, -wing); ctx.lineTo(-len * 0.2, -r * 0.4);
      ctx.lineTo(-len * 0.45, -r * 0.4); ctx.lineTo(-len * 0.55, -r * 0.95); ctx.lineTo(-len * 0.62, -r * 0.95); ctx.lineTo(-len * 0.58, 0);
      ctx.lineTo(-len * 0.62, r * 0.95); ctx.lineTo(-len * 0.55, r * 0.95); ctx.lineTo(-len * 0.45, r * 0.4);
      ctx.lineTo(-len * 0.2, r * 0.4); ctx.lineTo(-len * 0.2 - wing * sweep * 0.4, wing); ctx.lineTo(-len * 0.05 - wing * sweep * 0.4, wing); ctx.lineTo(len * 0.1, r * 0.42);
      ctx.closePath(); ctx.fill();
      if (heavy && main) { ctx.fillStyle = 'rgba(255,255,255,0.75)'; for (const side of [-1, 1]) for (const k of [0.45, 0.8]) { ctx.beginPath(); ctx.arc(-len * 0.12, side * wing * k, r * 0.16, 0, Math.PI * 2); ctx.fill(); } }
      if (prop && main) { ctx.save(); ctx.translate(len * 0.55, 0); ctx.rotate(this.time * 30 + a.id); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.lineTo(0, r * 0.8); ctx.stroke(); ctx.restore(); }
    }
    ctx.restore();
  }
}
function AIRCRAFT_COLOR(a) { return a ? a.def.color : '#fff'; }
