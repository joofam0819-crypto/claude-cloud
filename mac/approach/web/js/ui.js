/* APPROACH UI: DOM screens, HUD and toasts. */
class UI {
  constructor(game) {
    this.game = game;
    this.$ = id => document.getElementById(id);
    this.screens = ['title', 'howto', 'pause', 'upgrade', 'over', 'settings', 'stats'];
    this.scoreShown = 0; this.toastTimer = null;
  }
  applyStrings() {
    const S = this.game.S;
    document.querySelectorAll('[data-i18n]').forEach(el => { const k = el.getAttribute('data-i18n'); if (S[k]) el.textContent = S[k]; });
    const how = this.$('howto-body'); how.innerHTML = '';
    S.howtoBody.forEach(t => { const li = document.createElement('li'); li.textContent = t; how.appendChild(li); });
    document.documentElement.lang = this.game.lang;
    this.refreshTitle();
  }
  refreshTitle() {
    const S = this.game.S, save = this.game.save;
    const best = save.best.run || 0, bestDaily = (save.daily[this.game.dailyKey()] || {}).score;
    this.$('title-best').textContent = best ? `${S.best} ${best.toLocaleString()}` : '';
    this.$('daily-sub').textContent = `${this.game.dailyKey()}${bestDaily ? ' · ' + S.best + ' ' + bestDaily.toLocaleString() : ''}`;
  }
  show(id) {
    for (const s of this.screens) { const el = this.$(s); if (el) el.classList.toggle('on', s === id); }
    document.body.classList.toggle('overlay', !!id);
  }
  hud(on) { this.$('hud').classList.toggle('on', on); }
  updateHUD(sim, dt) {
    if (!sim) return;
    const S = this.game.S;
    this.scoreShown += (sim.score - this.scoreShown) * Math.min(1, dt * 8);
    if (Math.abs(sim.score - this.scoreShown) < 1) this.scoreShown = sim.score;
    this.$('hud-score').textContent = Math.round(this.scoreShown).toLocaleString();
    const mult = this.$('hud-mult'); mult.textContent = '×' + sim.mult; mult.classList.toggle('hot', sim.mult > 1);
    this.$('hud-shift').textContent = sim.daily ? S.daily : `${S.shift} ${sim.shiftIndex}`;
    this.$('hud-landings').textContent = sim.landings;
    const left = Math.max(0, sim.cfg.duration - sim.shiftTime);
    this.$('hud-time').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    this.$('hud-bar').style.width = (100 * Math.min(1, sim.shiftTime / sim.cfg.duration)) + '%';
    const inc = this.$('hud-incidents'); inc.innerHTML = '';
    for (let i = 0; i < 3; i++) { const d = document.createElement('i'); if (i < sim.incidents) d.className = 'hit'; inc.appendChild(d); }
    const extras = [];
    if (sim.hasUpgrade('tcas')) extras.push(`TCAS ${sim.tcasLeft}`);
    if (sim.hasUpgrade('slow')) extras.push(`◷ ${sim.slowLeft.toFixed(0)}s`);
    this.$('hud-extras').textContent = extras.join('  ');
    const flying = sim.aircraft.filter(a => a.state === 'flying').length;
    this.$('hud-traffic').textContent = `✈ ${flying}`;
  }
  toast(text, kind = '') {
    const el = this.$('toast'); el.textContent = text; el.className = 'show ' + kind;
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { el.className = ''; }, 1800);
  }
  hint(text) { const el = this.$('hint'); el.textContent = text || ''; el.classList.toggle('on', !!text); }

  showUpgrades(sim, choices, onPick) {
    const S = this.game.S, lang = this.game.lang;
    const last = sim.history[sim.history.length - 1] || { landings: 0, bonus: 0 };
    this.$('upgrade-summary').textContent = `${S.shift} ${sim.shiftIndex} · ${S.landings} ${last.landings} · +${last.bonus}`;
    const wrap = this.$('upgrade-cards'); wrap.innerHTML = '';
    choices.forEach((u, i) => {
      const lvl = sim.upgrades[u.id] || 0;
      const card = document.createElement('button'); card.className = 'card'; card.type = 'button';
      card.innerHTML = `<span class="key">${i + 1}</span><span class="icon">${u.icon}</span><span class="name">${u.name[lang]}</span><span class="desc">${u.desc[lang]}</span>${lvl ? `<span class="lvl">Lv.${lvl} → ${lvl + 1}</span>` : ''}`;
      card.addEventListener('click', () => onPick(u.id));
      wrap.appendChild(card);
    });
    this.show('upgrade');
  }

  showGameOver(sim, best, newBest) {
    const S = this.game.S;
    const reason = sim.overReason === 'crash' ? S.crash : sim.overReason === 'incidents' ? S.incidents : sim.overReason === 'dailyDone' ? S.shiftClear : S.gameOver;
    this.$('over-title').textContent = sim.overReason === 'dailyDone' ? S.shiftClear : S.gameOver;
    this.$('over-reason').textContent = reason;
    this.$('over-score').textContent = sim.score.toLocaleString();
    this.$('over-landings').textContent = sim.landings;
    this.$('over-shift').textContent = sim.daily ? S.daily : `${S.shift} ${sim.shiftIndex}`;
    this.$('over-best').textContent = `${S.best} ${best.toLocaleString()}`;
    this.$('over-newbest').style.display = newBest ? 'inline-block' : 'none';
    this.$('over-planes').textContent = '✈'.repeat(Math.min(24, sim.landings)) + (sim.perfects ? ' ★' + sim.perfects : '');
    this.show('over');
  }

  showStats() {
    const S = this.game.S, save = this.game.save;
    const h = Math.floor(save.totalTime / 3600), m = Math.floor((save.totalTime % 3600) / 60);
    const rows = [
      [S.statsTotalLandings, save.totalLandings.toLocaleString()],
      [S.statsRuns, save.totalRuns.toLocaleString()],
      [S.best, (save.best.run || 0).toLocaleString()],
      [S.statsBestShift, save.best.shift || 0],
      [S.statsDaily, ((save.daily[this.game.dailyKey()] || {}).score || 0).toLocaleString()],
      [S.statsTime, `${h}h ${m}m`],
    ];
    const el = this.$('stats-body'); el.innerHTML = '';
    for (const [k, v] of rows) { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<span>${k}</span><b>${v}</b>`; el.appendChild(r); }
    this.show('stats');
  }

  renderSettings() {
    const g = this.game, s = g.settings;
    this.$('set-music').checked = s.music; this.$('set-sfx').checked = s.sfx; this.$('set-shake').checked = s.shake; this.$('set-flash').checked = s.flash;
    this.$('set-lang').value = s.lang;
  }
}
