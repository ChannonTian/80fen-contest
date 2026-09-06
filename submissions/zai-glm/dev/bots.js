/* 参照选手:与主 AI 独立、行为冻结的对照 bot。 */
'use strict';
const E = require('../engine.js');
const M = require('../moves.js');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* template:照 example/index.js 的行为(近似:从不亮、不反、扣前8张、出最小) */
function templateBot() {
  return {
    name: 'template',
    onDeal() { return null; },
    onRebel() { return false; },
    discard(view) { return view.hand.slice(0, 8); },
    lead(view) { return [view.hand[0]]; },
    follow(view, plays) { return view.hand.slice(0, plays[0].cards.length); },
  };
}

/* naive:全合法但无策略 —— 随机挑一个合法着法(种子由局面哈希决定,可复现) */
function naiveBot() {
  const rndOf = (view) => mulberry32(view.round * 1000003 + view.trickNo * 1009 + view.seat * 97 + view.history.length);
  return {
    name: 'naive',
    onDeal() { return null; },
    onRebel() { return false; },
    discard(view) {
      const r = rndOf(Object.assign({}, view, { trickNo: 99 }));
      const h = view.hand.slice();
      for (let i = h.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = h[i]; h[i] = h[j]; h[j] = t; }
      return h.slice(0, 8);
    },
    lead(view) {
      const r = rndOf(view);
      const h = view.hand.slice();
      const c = h[(r() * h.length) | 0];
      return [c];
    },
    follow(view, plays) {
      const r = rndOf(view);
      const lead = E.classify(plays[0].cards, view.trump);
      const opts = M.legalFollows(view.hand.slice(), lead, view.trump, 40);
      if (!opts.length) return M.forceLegalFollow(view.hand.slice(), lead, view.trump);
      return opts[(r() * opts.length) | 0];
    },
  };
}

/* greedy:贪心 —— 能吃就吃(用最小能赢的),不能吃就垫最小;亮主看长度 */
function greedyBot() {
  return {
    name: 'greedy',
    onDeal(view) {
      const lv = view.trumpRank;
      const cnt = {};
      for (const c of view.hand) if (c.rank === lv && c.suit !== 'X') cnt[c.suit] = (cnt[c.suit] || 0) + 1;
      let best = null, bn = 0;
      for (const s in cnt) if (cnt[s] > bn) { bn = cnt[s]; best = s; }
      if (best && bn >= 2 && view.hand.length > 10) return { suit: best, strength: 2 };
      if (best && view.hand.length > 16) return { suit: best, strength: 1 };
      return null;
    },
    onRebel() { return true; },
    discard(view) {
      const t = view.trump;
      const h = view.hand.slice().sort((a, b) =>
        (E.effSuit(a, t) === 'T') - (E.effSuit(b, t) === 'T') ||
        (E.cardPts(a) - E.cardPts(b)) ||
        (E.ordIdx(a, t) - E.ordIdx(b, t)));
      return h.slice(0, 8);
    },
    lead(view) {
      const t = view.trump;
      // 最长门的最大牌
      const m = {};
      for (const c of view.hand) { const s = E.effSuit(c, t); (m[s] = m[s] || []).push(c); }
      let best = null, bl = -1;
      for (const s in m) { m[s].sort((a, b) => E.ordIdx(a, t) - E.ordIdx(b, t)); if (m[s].length > bl) { bl = m[s].length; best = s; } }
      return [m[best][m[best].length - 1]];
    },
    follow(view, plays) {
      const t = view.trump;
      const lead = E.classify(plays[0].cards, t);
      const opts = M.legalFollows(view.hand.slice(), lead, t, 60);
      if (!opts.length) return M.forceLegalFollow(view.hand.slice(), lead, t);
      let bestWin = null, bestWinCost = 1e9, bestLose = null, bestLoseCost = 1e9;
      for (const cand of opts) {
        const all = plays.concat([{ seat: view.seat, cards: cand }]);
        const win = all[E.resolveTrick(all, t).winIdx].seat === view.seat;
        let cost = 0;
        for (const c of cand) cost += E.cardPts(c) * 0.6 + E.ordIdx(c, t) * 0.2 + (E.effSuit(c, t) === 'T' ? 3 : 0);
        if (win) { if (cost < bestWinCost) { bestWinCost = cost; bestWin = cand; } }
        else { if (cost < bestLoseCost) { bestLoseCost = cost; bestLose = cand; } }
      }
      return bestWin || bestLose || opts[0];
    },
  };
}

module.exports = { templateBot, naiveBot, greedyBot };
