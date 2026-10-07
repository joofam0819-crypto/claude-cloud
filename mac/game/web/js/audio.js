/* Procedural audio: synthesized SFX + generative chiptune music. No audio files. */
const Audio = (() => {
  let ctx = null, master, comp, sfxBus, musicBus, noiseBuf;
  let musicOn = true, sfxOn = true;
  const state = { intensity: 0, playing: false, seed: 1 };

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.9;
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 1 : 0;
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.42 : 0;
    sfxBus.connect(comp); musicBus.connect(comp); comp.connect(master); master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function unlock() { if (!init()) return; if (ctx.state === 'suspended') ctx.resume(); }
  const now = () => (ctx ? ctx.currentTime : 0);

  // ---- primitive voices -------------------------------------------------
  function tone(o) {
    if (!ctx || !sfxOn) return;
    const t0 = now() + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'square';
    const f0 = o.f || 440, f1 = o.f2 == null ? f0 : o.f2, dur = o.dur || 0.12;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) {
      if (o.slide === 'lin') osc.frequency.linearRampToValueAtTime(Math.max(1, f1), t0 + dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    }
    const g = ctx.createGain();
    const a = o.a == null ? 0.004 : o.a, vol = o.g == null ? 0.25 : o.g;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + a);
    if (o.hold) g.gain.setValueAtTime(vol, t0 + a + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.02);
    let node = osc;
    if (o.filt) {
      const bq = ctx.createBiquadFilter();
      bq.type = o.ftype || 'lowpass'; bq.frequency.setValueAtTime(o.filt, t0);
      if (o.filt2) bq.frequency.exponentialRampToValueAtTime(Math.max(20, o.filt2), t0 + dur);
      bq.Q.value = o.q || 1; node.connect(bq); node = bq;
    }
    if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); node.connect(p); node = p; }
    node.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  function noise(o) {
    if (!ctx || !sfxOn) return;
    const t0 = now() + (o.delay || 0), dur = o.dur || 0.2;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const bq = ctx.createBiquadFilter(); bq.type = o.ftype || 'lowpass';
    bq.frequency.setValueAtTime(o.filt || 1200, t0);
    if (o.filt2) bq.frequency.exponentialRampToValueAtTime(Math.max(20, o.filt2), t0 + dur);
    bq.Q.value = o.q || 0.7;
    const g = ctx.createGain(); const vol = o.g == null ? 0.25 : o.g;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + (o.a || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = bq; src.connect(bq);
    if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); node.connect(p); node = p; }
    node.connect(g); g.connect(o.bus || sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  // ---- music: generative step sequencer ---------------------------------
  // intensity 0 = menu/calm, 1 = play, 2 = tense, 3 = boss
  const SCALE = [0, 2, 3, 5, 7, 8, 10]; // natural minor
  const PROGS = [[0, 5, 3, 4], [0, 3, 5, 4], [0, 6, 3, 4], [0, 4, 5, 3]];
  let bpm = 112, step = 0, nextT = 0, timer = null, bar = 0, prog = PROGS[0], melody = [];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function rngFrom(seed) { let s = seed >>> 0 || 1; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function regenMelody() {
    const r = rngFrom(state.seed * 7919 + bar);
    prog = PROGS[Math.floor(r() * PROGS.length)];
    melody = [];
    let deg = 7;
    for (let i = 0; i < 32; i++) {
      if (r() < 0.62) { deg += Math.round((r() - 0.5) * 4); deg = Math.max(4, Math.min(13, deg)); melody.push(deg); }
      else melody.push(null);
    }
  }
  function kick(t, v) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.25);
  }
  function hat(t, v, open) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.18 : 0.05));
    s.connect(f); f.connect(g); g.connect(musicBus); s.start(t); s.stop(t + 0.2);
  }
  function snare(t, v) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(f); f.connect(g); g.connect(musicBus); s.start(t); s.stop(t + 0.2);
    const o = ctx.createOscillator(), g2 = ctx.createGain(); o.type = 'triangle';
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.08);
    g2.gain.setValueAtTime(v * 0.7, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g2); g2.connect(musicBus); o.start(t); o.stop(t + 0.12);
  }
  function voice(t, midi, dur, v, type, cutoff, detune) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = mtof(midi); if (detune) o.detune.value = detune;
    f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.35), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.02);
  }
  function scheduleStep(t) {
    const I = state.intensity, s16 = step % 16, chordIdx = Math.floor(step / 16) % 4;
    const root = 45 + SCALE[prog[chordIdx] % 7] + (prog[chordIdx] >= 7 ? 12 : 0); // A2 based
    const beat = 60 / bpm, sixteenth = beat / 4;
    // drums
    if (I >= 1) {
      if (s16 % 4 === 0) kick(t, 0.9);
      if (I >= 2 && (s16 === 10 || (s16 === 15 && bar % 2 === 1))) kick(t, 0.6);
      if (s16 === 4 || s16 === 12) snare(t, 0.35);
      if (s16 % 2 === 0) hat(t, I >= 2 ? 0.16 : 0.1, false);
      else if (I >= 2 && s16 % 4 === 3) hat(t, 0.1, true);
    } else if (s16 % 8 === 0) kick(t, 0.5);
    // bass
    if (I >= 1 && (s16 % 2 === 0)) {
      const bn = root + (s16 % 8 === 6 ? 7 : s16 % 8 === 4 ? 3 : 0);
      voice(t, bn, sixteenth * 1.8, I >= 2 ? 0.34 : 0.26, 'sawtooth', I >= 2 ? 900 : 600, 0);
    } else if (I === 0 && s16 === 0) voice(t, root, beat * 3.5, 0.22, 'triangle', 500, 0);
    // pad (two detuned saws) on chord change
    if (s16 === 0) {
      const third = root + 12 + 3, fifth = root + 12 + 7;
      [root + 12, third, fifth].forEach((m, i) => {
        voice(t, m, beat * 4, I >= 3 ? 0.07 : 0.05, 'sawtooth', I === 0 ? 700 : 1400, i === 1 ? 8 : -8);
      });
    }
    // lead melody
    if (I >= 1 || s16 % 4 === 0) {
      const deg = melody[(step % 32)];
      if (deg != null && (I >= 1 || s16 % 8 === 0)) {
        const m = root + 24 + SCALE[deg % 7] + Math.floor(deg / 7) * 12;
        voice(t, m, sixteenth * (I >= 2 ? 1.2 : 1.9), I >= 2 ? 0.16 : 0.12, 'square', I >= 3 ? 3600 : 2200, 0);
        if (I >= 3) voice(t + sixteenth * 0.5, m + 12, sixteenth * 0.8, 0.05, 'square', 4000, 0);
      }
    }
    step++;
    if (step % 64 === 0) { bar++; if (bar % 2 === 0) regenMelody(); }
  }
  function tick() {
    if (!ctx || !state.playing) return;
    const ahead = now() + 0.12, sixteenth = 60 / bpm / 4;
    while (nextT < ahead) { scheduleStep(nextT); nextT += sixteenth; }
  }
  function startMusic(seed) {
    if (!init()) return;
    if (seed != null) state.seed = seed;
    if (state.playing) return;
    regenMelody(); step = 0; bar = 0; nextT = now() + 0.05; state.playing = true;
    timer = setInterval(tick, 40);
  }
  function stopMusic() { state.playing = false; if (timer) clearInterval(timer); timer = null; }
  function setIntensity(i) {
    if (!ctx) return;
    state.intensity = Math.max(0, Math.min(3, i | 0));
    bpm = [96, 118, 128, 140][state.intensity];
  }
  function setMusic(on) { musicOn = on; if (ctx) musicBus.gain.setTargetAtTime(on ? 0.42 : 0, now(), 0.05); }
  function setSfx(on) { sfxOn = on; if (ctx) sfxBus.gain.setTargetAtTime(on ? 1 : 0, now(), 0.02); }
  function duck(amount, dur) { if (!ctx) return; const t = now(); musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(musicBus.gain.value, t); musicBus.gain.linearRampToValueAtTime((musicOn ? 0.42 : 0) * (1 - amount), t + 0.02); musicBus.gain.linearRampToValueAtTime(musicOn ? 0.42 : 0, t + dur); }

  return { init, unlock, tone, noise, startMusic, stopMusic, setIntensity, setMusic, setSfx, duck, get ready() { return !!ctx; }, get musicOn() { return musicOn; }, get sfxOn() { return sfxOn; } };
})();
