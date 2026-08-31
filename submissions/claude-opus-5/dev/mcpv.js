/* dev/mcpv.js —— 合法版:采样一致的世界 + 每个世界里走子到底,对候选取平均。
 * 先在 dev 里量,值得再搬进提交代码。 */
'use strict';
const E = require('../engine.js');
const M = require('../moves.js');
const S = require('../strategy.js');
const { playout } = require('./pvbot.js');

const ALLSUITS = ['S', 'H', 'D', 'C'];
const SK = ['T', 'S', 'H', 'D', 'C'];

function mkRng(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 采 K 个与「各家剩几张 + 已知断门」一致的世界 */
function sampleWorlds(a, view, K) {
  const trump = a.trump, me = view.seat;
  const pool = [];
  let fake = 1000;
  for (let si = 0; si < 5; si++) {
    const suit = si === 4 ? 'X' : ALLSUITS[si];
    const lo = si === 4 ? 15 : 2, hi = si === 4 ? 16 : 14;
    for (let r = lo; r <= hi; r++) {
      for (let q = 0; q < a.unseen[si * 17 + r]; q++) pool.push({ suit, rank: r, id: fake++ });
    }
  }
  const seats = [];
  for (let p = 0; p < 4; p++) if (p !== me) seats.push(p);
  const caps0 = seats.map(p => Math.max(0, a.hsize[p]));
  caps0.push(Math.max(0, a.kittyUnknown));
  const H = caps0.length;
  const allow = pool.map(c => {
    const es = E.effSuit(c, trump);
    const l = [];
    for (let h = 0; h < H; h++) { if (h < seats.length && a.voids[seats[h]][es]) continue; l.push(h); }
    return l.length ? l : [H - 1];
  });
  const order = pool.map((_, i) => i).sort((x, y) => allow[x].length - allow[y].length);
  let seed = view.history.length * 7919 + me * 131 + view.hand.length * 31;
  for (const c of view.hand) seed = (seed * 33 + c.id) | 0;
  const rng = mkRng(seed);
  const out = [];
  for (let k = 0; k < K; k++) {
    const caps = caps0.slice();
    const buckets = []; for (let h = 0; h < H; h++) buckets.push([]);
    for (let i = order.length - 1; i > 0; i--) {
      if (allow[order[i]].length !== allow[order[i - 1]].length) continue;
      const j = i - (rng() < 0.5 ? 1 : 0);
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    for (const ci of order) {
      const l = allow[ci];
      let tot = 0; for (const h of l) tot += caps[h];
      let pick = -1;
      if (tot > 0) { let r = rng() * tot; for (const h of l) { r -= caps[h]; if (r <= 0) { pick = h; break; } } if (pick < 0) pick = l[l.length - 1]; }
      else { for (let h = 0; h < H; h++) if (caps[h] > 0) { pick = h; break; } if (pick < 0) pick = H - 1; }
      caps[pick]--; buckets[pick].push(pool[ci]);
    }
    const hands = [null, null, null, null];
    hands[me] = view.hand.slice();
    seats.forEach((p, i) => { hands[p] = buckets[i]; });
    out.push(hands);
  }
  return out;
}

function mcpvbot(maxCards, K, topM) {
  const inner = S.makeAI();
  let cache = null;
  return {
    name: 'mcpv' + maxCards + 'k' + K,
    onDeal: inner.onDeal, onRebel: inner.onRebel, discard: inner.discard,
    lead(v) {
      if (v.hand.length > maxCards) return inner.lead(v);
      const trump = v.trump, declTeam = v.declSeat % 2;
      const a = S.analyze(v, cache); cache = a.cache;
      const kp = v.buriedKnown && v.buriedKnown.length ? E.countPoints(v.buriedKnown) : 4;
      let cands = M.genLeadCandidates(v.hand, trump).concat(M.genThrowCandidates(v.hand, trump, 10));
      const seen = new Set(); const uniq = [];
      for (const cd of cands) {
        const k = cd.map(c => c.id).sort((x, y) => x - y).join(',');
        if (seen.has(k) || !E.classify(cd, trump)) continue;
        seen.add(k); uniq.push(cd);
      }
      if (uniq.length <= 1) return uniq[0] || inner.lead(v);
      if (topM && uniq.length > topM) uniq.length = topM;
      const worlds = sampleWorlds(a, v, K);
      let best = null, bv = -1e9;
      for (const cd of uniq) {
        let s = 0;
        for (const w of worlds) {
          const hands = w.map(h => h.slice());
          const ids = new Set(cd.map(c => c.id));
          hands[v.seat] = hands[v.seat].filter(c => !ids.has(c.id));
          s += playout(hands, trump, [{ seat: v.seat, cards: cd }], v.seat, v.myTeam, kp, declTeam);
        }
        if (s > bv) { bv = s; best = cd; }
      }
      return best || inner.lead(v);
    },
    follow(v, plays) {
      if (v.hand.length > maxCards) return inner.follow(v, plays);
      const trump = v.trump, declTeam = v.declSeat % 2;
      const a = S.analyze(v, cache); cache = a.cache;
      const kp = v.buriedKnown && v.buriedKnown.length ? E.countPoints(v.buriedKnown) : 4;
      const lead = E.classify(plays[0].cards, trump);
      const cands = M.genFollowCandidates(v.hand, lead, trump, null, topM || 24, 8);
      if (cands.length <= 1) return cands[0] || inner.follow(v, plays);
      const worlds = sampleWorlds(a, v, K);
      let best = null, bv = -1e9;
      for (const cd of cands) {
        let s = 0;
        const ids = new Set(cd.map(c => c.id));
        for (const w of worlds) {
          const hands = w.map(h => h.slice());
          hands[v.seat] = hands[v.seat].filter(c => !ids.has(c.id));
          s += playout(hands, trump, plays.concat([{ seat: v.seat, cards: cd }]), plays[0].seat, v.myTeam, kp, declTeam);
        }
        if (s > bv) { bv = s; best = cd; }
      }
      return best && E.isLegalFollow(v.hand, lead, best, trump, null) ? best : inner.follow(v, plays);
    },
  };
}
module.exports = { mcpvbot, sampleWorlds };
