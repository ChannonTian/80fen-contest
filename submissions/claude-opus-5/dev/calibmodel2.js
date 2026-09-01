'use strict';
const A = require('./arena.js');
const S = require('../strategy.js');
const E = require('../engine.js');
const n = parseInt(process.argv[2] || '60', 10);
const cats = {};
function bump(k, truth, p) {
  if (!cats[k]) cats[k] = { n: 0, br: 0, err: 0, pos: 0, psum: 0 };
  const c = cats[k];
  c.n++; c.br += (p - truth) ** 2; c.err += Math.abs((p > 0.5 ? 1 : 0) - truth);
  c.pos += truth; c.psum += p;
}
function probe(truth, pCF, pMC, pIPF, cl, a, seat, trump, hSize) {
  const suitK = cl.suit === 'T' ? '主' : '副';
  const ty = cl.type === 'tractor' ? 'tractor' : cl.type;
  bump('类型:' + suitK + '-' + ty, truth, pCF);
  const t = a.nTricks;
  bump('墩号:' + (t < 5 ? '0-4' : t < 10 ? '5-9' : t < 15 ? '10-14' : '15+'), truth, pCF);
  const known = a.voids[seat][cl.suit] ? '已知断门' : '未知';
  bump('断门:' + known, truth, pCF);
  if (cl.suit !== 'T') {
    const nS = a.nSuit ? (a.nSuit[cl.suit] || 0) : -1;
    bump('本门暗牌:' + (nS <= 2 ? '0-2' : nS <= 5 ? '3-5' : nS <= 9 ? '6-9' : '10+'), truth, pCF);
  }
}
const fa = () => S.makeAI({ __probe: probe });
const fb = () => S.makeAI();
for (let d = 0; d < n; d++) { A.runOne(fa, fb, d, 1, true); A.runOne(fa, fb, d, 1, false); }
const rows = Object.entries(cats).sort((a, b) => (b[1].err) - (a[1].err));
console.log('分类'.padEnd(20), 'n'.padStart(7), '判错率'.padStart(8), 'Brier'.padStart(8), '实际率'.padStart(8), '预测率'.padStart(8), '错误总量'.padStart(9));
for (const [k, c] of rows) {
  console.log(k.padEnd(20), String(c.n).padStart(7), (c.err / c.n * 100).toFixed(1).padStart(7) + '%',
    (c.br / c.n).toFixed(4).padStart(8), (c.pos / c.n * 100).toFixed(1).padStart(7) + '%',
    (c.psum / c.n * 100).toFixed(1).padStart(7) + '%', String(Math.round(c.err)).padStart(9));
}
