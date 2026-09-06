/* bench:当前 AI 对参照选手的实力。用法: node dev/bench.js [n] [cfgJSON] */
'use strict';
const mk = require('../index.js');
const B = require('./bots.js');
const { roundArena } = require('./arena.js');

const n = parseInt(process.argv[2] || '60', 10);
let cfg = {};
if (process.argv[3]) cfg = JSON.parse(process.argv[3]);

const bots = { template: B.templateBot, naive: B.naiveBot, greedy: B.greedyBot };

for (const name of Object.keys(bots)) {
  const r = roundArena(() => mk(cfg), bots[name], n, 777);
  console.log(`vs ${name.padEnd(9)} | 级差 ${r.lvlDiff.toFixed(3)} ±${r.lvlSem.toFixed(3)} (${r.sigma.toFixed(1)}σ) | ` +
    `净分 ${r.ptsDiff.toFixed(1)} | 违规我方 ${r.violA} 兜底 ${r.fbA}`);
}
