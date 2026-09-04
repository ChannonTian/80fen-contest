'use strict';
const A = require('./arena.js');
const CUR = require('../strategy.js'); const BASE = require('./baseline/strategy.js');
const N = parseInt(process.argv[2] || '1500', 10);
const V = [['SH16', { rolloutSH: true, rolloutSHW: 16 }],
           ['SH24', { rolloutSH: true, rolloutSHW: 24 }],
           ['SH32', { rolloutSH: true, rolloutSHW: 32 }],
           ['SH24mg99', { rolloutSH: true, rolloutSHW: 24, rolloutMargin: 99 }],
           ['SH32mg99', { rolloutSH: true, rolloutSHW: 32, rolloutMargin: 99 }],
           ['SH48mg99', { rolloutSH: true, rolloutSHW: 48, rolloutMargin: 99 }]];
console.log('连续减半(等预算分配)n=' + N + ' vs baseline(= 当前采纳版)');
for (const [name, cfg] of V) {
  const r = A.roundArena(() => CUR.makeAI(cfg), () => BASE.makeAI(), N, 1);
  console.log('  ' + name.padEnd(12) + (r.lvl >= 0 ? '+' : '') + r.lvl.toFixed(4) +
    ' ±' + r.lvlSE.toFixed(4) + ' (' + (r.lvl / r.lvlSE).toFixed(1) + 'σ)' +
    ' | 行为差异 ' + (100 * r.diffRate).toFixed(0) + '% | 违规 ' + r.violA + '/' + r.violB);
}
