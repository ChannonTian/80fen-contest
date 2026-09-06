/* sweep:当前 index.js(可带 cfg) vs 冻结 baseline。用法:
 *   node dev/sweep.js [n] '[{"name":"X","cfg":{"开关":值}},...]'
 * 输出每个变体的配对级差(相对 baseline)与 σ。 */
'use strict';
const mk = require('../index.js');
const mkBase = require('./baseline/index.js');
const { roundArena } = require('./arena.js');

const n = parseInt(process.argv[2] || '300', 10);
const variants = process.argv[3] ? JSON.parse(process.argv[3]) : [{}];

for (const v of variants) {
  const r = roundArena(() => mk(v.cfg || {}), mkBase, n, 424242);
  console.log(`${(v.name || 'default').padEnd(24)} | 级差 ${r.lvlDiff.toFixed(4)} ±${r.lvlSem.toFixed(4)} (${r.sigma.toFixed(1)}σ) | ` +
    `净分 ${r.ptsDiff.toFixed(1)} | 违规 ${r.violA} 内部兜底 ${JSON.stringify(r.intFbA)}`);
}
