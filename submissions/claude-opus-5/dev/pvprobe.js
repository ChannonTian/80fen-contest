'use strict';
const A = require('./arena.js');
const S = require('../strategy.js');
const { pvbot } = require('./pvbot.js');
const n = parseInt(process.argv[2] || '400', 10);
for (const mc of (process.argv[3] || '4,8').split(',').map(Number)) {
  const t0 = Date.now();
  const r = A.roundArena(() => pvbot(mc), () => S.makeAI(), n, 1);
  console.log(A.fmt(r, ('PV残局(<=' + mc + '张)').padEnd(20)), '| ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
