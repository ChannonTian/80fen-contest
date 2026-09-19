/* sampler2.js —— EG 世界采样的两项升级(官方 DESIGN §7 记录在案、未实现):
 * 1) 软推断加权:卡牌流向「该门断门概率低」的座位(Kermit 做法,文献值 +22%)
 * 2) 底牌先验:庄家埋底有策略(不埋主、倾向不埋分)→ 低价值牌更可能进底
 * 与 sampleWorlds 同接口:返回 [{hands, kitty}]
 */
'use strict';
const E = require('./engine.js');
const SUITS = ['S', 'H', 'D', 'C'];

function rngFrom(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 卡的「埋底倾向」:庄家绝不埋主、倾向不埋分、埋小牌 */
function kittyBias(c, trump) {
  const es = E.effSuit(c, trump);
  if (es === 'T') return 0.02;                      // 主牌几乎不埋
  if (c.rank === 14) return 0.05;                   // A 几乎不埋(控门)
  const o = E.ordIdx(c, trump);
  const pts = E.cardPoints(c);
  return Math.max(0.05, 1.4 - 0.05 * o - 0.06 * pts);   // 小牌、无分 → 更可能进底
}

/* 软推断加权采样。
 * track 需要:pVoidOf(seat,es), maxHoldIn(seat,es), voids, hsize, unseen, unseenTotal, getSuit。
 * view 需要:seat, hand, buriedKnown, history。
 * 返回 K 个世界(可能少于 K,>=minK 由调用方判断)。 */
function sampleWorldsSoft(track, view, K, cfg) {
  const trump = track.trump;
  const me = view.seat;
  const n = view.hand.length;
  const seats = [];
  for (let s = 0; s < 4; s++) if (s !== me) seats.push(s);

  /* 未见牌池 */
  const pool = [];
  let fake = 1000;
  for (let si = 0; si < 5; si++) {
    const suit = si === 4 ? 'X' : SUITS[si];
    const lo = si === 4 ? 15 : 2, hi = si === 4 ? 16 : 14;
    for (let r = lo; r <= hi; r++) {
      const cnt = track.unseen[si * 17 + r];
      for (let q = 0; q < cnt; q++) pool.push({ suit: suit, rank: r, id: fake++ });
    }
  }
  const sizes = {};
  for (const s of seats) sizes[s] = track.hsize[s];
  const kittySize = (view.buriedKnown && view.buriedKnown.length) ? 0 : 8;
  if (pool.length !== seats.reduce((a, s) => a + sizes[s], 0) + kittySize) return [];

  let seed = view.history.length * 7919 + me * 131 + n * 31;
  for (let i = 0; i < view.hand.length; i++) seed = (seed * 33 + view.hand[i].id) | 0;
  const rng = rngFrom(seed ^ 0x5bf03635);

  const out = [];
  for (let k = 0; k < K; k++) {
    let world = null;
    for (let retry = 0; retry < cfg.EG_RETRIES && !world; retry++) {
      const caps = Object.assign({}, sizes);
      const buckets = {};
      for (const s of seats) buckets[s] = [];
      const kitty = [];
      /* 最受限先安排 */
      const order = pool.slice();
      const allow = order.map(c => {
        const es = E.effSuit(c, trump);
        const list = [];
        for (const s of seats) {
          if (track.voids[s] && track.voids[s][es]) continue;
          if (track.maxHoldIn(s, es) !== Infinity && track.maxHoldIn(s, es) >= 3) {
            const cur = (buckets[s] || []).filter(x => E.effSuit(x, trump) === es).length;
            if (cur >= track.maxHoldIn(s, es)) continue;
          }
          list.push(s);
        }
        return list;
      });
      order.sort((a, b) => allow[order.indexOf(a)].length - allow[order.indexOf(b)].length);
      let ok = true;
      for (let i = 0; i < order.length && ok; i++) {
        const c = order[i];
        const es = E.effSuit(c, trump);
        /* 座位权重:剩余容量 × (1 − 该家断门软概率);底牌权重:容量 × 埋底倾向 */
        const w = [];
        let tot = 0;
        for (const s of seats) {
          if (caps[s] <= 0) continue;
          if (track.voids[s] && track.voids[s][es]) continue;
          const cur = buckets[s].filter(x => E.effSuit(x, trump) === es).length;
          if (track.maxHoldIn(s, es) !== Infinity && track.maxHoldIn(s, es) >= 3 && cur >= track.maxHoldIn(s, es)) continue;
          let wt = caps[s];
          if (track.pVoidOf) {
            const pv = track.pVoidOf(s, es);
            wt = caps[s] * (1 - 0.75 * pv);       // 软推断:别往疑似断门家塞
          }
          if (wt <= 0.0001) continue;
          w.push({ s, wt });
          tot += wt;
        }
        if (kittySize > 0 && kitty.length < kittySize) {
          const kw = kittySize * kittyBias(c, trump);
          if (kw > 0.0001) { w.push({ s: -1, wt: kw }); tot += kw; }
        }
        if (!tot) { ok = false; break; }
        let r = rng() * tot;
        let pick = w[w.length - 1].s;
        for (const item of w) { r -= item.wt; if (r <= 0) { pick = item.s; break; } }
        if (pick === -1) { kitty.push(c); continue; }
        caps[pick]--;
        buckets[pick].push(c);
      }
      if (!ok) continue;
      let allFull = true;
      for (const s of seats) if (buckets[s].length !== sizes[s]) { allFull = false; break; }
      if (!allFull) continue;
      const hands = [null, null, null, null];
      hands[me] = view.hand;
      for (const s of seats) hands[s] = buckets[s];
      world = { hands, kitty };
    }
    if (world) out.push(world);
  }
  return out;
}

module.exports = { sampleWorldsSoft, kittyBias };
