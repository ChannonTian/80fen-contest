/* 配置大改之后,把 rollout 相关的旧否定结论整批重测 */
'use strict';
const A = require('./arena.js');
const CUR = require('../strategy.js'); const BASE = require('./baseline/strategy.js');
const N = parseInt(process.argv[2] || '1500', 10);
const V = [
  ['smartFollow',   { rolloutSmartFollow: true }],
  ['richLead',      { rolloutRichLead: true }],
  ['leadDepth6',    { rolloutMaxCardsLead: 6 }],
  ['leadDepth7',    { rolloutMaxCardsLead: 7 }],
  ['K10',           { rolloutK: 10 }],
  ['M8',            { rolloutM: 8 }],
  ['kittyPrior6',   { rolloutKittyPrior: 6 }],
  ['kittyPrior2',   { rolloutKittyPrior: 2 }],
];
console.log('重测 n=' + N + ' vs baseline(= 当前采纳版)');
for (const [name, cfg] of V) {
  const r = A.roundArena(() => CUR.makeAI(cfg), () => BASE.makeAI(), N, 1);
  console.log('  ' + name.padEnd(14) + (r.lvl >= 0 ? '+' : '') + r.lvl.toFixed(4) +
    ' ±' + r.lvlSE.toFixed(4) + ' (' + (r.lvl / r.lvlSE).toFixed(1) + 'σ)' +
    ' | 行为差异 ' + (100 * r.diffRate).toFixed(0) + '% | 违规 ' + r.violA + '/' + r.violB);
}
