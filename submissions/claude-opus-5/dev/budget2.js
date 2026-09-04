/* 时间预算。机器噪声可达 ±15%,而且是漂移型的(同一进程内先后跑也会差),
 * 所以交替多轮、取中位数。README §时间:超基准选手 3 倍不进决赛。 */
'use strict';
const A = require('./arena.js'); const B = require('./bots.js');
const CUR = require('../strategy.js'); const BASE = require('./baseline/strategy.js');
const N = parseInt(process.argv[2] || '60', 10);
const R = parseInt(process.argv[3] || '7', 10);
function timeBot(f, n, seed0) {
  let calls = 0, ns = 0;
  const wrap = () => {
    const ai = f(); const w = { name: ai.name, cfg: ai.cfg };
    for (const m of ['onDeal', 'onRebel', 'discard', 'lead', 'follow']) {
      const orig = ai[m].bind(ai);
      w[m] = function (a, b) {
        const t = process.hrtime.bigint(); const r = orig(a, b);
        ns += Number(process.hrtime.bigint() - t); calls++; return r;
      };
    }
    return w;
  };
  for (let d = 0; d < n; d++) A.runOne(wrap, () => BASE.makeAI(), seed0 + d, 1, true);
  return ns / 1000 / calls;
}
/* 顺序有讲究:要配对的两个必须相邻,否则轮内的机器漂移会灌进比值里。
 * 现在最要紧的是「当前 / greedy」这个决定进不进决赛的比值。 */
const cands = [['naive', B.naive], ['pointHog', B.pointHog], ['baseline', () => BASE.makeAI()],
               ['greedy', B.greedy], ['当前', () => CUR.makeAI()]];
for (const [, f] of cands) timeBot(f, 12, 900);          // JIT 热身
const acc = cands.map(() => []);
for (let r = 0; r < R; r++)                              // 交替:每轮所有选手各跑一遍
  for (let i = 0; i < cands.length; i++) acc[i].push(timeBot(cands[i][1], N, r * N));
const med = a => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
const us = acc.map(med);
/* 每轮内配对求比值再取中位数:同一轮里所有选手打的是同一批牌、机器状态也
 * 相近,所以比值把「牌的难易」和「机器漂移」两个方差源都消掉。直接对两列
 * 中位数相除做不到这一点。 */
const ratioTo = j => cands.map((_, i) => med(acc[i].map((v, r) => v / acc[j][r])));
const rg = ratioTo(3), rb = ratioTo(2);
console.log('N=' + N + '×' + R + ' 轮交替,轮内配对比值取中位数');
for (let i = 0; i < cands.length; i++) {
  const sp = acc[i].slice().sort((x, y) => x - y);
  const pr = acc[i].map((v, r) => v / acc[3][r]).sort((x, y) => x - y);
  console.log('  ' + cands[i][0].padEnd(10), us[i].toFixed(2).padStart(7) + ' µs',
    '[' + sp[0].toFixed(1) + '–' + sp[sp.length - 1].toFixed(1) + ']',
    '| /greedy ' + rg[i].toFixed(2) + '×',
    '| /baseline ' + rb[i].toFixed(3) + '× [' + pr[0].toFixed(3) + '–' + pr[pr.length - 1].toFixed(3) + ']');
}
