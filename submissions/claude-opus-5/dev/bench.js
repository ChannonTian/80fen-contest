'use strict';
const A = require('./arena.js');
const B = require('./bots.js');
const { makeAI } = require('../strategy.js');
const me = () => makeAI();
const n = parseInt(process.argv[2] || '300', 10);
for (const [name, f] of [['template', B.template], ['naive', B.naive], ['greedy', B.greedy]]) {
  const t0 = Date.now();
  const r = A.roundArena(me, f, n, 1);
  console.log(A.fmt(r, ('v0 vs ' + name).padEnd(16)), '| ' + (Date.now() - t0) + 'ms');
}
