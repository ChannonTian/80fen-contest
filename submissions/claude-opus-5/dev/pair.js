/* 当前 vs baseline 的精确配对计时。
 * 两者行为等价 => 吃同一份语料、走同一批位置,所以比值里没有对局分叉的方差。
 * 交替重放多轮取最小值(观测 = 真实 + 非负噪声)。 */
'use strict';
const A = require('./arena.js');
const CUR = require('../strategy.js'); const BASE = require('./baseline/strategy.js');
const METHODS = ['onDeal', 'onRebel', 'discard', 'lead', 'follow'];
const N = parseInt(process.argv[2] || '40', 10);
const R = parseInt(process.argv[3] || '9', 10);

const seqs = [];
const mk = () => {
  const ai = BASE.makeAI(); const seq = []; seqs.push(seq);
  const w = { name: ai.name, cfg: ai.cfg };
  for (const m of METHODS) {
    const orig = ai[m].bind(ai);
    w[m] = function (a, b) { seq.push([m, a, b]); return orig(a, b); };
  }
  return w;
};
for (let d = 0; d < N; d++) A.runOne(mk, () => BASE.makeAI(), d, 1, true);
const corpus = seqs.filter(s => s.length > 0);
const nCalls = corpus.reduce((a, s) => a + s.length, 0);

function cost(factory) {
  const t0 = process.cpuUsage();
  for (let i = 0; i < corpus.length; i++) {
    const ai = factory(); const seq = corpus[i];
    for (let j = 0; j < seq.length; j++) ai[seq[j][0]](seq[j][1], seq[j][2]);
  }
  const d = process.cpuUsage(t0);
  return (d.user + d.system) / nCalls;
}
cost(() => BASE.makeAI()); cost(() => CUR.makeAI());       // JIT 热身
const rb = [], rc = [], rr = [];
for (let r = 0; r < R; r++) {
  const b = cost(() => BASE.makeAI());
  const c = cost(() => CUR.makeAI());
  rb.push(b); rc.push(c); rr.push(c / b);
}
const mn = a => Math.min.apply(null, a);
console.log('语料 ' + corpus.length + ' 实例 / ' + nCalls + ' 次决策,交替 ' + R + ' 轮');
console.log('  baseline ' + mn(rb).toFixed(2) + ' µs   当前 ' + mn(rc).toFixed(2) + ' µs');
/* 用「各自的最小值相除」,不用「比值的最小值」。轮内若争用恰好打在 baseline
 * 上,那一轮的比值会偏低,取比值的最小值等于专挑这种轮 —— 有偏。 */
console.log('  当前/baseline = ' + (mn(rc) / mn(rb)).toFixed(3) +
  '   (比值的最小值 ' + mn(rr).toFixed(3) + ',有偏,仅供参考)');
