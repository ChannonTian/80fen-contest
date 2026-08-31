'use strict';
const A = require('./arena.js'); const S = require('../strategy.js');
const { mcpvbot } = require('./mcpv.js');
const n = parseInt(process.argv[2] || '400', 10);
for (const spec of (process.argv[3] || '4:6:16').split(',')) {
  const [mc, K, m] = spec.split(':').map(Number);
  const t0 = Date.now();
  const r = A.roundArena(() => mcpvbot(mc, K, m), () => S.makeAI(), n, 1);
  console.log(A.fmt(r, ('MCPV <=' + mc + '张 K=' + K + ' M=' + m).padEnd(24)), '| ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
