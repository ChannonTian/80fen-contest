/* 终版能力档案:多风格参照选手 × (配对级差, 整场胜率, 违规, 罚分, 耗时) */
'use strict';
const mk = require('../index.js');
const E = require('../engine.js');
const M = require('../moves.js');
const G = require('./game.js');
const B = require('./bots.js');
const { roundArena } = require('./arena.js');

/* pointHog:极度抢分 —— 有分必抢,无论代价 */
function pointHogBot() {
  const ai = B.greedyBot();
  ai.name = 'pointHog';
  ai.follow = function (view, plays) {
    const t = view.trump;
    const lead = E.classify(plays[0].cards, t);
    const opts = M.legalFollows(view.hand.slice(), lead, t, 60);
    if (!opts.length) return M.forceLegalFollow(view.hand.slice(), lead, t);
    let best = null, bs = -1e9;
    for (const cand of opts) {
      const all = plays.concat([{ seat: view.seat, cards: cand }]);
      const win = all[E.resolveTrick(all, t).winIdx].seat === view.seat;
      let tablePts = 0;
      for (const p of plays) tablePts += E.countPts(p.cards);
      const sc = win ? (tablePts + E.countPts(cand)) * 10 : -E.countPts(cand) * 8;
      if (sc > bs) { bs = sc; best = cand; }
    }
    return best;
  };
  return ai;
}
/* trumpMiser:惜主如金 —— 从不出主牌除非被迫,副门从大到小出 */
function trumpMiserBot() {
  const ai = B.greedyBot();
  ai.name = 'trumpMiser';
  ai.lead = function (view) {
    const t = view.trump;
    const side = view.hand.filter(c => E.effSuit(c, t) !== 'T');
    const pool = side.length ? side : view.hand;
    pool.sort((a, b) => E.ordIdx(b, t) - E.ordIdx(a, t));
    return [pool[0]];
  };
  ai.follow = function (view, plays) {
    const t = view.trump;
    const lead = E.classify(plays[0].cards, t);
    const opts = M.legalFollows(view.hand.slice(), lead, t, 60);
    if (!opts.length) return M.forceLegalFollow(view.hand.slice(), lead, t);
    // 主牌用量最小化
    let best = null, bs = 1e9;
    for (const cand of opts) {
      const nT = cand.filter(c => E.effSuit(c, t) === 'T').length;
      const ord = cand.reduce((a, c) => a + E.ordIdx(c, t), 0);
      const s = nT * 100 + ord;
      if (s < bs) { bs = s; best = cand; }
    }
    return best;
  };
  return ai;
}
/* sibling:同门换权重(结构相同,风格不同) */
function siblingBot() { return mk({ wPtsOnTable: 0.8, pairBreakW: 0, leadDrawTrumpMin: 9, declSingleSuitLen: 6 }); }

const OPPONENTS = {
  template: B.templateBot, naive: B.naiveBot, greedy: B.greedyBot,
  pointHog: pointHogBot, trumpMiser: trumpMiserBot, sibling: siblingBot,
};

const n = parseInt(process.argv[2] || '150', 10);
console.log('参照选手 | 配对级差 | σ | 整场胜率 | 我方违规 | 场均局数');
for (const [name, f] of Object.entries(OPPONENTS)) {
  const r = roundArena(() => mk(), f, n, 20260906);
  // 整场胜率:同种子重放一遍数胜场
  let wins = 0, total = 0, viol = 0, rounds = 0;
  for (let i = 0; i < Math.ceil(n / 4); i++) {
    const ais = [mk(), f(), mk(), f()];
    const m = G.playMatch(ais, 20260906 + i);
    total++; rounds += m.roundsCount;
    if (m.winner === 0) wins++;
    for (let s = 0; s < 4; s += 2) viol += m.violations[s];
  }
  console.log(`${name.padEnd(11)} | ${r.lvlDiff.toFixed(2).padStart(8)} | ${r.sigma.toFixed(1).padStart(6)}σ | ` +
    `${((wins / total) * 100).toFixed(1).padStart(5)}% | ${viol} | ${(rounds / total).toFixed(1)}`);
}
