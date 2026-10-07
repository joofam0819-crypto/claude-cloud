/* APPROACH — game orchestration: loop, input, feedback, persistence. */
class Game {
  constructor() {
    this.cv = document.getElementById('c');
    this.renderer = new Renderer(this.cv);
    this.particles = new Particles(1800); this.floaters = new Floaters(); this.cam = new Camera();
    this.save = Save.load(); this.settings = this.save.settings;
    this.lang = this.resolveLang(); this.S = CONTENT.STRINGS[this.lang];
    this.ui = new UI(this);
    this.sim = null; this.mode = 'title'; this.attract = null; this.drawing = null; this.hover = null;
    this.dangerFlash = 0; this.hitstop = 0; this.overTimer = 0; this.last = performance.now(); this.hintStage = 0; this.slowHeld = false;
    this.lastShiftIndex = 0;
    Input.attach(this.cv);
    this.bindDOM();
    this.renderer.resize(); window.addEventListener('resize', () => this.renderer.resize());
    this.ui.applyStrings(); this.ui.renderSettings();
    Audio.setMusic(this.settings.music); Audio.setSfx(this.settings.sfx);
    this.startAttract();
    this.ui.show('title');
    requestAnimationFrame(t => this.frame(t));
  }

  resolveLang() {
    const pref = this.settings.lang;
    if (pref === 'ko' || pref === 'en') return pref;
    return (navigator.language || 'en').toLowerCase().startsWith('ko') ? 'ko' : 'en';
  }
  dailyKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

  /* ---------- DOM wiring ---------- */
  bindDOM() {
    const $ = id => document.getElementById(id);
    const click = (id, fn) => $(id).addEventListener('click', () => { Audio.unlock(); Audio.sfx.ui(); fn(); });
    click('btn-start', () => this.startRun(false));
    click('btn-daily', () => this.startRun(true));
    click('btn-howto', () => this.ui.show('howto'));
    click('btn-stats', () => this.ui.showStats());
    click('btn-settings', () => { this.ui.renderSettings(); this.ui.show('settings'); });
    for (const id of ['btn-howto-back', 'btn-stats-back', 'btn-settings-back']) click(id, () => this.ui.show(this.mode === 'paused' ? 'pause' : 'title'));
    click('btn-resume', () => this.togglePause());
    click('btn-pause-restart', () => this.startRun(this.sim && this.sim.daily));
    click('btn-pause-quit', () => this.quitToTitle());
    click('btn-pause-settings', () => { this.ui.renderSettings(); this.ui.show('settings'); });
    click('btn-over-restart', () => this.startRun(this.sim && this.sim.daily));
    click('btn-over-quit', () => this.quitToTitle());
    click('btn-share', () => this.share());
    const setBool = (id, key, apply) => $(id).addEventListener('change', e => { this.settings[key] = e.target.checked; Save.save(); if (apply) apply(e.target.checked); });
    setBool('set-music', 'music', v => Audio.setMusic(v)); setBool('set-sfx', 'sfx', v => Audio.setSfx(v)); setBool('set-shake', 'shake'); setBool('set-flash', 'flash');
    $('set-lang').addEventListener('change', e => { this.settings.lang = e.target.value; Save.save(); this.lang = this.resolveLang(); this.S = CONTENT.STRINGS[this.lang]; this.ui.applyStrings(); });
    // pointer input for drawing paths
    this.cv.addEventListener('pointerdown', e => this.onPointerDown(e));
    window.addEventListener('pointermove', e => this.onPointerMove(e));
    window.addEventListener('pointerup', e => this.onPointerUp(e));
    window.addEventListener('pointercancel', () => { this.drawing = null; });
    window.addEventListener('keydown', e => this.onKey(e));
    window.addEventListener('blur', () => { if (this.mode === 'playing') this.togglePause(); });
  }

