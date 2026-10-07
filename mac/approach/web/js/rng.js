/* Seeded RNG (mulberry32) + helpers. Deterministic runs => daily seeds, replays, tests. */
class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 0x9E3779B9; }
  next() { let t = (this.s += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  gauss() { let u = 0, v = 0; while (u === 0) u = this.next(); while (v === 0) v = this.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
}
function hashString(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function dailySeed(date = new Date()) { const k = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`; return hashString('daily:' + k); }

if (typeof module !== "undefined") module.exports = { RNG, hashString, dailySeed };
