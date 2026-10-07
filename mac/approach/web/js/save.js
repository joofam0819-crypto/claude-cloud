/* Versioned localStorage save with defaults + safe JSON. */
const Save = (() => {
  const KEY = 'macgame.save.v1';
  const defaults = () => ({
    version: 1, best: {}, totalRuns: 0, totalKills: 0, totalTime: 0, unlocked: [], achievements: [],
    settings: { music: true, sfx: true, shake: true, flash: true, lang: 'auto', difficulty: 'normal' },
    daily: {}, lastSeen: 0,
  });
  let data = null;
  function load() {
    if (data) return data;
    data = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const parsed = JSON.parse(raw); data = Object.assign(defaults(), parsed); data.settings = Object.assign(defaults().settings, parsed.settings || {}); }
    } catch (_) { /* corrupted or unavailable storage: keep defaults */ }
    return data;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(load())); } catch (_) {} }
  function reset() { data = defaults(); try { localStorage.removeItem(KEY); } catch (_) {} save(); }
  return { load, save, reset, get data() { return load(); } };
})();
