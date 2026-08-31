'use strict';
const A = require('./arena.js');
const B = require('./bots.js');
const { makeAI } = require('../strategy.js');
const me = () => makeAI();
const n = parseInt(process.argv[2] || '300', 10);
let FB = 0;
const meWrapped = () => { const a = me(); FBS.push(a); return a; };
const FBS = [];
for (const [name, f] of [['template', B.template], ['naive', B.naive], ['greedy', B.greedy], ['pointHog', B.pointHog], ['trumpMiser', B.trumpMiser], ['sibling', B.sibling], ['siblingR', B.siblingR]]) {
  const t0 = Date.now();
  FBS.length = 0;
  const r = A.roundArena(meWrapped, f, n, 1);
  for (const a of FBS) FB += Object.keys(a.fallbacks).reduce((x, k) => x + a.fallbacks[k], 0);
  console.log(A.fmt(r, ('v0 vs ' + name).padEnd(16)), '| 兜底 ' + FB + (FB ? '  ✗ 有东西在抛异常!' : ' ✓'), '| ' + (Date.now() - t0) + 'ms');
  FB = 0;
}
