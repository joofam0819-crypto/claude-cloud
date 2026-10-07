// Headless balance simulation: an AI dispatcher plays APPROACH across many seeds.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SIM = require('../approach/web/js/sim.js');

const seeds = Number(process.argv[2] || 24), maxShift = Number(process.argv[3] || 6), sepTime = Number(process.argv[4] || 11);
const perShift = {};
let totalLand = 0, crashes = 0, incidentsOver = 0;
for (let seed = 1; seed <= seeds; seed++) {
  const sim = new SIM.Sim({ seed }); const ai = new SIM.Autopilot(sim, { sepTime });
  sim.startShift(1);
  let t = 0; const dt = 1 / 30;
  while (sim.state !== 'over' && t < 4000) {
    if (sim.state === 'shiftClear') {
      const k = sim.shiftIndex; perShift[k] = perShift[k] || { cleared: 0, landings: 0, near: 0, reached: 0 };
      perShift[k].cleared++; perShift[k].landings += sim.shiftLandings; perShift[k].near += sim.nearMisses;
      if (k >= maxShift) break;
      if (sim.pendingUpgradeChoices) sim.chooseUpgrade(sim.pendingUpgradeChoices[0].id);
      sim.nextShift(); ai.plans.clear(); continue;
    }
    ai.update(dt); sim.update(dt); t += dt; sim.drainEvents();
  }
  for (let k = 1; k <= sim.shiftIndex; k++) { perShift[k] = perShift[k] || { cleared: 0, landings: 0, near: 0, reached: 0 }; perShift[k].reached++; }
  totalLand += sim.landings;
  if (sim.overReason === 'crash') crashes++; else if (sim.overReason === 'incidents') incidentsOver++;
}
console.log(`seeds=${seeds} crashes=${crashes} incidentOvers=${incidentsOver} avgLandings=${(totalLand / seeds).toFixed(1)}`);
for (const k of Object.keys(perShift).sort((a, b) => a - b)) {
  const p = perShift[k];
  console.log(`shift ${k}: reached ${p.reached}, cleared ${p.cleared} (${Math.round(100 * p.cleared / Math.max(1, p.reached))}%), avg landings ${(p.landings / Math.max(1, p.cleared)).toFixed(1)}`);
}
