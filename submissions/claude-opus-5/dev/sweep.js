/* dev/sweep.js —— 批量 A/B 筛选:每个变体 vs 当前默认配置 */
'use strict';
const A = require('./arena.js');
const S = require('../strategy.js');
const B = require('./bots.js');
const n = parseInt(process.argv[2] || '300', 10);
const variants = JSON.parse(process.argv[3]);
const opp = process.argv[4] || 'self';
const fb = opp === 'self' ? (() => S.makeAI()) : (() => B[opp]());
const t0 = Date.now();
const rows = [];
for (const v of variants) {
  const r = A.roundArena(() => S.makeAI(v.cfg), fb, n, 1);
  rows.push({ name: v.name, lvl: r.lvl, se: r.lvlSE, sig: r.lvlSE > 0 ? r.lvl / r.lvlSE : 0, np: r.np, diff: r.diffRate, pen: r.penA, viol: r.violA });
}
rows.sort((a, b) => b.lvl - a.lvl);
console.log('n=' + n + ' vs ' + opp + '  (' + ((Date.now() - t0) / 1000).toFixed(0) + 's)');
for (const r of rows) {
  console.log('  ' + r.name.padEnd(34),
    (r.lvl >= 0 ? '+' : '') + r.lvl.toFixed(4), '±' + r.se.toFixed(4),
    ('(' + r.sig.toFixed(1) + 'σ)').padStart(9),
    ' 净分 ' + (r.np >= 0 ? '+' : '') + r.np.toFixed(2),
    ' 行为差 ' + (r.diff * 100).toFixed(0) + '%',
    r.viol ? ' 违规' + r.viol : '');
}