  /* ---------- modes ---------- */
  startAttract() {
    const sim = new SIM.Sim({ seed: 1234 + (Date.now() % 1000) }); sim.startShift(1);
    this.attract = { sim, ai: new SIM.Autopilot(sim, { sepTime: 12 }) };
  }
  startRun(daily) {
    Audio.unlock();
    const seed = daily ? dailySeed() : ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
    this.sim = new SIM.Sim({ seed, daily }); this.sim.startShift(1);
    this.attract = null; this.mode = 'playing'; this.drawing = null; this.hover = null; this.overTimer = 0; this.hintStage = 0; this.lastShiftIndex = 1;
    this.particles.clear(); this.floaters.clear(); this.ui.scoreShown = 0;
    this.ui.show(null); this.ui.hud(true);
    Audio.startMusic(seed); Audio.setIntensity(1);
    this.ui.hint(this.save.totalRuns < 3 ? this.S.hint1 : '');
    this.ui.toast(`${daily ? this.S.daily : this.S.shift + ' 1'} · ${this.renderer.palette(this.sim).name}`);
  }
  quitToTitle() {
    this.mode = 'title'; this.sim = null; this.drawing = null; this.ui.hud(false); this.ui.hint('');
    Audio.setIntensity(0); this.startAttract(); this.ui.refreshTitle(); this.ui.show('title');
  }
  togglePause() {
    if (this.mode === 'playing') { this.mode = 'paused'; this.ui.show('pause'); Audio.duck(0.6, 0.3); }
    else if (this.mode === 'paused') { this.mode = 'playing'; this.ui.show(null); Audio.setIntensity(Audio.intensity); }
  }
  finishRun() {
    const sim = this.sim, save = this.save;
    save.totalRuns++; save.totalLandings += sim.landings; save.totalTime += sim.totalTime;
    let newBest = false;
    if (sim.daily) {
      const k = this.dailyKey(); const prev = save.daily[k];
      if (!prev || sim.score > prev.score) { save.daily[k] = { score: sim.score, landings: sim.landings }; newBest = !!prev; }
      Save.save();
      this.ui.showGameOver(sim, save.daily[k].score, newBest && sim.score === save.daily[k].score);
    } else {
      if (sim.score > (save.best.run || 0)) { newBest = (save.best.run || 0) > 0; save.best.run = sim.score; }
      save.best.shift = Math.max(save.best.shift || 0, sim.shiftIndex);
      Save.save();
      this.ui.showGameOver(sim, save.best.run, newBest);
    }
    this.mode = 'over'; this.ui.hud(false); this.ui.hint('');
    Audio.setIntensity(0);
  }
  share() {
    const text = this.sim.shareText(this.lang);
    const done = () => this.ui.toast(this.S.copied, 'ok');
    const bridge = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.native;
    if (bridge) { bridge.postMessage({ type: 'copy', value: text }); done(); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, () => this.fallbackCopy(text, done)); return; }
    this.fallbackCopy(text, done);
  }
  fallbackCopy(text, done) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (_) {} document.body.removeChild(ta);
  }
  toggleFullscreen() {
    const bridge = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.native;
    if (bridge) { bridge.postMessage({ type: 'fullscreen' }); return; }
    if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  }

  /* ---------- input ---------- */
  pointerWorld(e) { const r = this.cv.getBoundingClientRect(); return this.renderer.toWorld(e.clientX - r.left, e.clientY - r.top); }
  onPointerDown(e) {
    if (e.button !== 0) return;
    Audio.unlock();
    if (this.mode !== 'playing' || !this.sim) return;
    const w = this.pointerWorld(e);
    const a = this.sim.aircraftAt(w.x, w.y, 26 + 10 / this.renderer.scale);
    if (!a) return;
    this.drawing = { aircraft: a, points: [{ x: a.x, y: a.y }] };
    Audio.sfx.select();
    this.cv.setPointerCapture && this.cv.setPointerCapture(e.pointerId);
  }
  onPointerMove(e) {
    if (!this.sim) return;
    const w = this.pointerWorld(e);
    if (this.drawing) {
      const pts = this.drawing.points, last = pts[pts.length - 1];
      if (Math.hypot(w.x - last.x, w.y - last.y) > 4) pts.push(w);
      if (pts.length > 400) pts.splice(1, 1);
    } else if (this.mode === 'playing') {
      const a = this.sim.aircraftAt(w.x, w.y, 22 + 8 / this.renderer.scale);
      this.hover = a ? a.id : null;
    }
  }
  onPointerUp(e) {
    if (!this.drawing) return;
    const d = this.drawing; this.drawing = null;
    if (this.mode !== 'playing' || !this.sim) return;
    if (d.points.length >= 2) {
      this.sim.assignPath(d.aircraft.id, d.points);
      Audio.sfx.pathSet();
      if (this.hintStage === 0) { this.hintStage = 1; this.ui.hint(this.save.totalRuns < 3 ? this.S.hint2 : ''); }
    }
  }
  onKey(e) {
    if (e.metaKey) return;
    const code = e.code;
    if (code === 'KeyM') { this.settings.music = !this.settings.music; this.settings.sfx = this.settings.music; Audio.setMusic(this.settings.music); Audio.setSfx(this.settings.sfx); Save.save(); this.ui.renderSettings(); this.ui.toast(this.settings.music ? '🔊' : '🔇'); return; }
    if (code === 'KeyF') { this.toggleFullscreen(); return; }
    if (this.mode === 'playing') {
      if (code === 'Escape' || (code === 'Space' && !(this.sim && this.sim.hasUpgrade('slow')))) { e.preventDefault(); this.togglePause(); return; }
      if (code === 'KeyP') { this.togglePause(); return; }
    } else if (this.mode === 'paused') {
      if (code === 'Escape' || code === 'Space' || code === 'KeyP') { e.preventDefault(); this.togglePause(); return; }
    } else if (this.mode === 'upgrade') {
      const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(code);
      if (idx >= 0 && this.sim.pendingUpgradeChoices && this.sim.pendingUpgradeChoices[idx]) this.pickUpgrade(this.sim.pendingUpgradeChoices[idx].id);
    } else if (this.mode === 'over') {
      if (code === 'KeyR' || code === 'Enter' || code === 'Space') { e.preventDefault(); this.startRun(this.sim && this.sim.daily); }
      if (code === 'Escape') this.quitToTitle();
    } else if (this.mode === 'title') {
      if (code === 'Enter' || code === 'Space') { e.preventDefault(); this.startRun(false); }
    }
  }
  pickUpgrade(id) {
    if (!this.sim.chooseUpgrade(id)) return;
    Audio.sfx.upgrade();
    this.sim.nextShift(); this.mode = 'playing'; this.ui.show(null); this.ui.hud(true);
    this.lastShiftIndex = this.sim.shiftIndex;
    this.particles.clear(); this.floaters.clear();
    this.ui.toast(`${this.S.shift} ${this.sim.shiftIndex} · ${this.renderer.palette(this.sim).name}`);
    Audio.setIntensity(1);
  }

  /* ---------- loop ---------- */
  frame(now) {
    const raw = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.update(raw);
    this.renderer.draw(this.mode === 'title' && this.attract ? this.attract.sim : this.sim, this, raw);
    Input.endFrame();
    requestAnimationFrame(t => this.frame(t));
  }
  update(dt) {
    if (this.mode === 'title' && this.attract) {
      const { sim, ai } = this.attract;
      if (sim.state === 'running') { ai.update(dt); sim.update(dt); for (const e of sim.drainEvents()) this.fx(e, sim, true); }
      else this.startAttract();
    }
    if (this.sim && (this.mode === 'playing' || this.mode === 'over')) {
      let ts = this.cam.consume(dt);
      if (this.mode === 'over') ts = Math.min(ts, 0.25);
      // slow-motion upgrade
      this.slowHeld = this.mode === 'playing' && Input.isDown('Space') && this.sim.hasUpgrade('slow') > 0 && this.sim.useSlow(dt);
      if (this.slowHeld) ts *= 0.4;
      if (this.mode === 'playing' && this.sim.state === 'running') {
        this.sim.update(dt * ts);
        for (const e of this.sim.drainEvents()) this.fx(e, this.sim, false);
        if (this.sim.state === 'shiftClear') {
          this.mode = 'upgrade'; Audio.sfx.shiftEnd(); Audio.setIntensity(0); this.ui.hud(false);
          if (this.sim.pendingUpgradeChoices) this.ui.showUpgrades(this.sim, this.sim.pendingUpgradeChoices, id => this.pickUpgrade(id));
        }
        if (this.sim.state === 'over') { this.mode = 'over'; this.overTimer = this.sim.overReason === 'dailyDone' ? 0.6 : 1.6; }
        // music intensity follows traffic + danger
        const flying = this.sim.aircraft.filter(a => a.state === 'flying');
        const danger = flying.some(a => a.warn > 0) || flying.some(a => a.emergency);
        Audio.setIntensity(danger ? 3 : flying.length >= 7 ? 2 : 1);
        this.ui.updateHUD(this.sim, dt);
        if (this.hover && !this.sim.aircraft.some(a => a.id === this.hover && a.state === 'flying')) this.hover = null;
      } else if (this.mode === 'over') {
        // let the crash animation play, then show the summary
        this.sim.time += dt;
        this.overTimer -= dt;
        if (this.overTimer <= 0 && !document.getElementById('over').classList.contains('on')) this.finishRun();
      }
    }
    this.dangerFlash = Math.max(0, this.dangerFlash - dt * 2);
    this.cam.update(dt); this.particles.update(dt); this.floaters.update(dt);
  }

  /* ---------- feedback for sim events ---------- */
  fx(e, sim, quiet) {
    const P = this.particles, F = this.floaters, S = this.S, sc = p => this.renderer.toScreen(p.x, p.y);
    switch (e.type) {
      case 'spawn': { const p = sc(e); P.emit({ x: p.x, y: p.y, life: 0.9, size: 4, size2: 60 * this.renderer.scale, color: CONTENT.AIRCRAFT[e.atype].color, shape: 'ring', add: false }); if (!quiet) Audio.sfx.spawn(Math.max(-1, Math.min(1, e.x / 400))); if (!quiet && e.emergency) { Audio.sfx.emergency(); this.ui.toast(S.emergency + '!', 'warn'); } break; }
      case 'land': {
        const p = sc(e), col = CONTENT.DEST_COLORS[e.dest === 'C' ? 'B' : (e.dest.startsWith('H') ? 'H' : e.dest)] || '#fff';
        P.burst(p.x, p.y, e.perfect ? 40 : 22, { color: [col, '#ffffff'], speed: 160 * this.renderer.scale, life: 0.7, size: 3, glow: 8, drag: 0.88 });
        P.emit({ x: p.x, y: p.y, life: 0.7, size: 6, size2: 70 * this.renderer.scale, color: col, shape: 'ring', add: false });
        F.add(p.x, p.y - 18, `+${e.pts}`, { color: e.perfect ? '#ffd166' : '#ffffff', size: e.perfect ? 22 : 17, crit: e.perfect });
        if (e.perfect) F.add(p.x, p.y - 44, S.perfect, { color: '#ffd166', size: 13, life: 1.1 });
        if (e.emergency) F.add(p.x, p.y - 44, S.emergency + ' ✓', { color: '#ff8080', size: 13, life: 1.1 });
        if (!quiet) { Audio.sfx.land(e.streak, e.perfect); if (this.settings.shake) this.cam.addShake(2); }
        break;
      }
      case 'streak': { if (quiet) break; const c = this.renderer.toScreen(0, -300); F.add(c.x, c.y, `${S.mult} ×${e.mult}`, { color: '#ffd166', size: 26, life: 1.6, vy: -20, crit: true }); Audio.sfx.streak(e.mult); break; }
      case 'nearMiss': { const p = sc(e); P.emit({ x: p.x, y: p.y, life: 0.6, size: 10, size2: 90 * this.renderer.scale, color: '#ff4d4d', shape: 'ring', add: false }); F.add(p.x, p.y - 10, S.nearMiss + ' −50', { color: '#ff6b6b', size: 15 }); if (!quiet) { Audio.sfx.nearMiss(); this.dangerFlash = 1; if (this.settings.shake) this.cam.addShake(6); } break; }
      case 'crash': {
        const p = sc(e);
        P.burst(p.x, p.y, 120, { color: ['#ff6a00', '#ffd166', '#ffffff', '#333'], speed: 320 * this.renderer.scale, life: 1.4, size: 5, size2: 1, glow: 14, drag: 0.9, grav: 60 });
        P.burst(p.x, p.y, 40, { color: ['#222', '#555'], speed: 90 * this.renderer.scale, life: 2.2, size: 8, size2: 26, add: false, drag: 0.95 });
        P.emit({ x: p.x, y: p.y, life: 1.0, size: 10, size2: 220 * this.renderer.scale, color: '#ffb080', shape: 'ring', add: false });
        if (!quiet) { Audio.sfx.crash(); this.renderer.flash = 0.8; if (this.settings.shake) this.cam.addShake(26); this.cam.freeze(0.35); }
        break;
      }
      case 'goAround': { const p = sc(e); F.add(p.x, p.y - 16, S.goAround, { color: '#ffd166', size: 13 }); if (!quiet) Audio.sfx.goAround(); break; }
      case 'lowFuel': { if (!quiet) { Audio.sfx.lowFuel(); this.ui.toast(S.lowFuel, 'warn'); } break; }
      case 'fuelOut': case 'stormDivert': { const p = sc(e); P.burst(p.x, p.y, 30, { color: ['#ff9f43', '#ffffff'], speed: 120 * this.renderer.scale, life: 0.9, size: 3 }); F.add(p.x, p.y - 16, (e.type === 'fuelOut' ? S.fuelout : S.storm) + ' −150', { color: '#ff6b6b', size: 15 }); if (!quiet) { Audio.sfx.goAround(); this.dangerFlash = 1; if (this.settings.shake) this.cam.addShake(8); } break; }
      case 'stormEnter': { if (!quiet) { Audio.sfx.storm(); const p = sc(e); F.add(p.x, p.y - 16, S.storm + ' −30', { color: '#9fb3ff', size: 13 }); if (this.settings.shake) this.cam.addShake(3); } break; }
      case 'tcas': { const p = sc(e); P.emit({ x: p.x, y: p.y, life: 0.8, size: 10, size2: 120 * this.renderer.scale, color: '#ffffff', shape: 'ring', add: false }); F.add(p.x, p.y - 20, 'TCAS', { color: '#ffffff', size: 16, crit: true }); if (!quiet) { Audio.sfx.tcas(); this.cam.freeze(0.15); } break; }
      case 'shiftStart': { if (!quiet && sim.shiftIndex > 1 && this.hintStage < 2) { this.hintStage = 2; this.ui.hint(''); } break; }
      case 'gameOver': { if (!quiet && e.reason !== 'dailyDone') Audio.sfx.gameOver(); break; }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  window.__game = {
    ready: true,
    get game() { return game; },
    get sim() { return game.sim; },
    get mode() { return game.mode; },
    start(daily, seed) { game.startRun(!!daily); if (seed != null) { game.sim = new SIM.Sim({ seed, daily: !!daily }); game.sim.startShift(1); } return game.sim.seed; },
    assign(id, pts) { return game.sim.assignPath(id, pts); },
    toScreen(x, y) { return game.renderer.toScreen(x, y); },
    toWorld(x, y) { return game.renderer.toWorld(x, y); },
    step(seconds) { const dt = 1 / 60; for (let t = 0; t < seconds; t += dt) game.update(dt); },
    pick(idx) { const c = game.sim.pendingUpgradeChoices; if (c && c[idx]) game.pickUpgrade(c[idx].id); },
    particles() { return game.particles.p.length; },
    resetProgress() { Save.reset(); location.reload(); },
    settings: game.settings,
  };
});
