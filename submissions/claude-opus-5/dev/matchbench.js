'use strict';
const A = require('./arena.js');
const B = require('./bots.js');
const S = require('../strategy.js');
const me = () => S.makeAI();
const n = parseInt(process.argv[2] || '30', 10);
const which = process.argv[3] ? [process.argv[3]] : ['greedy', 'sibling'];
for (const name of which) {
  const t0 = Date.now();
  const r = A.matchArena(me, B[name], n, 777);
  console.log(A.fmtMatch(r, ('整场 vs ' + name).padEnd(20)), '| ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
