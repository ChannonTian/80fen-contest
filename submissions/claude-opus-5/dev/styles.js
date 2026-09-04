/* 陌生风格的稳健性探测。
 * 关键不是「我打不打得赢」,而是**我相对 greedy 的领先幅度会不会对某种风格塌掉** ——
 * 如果对某个风格我比 greedy 好得特别少,说明我的评估/对手模型对那类打法失灵。 */
'use strict';
const A = require('./arena.js'); const B = require('./bots.js'); const S = require('../strategy.js');
const N = parseInt(process.argv[2] || '600', 10);
const foes = [['greedy', B.greedy], ['naive', B.naive], ['pointHog', B.pointHog],
              ['randomLegal', B.randomLegal], ['thrower', B.thrower],
              ['hoarder', B.hoarder], ['maxer', B.maxer]];
console.log('n=' + N + ' | 我 vs 风格 / greedy vs 风格 / 差额(越大说明我相对越强)');
for (const [name, f] of foes) {
  const mine = A.roundArena(() => S.makeAI(), f, N, 1);
  const ctrl = name === 'greedy' ? { lvl: 0, lvlSE: 0, violA: 0, violB: 0 }
                                 : A.roundArena(B.greedy, f, N, 1);
  const d = mine.lvl - ctrl.lvl;
  console.log('  ' + name.padEnd(12) +
    '我 ' + (mine.lvl >= 0 ? '+' : '') + mine.lvl.toFixed(3) + ' ±' + mine.lvlSE.toFixed(3) +
    ' | greedy ' + (ctrl.lvl >= 0 ? '+' : '') + ctrl.lvl.toFixed(3) +
    ' | 差额 ' + (d >= 0 ? '+' : '') + d.toFixed(3) +
    ' | 我方违规 ' + mine.violA + ' 罚分 ' + mine.penA);
}
