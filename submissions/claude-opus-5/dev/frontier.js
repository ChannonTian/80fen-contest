/* (时间, 棋力) 前沿:每个配置同时量「相对 greedy 的倍数」和「相对 baseline 的级差」。
 * 时间用轮内配对(greedy 紧挨着候选跑),棋力用成对换边跑分器。 */
'use strict';
const A = require('./arena.js'); const B = require('./bots.js');
const CUR = require('../strategy.js'); const BASE = require('./baseline/strategy.js');
const NS = parseInt(process.argv[2] || '600', 10);   // 棋力样本
const NT = parseInt(process.argv[3] || '60', 10);    // 每轮计时 deal 数
const RT = parseInt(process.argv[4] || '5', 10);     // 计时轮数

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
const med = a => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };

const VARIANTS = [
  ['当前(不动)',        {}],
  ['rMax3',            { rolloutMaxCards: 3 }],
  ['rK4M3',            { rolloutK: 4, rolloutM: 3 }],
  ['rK4M2',            { rolloutK: 4, rolloutM: 2 }],
  ['followCap40',      { followCap: 40 }],
  ['followCap25',      { followCap: 25 }],
  ['fillCap12',        { fillCap: 12 }],
  ['rollout关',        { rollout: false }],
  ['fc40+fill12',      { followCap: 40, fillCap: 12 }],
  ['fc40+fill12+rMax3',{ followCap: 40, fillCap: 12, rolloutMaxCards: 3 }],
];
timeBot(B.greedy, 12, 900); timeBot(() => CUR.makeAI(), 12, 900);   // JIT 热身
console.log('棋力 n=' + NS + ' | 计时 ' + NT + '×' + RT + ' 轮内配对');
console.log('配置'.padEnd(20) + '级差 vs baseline'.padEnd(24) + '倍数 /greedy');
for (const [name, cfg] of VARIANTS) {
  const r = A.roundArena(() => CUR.makeAI(cfg), () => BASE.makeAI(), NS, 1);
  const rat = [];
  for (let k = 0; k < RT; k++) {
    const g = timeBot(B.greedy, NT, k * NT);
    const c = timeBot(() => CUR.makeAI(cfg), NT, k * NT);
    rat.push(c / g);
  }
  const m = med(rat), sp = rat.slice().sort((a, b) => a - b);
  const sig = r.lvlSE ? (r.lvl / r.lvlSE) : 0;
  console.log(name.padEnd(20) +
    (r.lvl >= 0 ? "+" : "") + r.lvl.toFixed(4) + " ±" + r.lvlSE.toFixed(4) +
    ' (' + sig.toFixed(1) + 'σ)'.padEnd(3) + '   ' +
    m.toFixed(2) + '× [' + sp[0].toFixed(2) + '–' + sp[sp.length - 1].toFixed(2) + ']' +
    (m <= 3 ? '  ✓' : '  ✗超线'));
}
