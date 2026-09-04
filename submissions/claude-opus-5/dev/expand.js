/* 时间预算腾出来之后,往深里做 rollout 的筛选 */
'use strict';
const A = require('./arena.js');
const CUR = require('../strategy.js'); const BASE = require('./baseline/strategy.js');
const N = parseInt(process.argv[2] || '600', 10);
const V = [
  ['rMax5',        { rolloutMaxCards: 5 }],
  ['rMax6',        { rolloutMaxCards: 6 }],
  ['K8M6',         { rolloutK: 8, rolloutM: 6 }],
  ['K10M8',        { rolloutK: 10, rolloutM: 8 }],
  ['rMax5+K8M6',   { rolloutMaxCards: 5, rolloutK: 8, rolloutM: 6 }],
  ['rMax6+K10M8',  { rolloutMaxCards: 6, rolloutK: 10, rolloutM: 8 }],
];
console.log('棋力 n=' + N + ' vs baseline(= 已合并版)');
for (const [name, cfg] of V) {
  const t0 = Date.now();
  const r = A.roundArena(() => CUR.makeAI(cfg), () => BASE.makeAI(), N, 1);
  console.log('  ' + name.padEnd(14) + (r.lvl >= 0 ? '+' : '') + r.lvl.toFixed(4) +
    ' ±' + r.lvlSE.toFixed(4) + ' (' + (r.lvl / r.lvlSE).toFixed(1) + 'σ)' +
    ' | 行为差异 ' + (100 * r.diffRate).toFixed(0) + '%' +
    ' | 违规 ' + r.violA + '/' + r.violB + ' | ' + (Date.now() - t0) + 'ms');
}
