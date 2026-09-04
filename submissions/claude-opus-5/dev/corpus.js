/* 抗争用的时间预算测量。
 *
 * 为什么不用 wall clock:容器有 CPU 争用,而且**比值本身也会被争用推高** ——
 * 调用越长越容易被中途调度出去,所以长调用膨胀得比短调用多。同一份代码前后
 * 量到 2.76x 和 3.90x 就是这么来的。
 *
 * 做法:录一份固定的决策位置语料(每个 bot 实例一条调用序列),再离线重放。
 *   - 同一批位置喂给每个选手 —— 没有裁判、没有对局分叉,完全可比
 *   - 按批用 process.cpuUsage() 计时 —— CPU 时间不算被调度出去的部分,
 *     而且按批摊掉了 380ns/次的调用开销
 */
'use strict';
const A = require('./arena.js'); const B = require('./bots.js');
const CUR = require('../strategy.js'); const BASE = require('./baseline/strategy.js');
const METHODS = ['onDeal', 'onRebel', 'discard', 'lead', 'follow'];

/* 每个选手录**自己的**局:裁判量的是各自打自己的局的总时间,而一个选手的
 * 决策会塑造它后续遇到的局面(打空一门、留不留主),所以拿别人的局面喂它
 * 没有代表性 —— 之前 pointHog 在 baseline 的局面上量出 1.57x greedy,在
 * 自己的局里只有 0.99x。 */
function buildCorpus(factory, n) {
  const seqs = [];
  const mk = () => {
    const ai = factory(); const seq = []; seqs.push(seq);
    const w = { name: ai.name, cfg: ai.cfg };
    for (const m of METHODS) {
      const orig = ai[m].bind(ai);
      w[m] = function (a, b) { seq.push([m, a, b]); return orig(a, b); };
    }
    return w;
  };
  for (let d = 0; d < n; d++) A.runOne(mk, () => BASE.makeAI(), d, 1, true);
  return seqs.filter(s => s.length > 0);
}

function replay(factory, seqs) {
  let calls = 0;
  for (let i = 0; i < seqs.length; i++) {
    const ai = factory(); const seq = seqs[i];
    for (let j = 0; j < seq.length; j++) { ai[seq[j][0]](seq[j][1], seq[j][2]); calls++; }
  }
  return calls;
}
function cost(factory, seqs, reps) {
  replay(factory, seqs);                       // JIT 热身
  const t0 = process.cpuUsage(); let calls = 0;
  for (let r = 0; r < reps; r++) calls += replay(factory, seqs);
  const d = process.cpuUsage(t0);
  return (d.user + d.system) / calls;
}

const N = parseInt(process.argv[2] || '40', 10);
const REPS = parseInt(process.argv[3] || '3', 10);
/* 标尺用冻结引擎版:参照选手若共享我正在优化的 moves.js/engine.js,我的优化
 * 会漏进标尺里,比值就不再反映「相对主办方基准选手」的真实倍数。 */
const cands = [['greedy(共享)', B.greedy], ['greedy(冻结)', B.greedyFrozen],
               ['baseline', () => BASE.makeAI()], ['当前', () => CUR.makeAI()]];
const extra = process.argv[4] ? JSON.parse(process.argv[4]) : [];
for (const [nm, cfg] of extra) cands.push([nm, () => CUR.makeAI(cfg)]);
const us = [], nc = [];
for (const [, f] of cands) {
  const sq = buildCorpus(f, N);
  nc.push(sq.reduce((a, s) => a + s.length, 0));
  us.push(cost(f, sq, REPS));
}
console.log('每人自己的 ' + N + ' 副牌,重放 ' + REPS + ' 遍,cpuUsage 按批计时');
const g = us[cands.findIndex(c => c[0] === 'greedy(冻结)')];
for (let i = 0; i < cands.length; i++)
  console.log('  ' + cands[i][0].padEnd(12), us[i].toFixed(2).padStart(7) + ' µs',
    '(' + nc[i] + ' 次决策)', '| /greedy ' + (us[i] / g).toFixed(2) + '×',
    (us[i] / g <= 3 ? '✓' : '✗超线'));
