/* Game-feel toolkit: particles, floating text, camera shake, hit-stop, tweens. */
class Particles {
  constructor(max = 2500) { this.p = []; this.max = max; }
  emit(o) {
    if (this.p.length >= this.max) this.p.splice(0, 50);
    this.p.push({
      x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, life: o.life || 0.5, t: 0,
      size: o.size || 3, size2: o.size2 == null ? 0 : o.size2, color: o.color || '#fff',
      drag: o.drag == null ? 0.9 : o.drag, grav: o.grav || 0, shape: o.shape || 'dot', rot: o.rot || 0, vr: o.vr || 0,
      glow: o.glow || 0, add: o.add !== false,
    });
  }
  burst(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = (o.angle == null ? Math.random() * Math.PI * 2 : o.angle + (Math.random() - 0.5) * (o.spread == null ? Math.PI * 2 : o.spread));
      const sp = (o.speed || 120) * (0.4 + Math.random() * 0.9);
      this.emit({ x, y, vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp + (o.vy || 0),
        life: (o.life || 0.5) * (0.6 + Math.random() * 0.7), size: (o.size || 3) * (0.6 + Math.random() * 0.8),
        size2: o.size2 == null ? 0 : o.size2, color: Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color,
        drag: o.drag, grav: o.grav, shape: o.shape, glow: o.glow, add: o.add, vr: (Math.random() - 0.5) * 10 });
    }
  }
  update(dt) {
    const p = this.p; let j = 0;
    for (let i = 0; i < p.length; i++) {
      const q = p[i]; q.t += dt; if (q.t >= q.life) continue;
      const d = Math.pow(q.drag, dt * 60); q.vx *= d; q.vy *= d; q.vy += q.grav * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt; p[j++] = q;
    }
    p.length = j;
  }
  draw(ctx) {
    const p = this.p;
    for (let i = 0; i < p.length; i++) {
      const q = p[i], k = q.t / q.life, s = q.size + (q.size2 - q.size) * k, alpha = 1 - k * k;
      ctx.globalAlpha = alpha; ctx.fillStyle = q.color; ctx.strokeStyle = q.color;
      ctx.globalCompositeOperation = q.add ? 'lighter' : 'source-over';
      if (q.glow) { ctx.shadowBlur = q.glow; ctx.shadowColor = q.color; } else ctx.shadowBlur = 0;
      if (q.shape === 'dot') { ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.1, s), 0, Math.PI * 2); ctx.fill(); }
      else if (q.shape === 'spark') { ctx.lineWidth = Math.max(1, s * 0.5); ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.04, q.y - q.vy * 0.04); ctx.stroke(); }
      else if (q.shape === 'ring') { ctx.lineWidth = Math.max(1, 3 * (1 - k)); ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.1, s), 0, Math.PI * 2); ctx.stroke(); }
      else if (q.shape === 'square') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillRect(-s / 2, -s / 2, s, s); ctx.restore(); }
      else if (q.shape === 'tri') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.87, s * 0.5); ctx.lineTo(-s * 0.87, s * 0.5); ctx.closePath(); ctx.fill(); ctx.restore(); }
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'source-over';
  }
  clear() { this.p.length = 0; }
}

class Floaters {
  constructor() { this.items = []; }
  add(x, y, text, o = {}) {
    this.items.push({ x, y, text, t: 0, life: o.life || 0.9, color: o.color || '#fff', size: o.size || 16, vy: o.vy == null ? -60 : o.vy, vx: o.vx || (Math.random() - 0.5) * 30, crit: !!o.crit, font: o.font });
    if (this.items.length > 120) this.items.shift();
  }
  update(dt) { const a = this.items; let j = 0; for (let i = 0; i < a.length; i++) { const f = a[i]; f.t += dt; if (f.t >= f.life) continue; f.y += f.vy * dt; f.x += f.vx * dt; f.vy *= Math.pow(0.9, dt * 60); a[j++] = f; } a.length = j; }
  draw(ctx) {
    for (const f of this.items) {
      const k = f.t / f.life, pop = f.t < 0.12 ? 1 + (0.12 - f.t) * 4 : 1;
      ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      ctx.font = `${f.crit ? 900 : 700} ${Math.round(f.size * pop)}px ${f.font || 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif'}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
  clear() { this.items.length = 0; }
}

class Camera {
  constructor() { this.x = 0; this.y = 0; this.shake = 0; this.sx = 0; this.sy = 0; this.hitstop = 0; this.zoom = 1; this.zoomT = 1; this.kickX = 0; this.kickY = 0; }
  addShake(a) { this.shake = Math.min(28, this.shake + a); }
  kick(dx, dy) { this.kickX += dx; this.kickY += dy; }
  freeze(sec) { this.hitstop = Math.max(this.hitstop, sec); }
  update(dt) {
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 40); const a = Math.random() * Math.PI * 2; this.sx = Math.cos(a) * this.shake; this.sy = Math.sin(a) * this.shake; } else { this.sx = this.sy = 0; }
    this.kickX *= Math.pow(0.001, dt); this.kickY *= Math.pow(0.001, dt);
    this.zoom += (this.zoomT - this.zoom) * Math.min(1, dt * 6);
  }
  /* returns time scale after consuming hit-stop */
  consume(dt) { if (this.hitstop > 0) { this.hitstop -= dt; return 0.08; } return 1; }
}

const Ease = {
  outCubic: t => 1 - Math.pow(1 - t, 3), inCubic: t => t * t * t, outBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  outElastic: t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
  inOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  lerp: (a, b, t) => a + (b - a) * t, clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  damp: (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt)),
};
