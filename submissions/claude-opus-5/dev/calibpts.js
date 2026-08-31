/* 从实战数据标定 leadWinPts / leadLosePts / ptsPerCardLater */
'use strict';
const A = require('./arena.js');
const S = require('../strategy.js');
const n = parseInt(process.argv[2] || '400', 10);
const f = () => S.makeAI();
const acc = {};
function key(tk) { return (tk.suit === 'T' ? '主' : '副') + '-L' + Math.min(tk.size, 4); }
function add(tk) {
  const k = key(tk);
  if (!acc[k]) acc[k] = { win: { n: 0, o: 0, self: 0 }, lose: { n: 0, o: 0, self: 0 } };
  const b = tk.leaderWon ? acc[k].win : acc[k].lose;
  b.n++; b.o += tk.otherPts; b.self += tk.leadPts;
}
for (let d = 0; d < n; d++) {
  for (const on of [true, false]) {
    const r = A.runOne(f, f, d, 1, on);
    for (const tk of r.tricks) add(tk);
  }
}
console.log('领出方视角:「其余三家一共贡献多少分」/ 每张领出牌');
console.log('组'.padEnd(8), '赢:n'.padStart(8), '其余/张'.padStart(9), '自带/张'.padStart(9), '| 输:n'.padStart(9), '其余/张'.padStart(9), '自带/张'.padStart(9), '赢率'.padStart(7));
for (const k of Object.keys(acc).sort()) {
  const a = acc[k], L = parseInt(k.slice(-1), 10);
  const wr = a.win.n / (a.win.n + a.lose.n);
  console.log(k.padEnd(8),
    String(a.win.n).padStart(8), (a.win.o / Math.max(1, a.win.n) / L).toFixed(2).padStart(9), (a.win.self / Math.max(1, a.win.n) / L).toFixed(2).padStart(9),
    '|', String(a.lose.n).padStart(8), (a.lose.o / Math.max(1, a.lose.n) / L).toFixed(2).padStart(9), (a.lose.self / Math.max(1, a.lose.n) / L).toFixed(2).padStart(9),
    (wr * 100).toFixed(0).padStart(6) + '%');
}
