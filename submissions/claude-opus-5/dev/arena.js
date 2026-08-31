/* dev/arena.js —— 对照跑分器。
 * 同一批牌两边各打一遍、交换阵营,合成一个数;输出均值、标准误、行为差异率。
 */
'use strict';
const G = require('./game.js');
const E = require('../engine.js');

/* 局面设置:确定性地由 d 生成,覆盖不同级数/庄家/有庄无庄 */
function setupFor(d) {
  const lv = [2, 3, 5, 7, 10, 13, 14];
  const l0 = lv[d % 7], l1 = lv[(d * 3 + 2) % 7];
  const dealerKnown = (d % 7) !== 3;          // ~14% 无庄局
  const dealer = d % 4;
  return {
    levels: [l0, l1], played: [-1, -1],
    dealerKnown: dealerKnown, dealer: dealerKnown ? dealer : -1,
    firstTaker: dealer, needCut: !dealerKnown, cutBase: d % 4,
    rebelMode: 'full',
  };
}

/* 一局的结果 → 对 team 的价值 */
function valueTo(res, team) {
  const gainTeam = res.sc.declHeld ? res.declTeam : res.defTeam;
  const lvl = (gainTeam === team ? 1 : -1) * res.sc.up;
  const npDef = res.sc.total - 80;
  const np = (res.defTeam === team ? 1 : -1) * npDef;
  const onStage = res.sc.declHeld ? (res.declTeam === team ? 1 : -1) : (res.defTeam === team ? 1 : -1);
  return { lvl: lvl, np: np, stage: onStage, total: res.sc.total, declTeam: res.declTeam };
}

function runOne(fa, fb, d, seed, aOnTeam0) {
  const st = setupFor(d);
  const bots = [];
  for (let s = 0; s < 4; s++) {
    const isA = aOnTeam0 ? (s % 2 === 0) : (s % 2 === 1);
    bots.push((isA ? fa : fb)());
  }
  const res = G.playRound({
    bots: bots, seed: seed, roundIdx: d, levels: st.levels, played: st.played,
    dealerKnown: st.dealerKnown, dealer: st.dealer, firstTaker: st.firstTaker,
    needCut: st.needCut, cutBase: st.cutBase, rebelMode: st.rebelMode,
  });
  return res;
}

function mean(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
function stderr(a) {
  const n = a.length; if (n < 2) return 0;
  const m = mean(a); let v = 0;
  for (let i = 0; i < n; i++) v += (a[i] - m) * (a[i] - m);
  return Math.sqrt(v / (n - 1) / n);
}

function roundArena(fa, fb, nDeals, seed, opts) {
  opts = opts || {};
  const base = opts.seed0 || 12345;
  const lvlD = [], npD = [], stD = [];
  let differed = 0, penA = 0, penB = 0, violA = 0, violB = 0;
  const lossA = {}, lossB = {};
  for (let d = 0; d < nDeals; d++) {
    const r1 = runOne(fa, fb, d, base, true);     // A 在 team0
    const r2 = runOne(fa, fb, d, base, false);    // A 在 team1
    const v1 = valueTo(r1, 0), v2 = valueTo(r2, 1);
    lvlD.push((v1.lvl + v2.lvl) / 2);
    npD.push((v1.np + v2.np) / 2);
    stD.push((v1.stage + v2.stage) / 2);
    if (r1.hash !== r2.hash) differed++;
    penA += r1.penalties[0] + r2.penalties[1];
    penB += r1.penalties[1] + r2.penalties[0];
    violA += r1.violations[0] + r1.violations[2] + r2.violations[1] + r2.violations[3];
    violB += r1.violations[1] + r1.violations[3] + r2.violations[0] + r2.violations[2];
    if (opts.collect) opts.collect(r1, 0, lossA), opts.collect(r2, 1, lossA);
  }
  return {
    n: nDeals,
    lvl: mean(lvlD), lvlSE: stderr(lvlD),
    np: mean(npD), npSE: stderr(npD),
    stage: mean(stD), stageSE: stderr(stD),
    diffRate: differed / nDeals,
    penA: penA, penB: penB, violA: violA, violB: violB,
  };
}

function fmt(r, label) {
  return (label ? label + '  ' : '') +
    'n=' + r.n +
    ' | 级差 ' + r.lvl.toFixed(4) + ' ±' + r.lvlSE.toFixed(4) +
    ' (' + (r.lvlSE > 0 ? (r.lvl / r.lvlSE).toFixed(2) : '—') + 'σ)' +
    ' | 净分 ' + r.np.toFixed(3) + ' ±' + r.npSE.toFixed(3) +
    ' | 上台差 ' + r.stage.toFixed(4) +
    ' | 行为差异 ' + (r.diffRate * 100).toFixed(1) + '%' +
    ' | 罚 A/B ' + r.penA + '/' + r.penB +
    ' | 违规 A/B ' + r.violA + '/' + r.violB;
}

/* 整场对局:交换阵营各打一遍 */
function matchArena(fa, fb, nMatches, seed0, opts) {
  opts = opts || {};
  const netLvl = [], wins = [];
  let penA = 0, penB = 0, violA = 0, violB = 0, rounds = 0;
  for (let i = 0; i < nMatches; i++) {
    const seed = (seed0 || 777) + i;
    const m1 = G.playMatch([fa, fb, fa, fb], seed, opts);      // A=team0
    const m2 = G.playMatch([fb, fa, fb, fa], seed, opts);      // A=team1
    const a1 = m1.levels[0] - m1.levels[1];
    const a2 = m2.levels[1] - m2.levels[0];
    netLvl.push((a1 + a2) / 2);
    const w1 = m1.winner === 0 ? 1 : (m1.winner === 1 ? 0 : 0.5);
    const w2 = m2.winner === 1 ? 1 : (m2.winner === 0 ? 0 : 0.5);
    wins.push((w1 + w2) / 2);
    penA += m1.penalties[0] + m2.penalties[1];
    penB += m1.penalties[1] + m2.penalties[0];
    violA += m1.violations[0] + m1.violations[2] + m2.violations[1] + m2.violations[3];
    violB += m1.violations[1] + m1.violations[3] + m2.violations[0] + m2.violations[2];
    rounds += m1.nRounds + m2.nRounds;
  }
  return {
    n: nMatches, netLvl: mean(netLvl), netLvlSE: stderr(netLvl),
    winRate: mean(wins), winSE: stderr(wins),
    penA: penA, penB: penB, violA: violA, violB: violB, rounds: rounds,
  };
}

function fmtMatch(r, label) {
  return (label ? label + '  ' : '') +
    'n=' + r.n + '对' +
    ' | 净胜级 ' + r.netLvl.toFixed(3) + ' ±' + r.netLvlSE.toFixed(3) +
    ' (' + (r.netLvlSE > 0 ? (r.netLvl / r.netLvlSE).toFixed(2) : '—') + 'σ)' +
    ' | 胜率 ' + (r.winRate * 100).toFixed(1) + '% ±' + (r.winSE * 100).toFixed(1) +
    ' | 罚 A/B ' + r.penA + '/' + r.penB +
    ' | 违规 A/B ' + r.violA + '/' + r.violB +
    ' | 局数 ' + r.rounds;
}

module.exports = { roundArena, matchArena, fmt, fmtMatch, setupFor, valueTo, runOne, mean, stderr };
