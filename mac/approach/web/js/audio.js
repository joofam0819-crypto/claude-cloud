/* Procedural audio for APPROACH: synthesized SFX + generative ambient music. No audio files. */
const Audio = (() => {
  let ctx = null, master, comp, sfxBus, musicBus, delayNode, noiseBuf;
  let musicOn = true, sfxOn = true;
  const MUSIC_VOL = 0.5;
  const state = { intensity: 0, playing: false, seed: 1 };

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 24; comp.ratio.value = 5; comp.attack.value = 0.005; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = 0.9;
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 1 : 0;
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? MUSIC_VOL : 0;
    // a gentle feedback delay gives the music its "space"
    delayNode = ctx.createDelay(1.0); delayNode.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const dFilt = ctx.createBiquadFilter(); dFilt.type = 'lowpass'; dFilt.frequency.value = 2200;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    musicBus.connect(delayNode); delayNode.connect(dFilt); dFilt.connect(fb); fb.connect(delayNode); dFilt.connect(wet); wet.connect(comp);
    sfxBus.connect(comp); musicBus.connect(comp); comp.connect(master); master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function unlock() { if (!init()) return; if (ctx.state === 'suspended') ctx.resume(); }
  const now = () => (ctx ? ctx.currentTime : 0);
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // ---- primitive voices -------------------------------------------------
  function tone(o) {
    if (!ctx || (!sfxOn && !o.music)) return;
    const t0 = now() + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    const f0 = o.f || 440, f1 = o.f2 == null ? f0 : o.f2, dur = o.dur || 0.12;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const a = o.a == null ? 0.004 : o.a, vol = o.g == null ? 0.2 : o.g;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + a);
    if (o.hold) g.gain.setValueAtTime(vol, t0 + a + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.02);
    let node = osc;
    if (o.filt) {
      const bq = ctx.createBiquadFilter();
      bq.type = o.ftype || 'lowpass'; bq.frequency.setValueAtTime(o.filt, t0);
      if (o.filt2) bq.frequency.exponentialRampToValueAtTime(Math.max(20, o.filt2), t0 + dur);
      bq.Q.value = o.q || 0.8; node.connect(bq); node = bq;
    }
    if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); node.connect(p); node = p; }
    node.connect(g); g.connect(o.music ? musicBus : sfxBus);
    osc.start(t0); osc.stop(t0 + dur + 0.08);
  }
  function noise(o) {
    if (!ctx || (!sfxOn && !o.music)) return;
    const t0 = now() + (o.delay || 0), dur = o.dur || 0.2;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bq = ctx.createBiquadFilter(); bq.type = o.ftype || 'lowpass';
    bq.frequency.setValueAtTime(o.filt || 1200, t0);
    if (o.filt2) bq.frequency.exponentialRampToValueAtTime(Math.max(20, o.filt2), t0 + dur);
    bq.Q.value = o.q || 0.7;
    const g = ctx.createGain(); const vol = o.g == null ? 0.2 : o.g;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + (o.a || 0.004));
    if (o.hold) g.gain.setValueAtTime(vol, t0 + (o.a || 0.004) + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = bq; src.connect(bq);
    if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); node.connect(p); node = p; }
    node.connect(g); g.connect(o.music ? musicBus : sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  // ---- generative ambient music -----------------------------------------
  // Key: D minor-ish pentatonic field. Chords change every 8 beats; plucks follow the current chord.
  const PENTA = [0, 2, 3, 5, 7, 10];                    // minor pentatonic + 2
  const CHORDS = [[0, 3, 7, 10], [5, 8, 12, 15], [3, 7, 10, 14], [7, 10, 14, 17], [-2, 2, 5, 8]];
  let bpm = 64, beat = 0, nextT = 0, timer = null, chordIdx = 0, root = 50, rngState = 1;
  const rnd = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

  function pad(t, midi, dur, vol, cutoff) {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = mtof(midi); o.detune.value = det;
      f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.linearRampToValueAtTime(cutoff * 0.6, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.35); g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
    }
  }
  function pluck(t, midi, vol, pan) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), p = ctx.createStereoPanner();
    o.type = 'triangle'; o.frequency.value = mtof(midi); p.pan.value = pan;
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(f); f.connect(g); g.connect(p); p.connect(musicBus); o.start(t); o.stop(t + 1);
  }
  function thump(t, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.32);
  }
  function scheduleBeat(t) {
    const I = state.intensity;
    const secPerBeat = 60 / bpm;
    const b8 = beat % 8;
    if (b8 === 0) {
      chordIdx = (chordIdx + 1 + (rnd() < 0.25 ? 1 : 0)) % CHORDS.length;
      const chord = CHORDS[chordIdx];
      const cutoff = I === 0 ? 650 : I === 1 ? 900 : I === 2 ? 1300 : 1800;
      chord.forEach((n, i) => pad(t, root + n + (i === 0 ? -12 : 0), secPerBeat * 8.5, I >= 3 ? 0.05 : 0.045, cutoff));
      // bass
      const bo = ctx.createOscillator(), bg = ctx.createGain(); bo.type = 'sine'; bo.frequency.value = mtof(root + chord[0] - 24);
      bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(0.16, t + 0.3); bg.gain.setValueAtTime(0.16, t + secPerBeat * 6); bg.gain.exponentialRampToValueAtTime(0.0001, t + secPerBeat * 8);
      bo.connect(bg); bg.connect(musicBus); bo.start(t); bo.stop(t + secPerBeat * 8.1);
      if (I >= 3) pad(t, root + chord[1] + 13, secPerBeat * 8, 0.02, 2400); // tension colour
    }
    // plucks
    const density = [0.28, 0.45, 0.7, 0.9][I];
    const sub = I >= 2 ? 2 : 1;
    for (let s = 0; s < sub; s++) {
      if (rnd() < density) {
        const chord = CHORDS[chordIdx];
        const oct = rnd() < 0.3 ? 24 : 12;
        const n = root + chord[Math.floor(rnd() * chord.length)] + oct + (rnd() < 0.2 ? PENTA[Math.floor(rnd() * PENTA.length)] : 0);
        pluck(t + s * secPerBeat / 2, n, I >= 2 ? 0.11 : 0.09, rnd() * 1.4 - 0.7);
      }
    }
    if (I >= 2 && (b8 % 2 === 0)) thump(t, I >= 3 ? 0.35 : 0.22);
    if (I >= 3 && b8 % 2 === 1) thump(t + secPerBeat * 0.5, 0.18);
    beat++;
  }
  function tick() {
    if (!ctx || !state.playing) return;
    const ahead = now() + 0.25, secPerBeat = 60 / bpm;
    while (nextT < ahead) { scheduleBeat(nextT); nextT += secPerBeat; }
  }
  function startMusic(seed) {
    if (!init()) return;
    if (seed != null) { state.seed = seed; rngState = (seed >>> 0) || 1; }
    if (state.playing) return;
    beat = 0; chordIdx = 0; nextT = now() + 0.05; state.playing = true;
    timer = setInterval(tick, 60);
  }
  function stopMusic() { state.playing = false; if (timer) clearInterval(timer); timer = null; }
  function setIntensity(i) { state.intensity = Math.max(0, Math.min(3, i | 0)); bpm = [64, 72, 80, 92][state.intensity]; }
  function setMusic(on) { musicOn = on; if (ctx) musicBus.gain.setTargetAtTime(on ? MUSIC_VOL : 0, now(), 0.1); }
  function setSfx(on) { sfxOn = on; if (ctx) sfxBus.gain.setTargetAtTime(on ? 1 : 0, now(), 0.02); }
  function duck(amount, dur) {
    if (!ctx || !musicOn) return; const t = now(); musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(musicBus.gain.value, t);
    musicBus.gain.linearRampToValueAtTime(MUSIC_VOL * (1 - amount), t + 0.03); musicBus.gain.linearRampToValueAtTime(MUSIC_VOL, t + dur);
  }

  // ---- SFX library (harmonised with the music key) -----------------------
  const sfx = {
    ui() { tone({ type: 'sine', f: 1400, f2: 1800, dur: 0.05, g: 0.08 }); },
    select() { tone({ type: 'sine', f: 740, f2: 1100, dur: 0.07, g: 0.1 }); },
    pathSet() { tone({ type: 'triangle', f: 520, f2: 660, dur: 0.09, g: 0.1 }); noise({ filt: 3000, filt2: 800, dur: 0.12, g: 0.05 }); },
    land(streak, perfect) {
      const deg = PENTA[Math.min(PENTA.length - 1, Math.floor(streak / 2) % PENTA.length)] + 12 * Math.min(1, Math.floor(streak / 12));
      const m = root + 24 + deg;
      tone({ type: 'sine', f: mtof(m), dur: 0.5, g: 0.16, a: 0.01 });
      tone({ type: 'sine', f: mtof(m + 7), dur: 0.45, g: 0.09, a: 0.01, delay: 0.05 });
      tone({ type: 'triangle', f: mtof(m + 12), dur: 0.35, g: 0.05, delay: 0.1 });
      noise({ filt: 500, filt2: 120, dur: 0.35, g: 0.12 });
      if (perfect) { [0, 4, 7, 12].forEach((n, i) => tone({ type: 'sine', f: mtof(m + 12 + n), dur: 0.25, g: 0.07, delay: 0.12 + i * 0.07 })); }
    },
    nearMiss() { duck(0.5, 1.2); [0, 0.18].forEach(d => tone({ type: 'square', f: 640, dur: 0.14, g: 0.11, delay: d, filt: 2200 })); },
    crash() {
      duck(0.9, 3); noise({ filt: 2600, filt2: 120, dur: 1.4, g: 0.6, a: 0.005 }); tone({ type: 'sine', f: 90, f2: 28, dur: 0.9, g: 0.5 });
      noise({ filt: 400, filt2: 60, dur: 2.2, g: 0.3, delay: 0.2 });
    },
    goAround() { tone({ type: 'sawtooth', f: 440, f2: 330, dur: 0.35, g: 0.08, filt: 1400 }); tone({ type: 'sawtooth', f: 445, f2: 333, dur: 0.35, g: 0.06, filt: 1400, delay: 0.02 }); },
    spawn(pan) { [0, 0.09, 0.2].forEach((d, i) => noise({ ftype: 'bandpass', filt: 1700 + i * 300, q: 3, dur: 0.06, g: 0.06, delay: d, pan: pan || 0 })); },
    emergency() { [0, 0.22, 0.44].forEach(d => tone({ type: 'square', f: 980, dur: 0.12, g: 0.07, delay: d, filt: 2600 })); },
    lowFuel() { [0, 0.25].forEach(d => tone({ type: 'sine', f: 880, f2: 820, dur: 0.14, g: 0.07, delay: d })); },
    storm() { noise({ filt: 160, filt2: 60, dur: 1.6, g: 0.4, a: 0.05 }); tone({ type: 'sine', f: 55, f2: 30, dur: 1.2, g: 0.25 }); },
    tcas() { [0, 0.1, 0.2, 0.3].forEach(d => tone({ type: 'square', f: 1200, dur: 0.07, g: 0.08, delay: d, filt: 3000 })); },
    upgrade() { [0, 4, 7, 12].forEach((n, i) => tone({ type: 'triangle', f: mtof(root + 24 + n), dur: 0.3, g: 0.1, delay: i * 0.09 })); },
    shiftEnd() { [0, 7, 12, 16, 19].forEach((n, i) => tone({ type: 'sine', f: mtof(root + 12 + n), dur: 0.9, g: 0.1, delay: i * 0.12, a: 0.02 })); },
    streak(level) { [0, 3, 7, 10].forEach((n, i) => tone({ type: 'triangle', f: mtof(root + 36 + n + level * 2), dur: 0.22, g: 0.08, delay: i * 0.06 })); },
    gameOver() { [12, 10, 7, 3, 0].forEach((n, i) => tone({ type: 'triangle', f: mtof(root + 12 + n), dur: 0.6, g: 0.1, delay: i * 0.22, a: 0.02 })); },
  };

  return { init, unlock, tone, noise, sfx, startMusic, stopMusic, setIntensity, setMusic, setSfx, duck,
    get ready() { return !!ctx; }, get musicOn() { return musicOn; }, get sfxOn() { return sfxOn; }, get intensity() { return state.intensity; } };
})();
