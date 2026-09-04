'use strict';
const A = require('./arena.js');
const CUR = require('../strategy.js'); const BASE = require('./baseline/strategy.js');
const N = parseInt(process.argv[2] || '3000', 10);
const V = [['rMax5+K8M6',  { rolloutMaxCards: 5, rolloutK: 8, rolloutM: 6 }],
           ['rMax5+K10M8', { rolloutMaxCards: 5, rolloutK: 10, rolloutM: 8 }],
           ['rMax6+K8M6',  { rolloutMaxCards: 6, rolloutK: 8, rolloutM: 6 }]];
console.log('复测 n=' + N);
for (const [name, cfg] of V) {
  const r = A.roundArena(() => CUR.makeAI(cfg), () => BASE.makeAI(), N, 1);
  console.log('  ' + name.padEnd(14) + (r.lvl >= 0 ? '+' : '') + r.lvl.toFixed(4) +
    ' ±' + r.lvlSE.toFixed(4) + ' (' + (r.lvl / r.lvlSE).toFixed(1) + 'σ) | 违规 ' + r.violA + '/' + r.violB);
}
