/* 概率模型的标定质量:Brier 分数越低越好 */
'use strict';
const A = require('./arena.js');
const S = require('../strategy.js');
const n = parseInt(process.argv[2] || '60', 10);
const st = { cf: 0, mc: 0, ipf: 0, n: 0, cfT: 0, mcT: 0, ipfT: 0, base: 0, pos: 0 };
function probe(truth, pCF, pMC, pIPF) {
  st.n++; st.pos += truth;
  st.cf += (pCF - truth) ** 2; st.mc += (pMC - truth) ** 2; st.ipf += (pIPF - truth) ** 2;
  st.cfT += Math.abs((pCF > 0.5 ? 1 : 0) - truth);
  st.mcT += Math.abs((pMC > 0.5 ? 1 : 0) - truth);
  st.ipfT += Math.abs((pIPF > 0.5 ? 1 : 0) - truth);
}
const fa = () => S.makeAI({ __probe: probe, mcSamples: 24 });
const fb = () => S.makeAI();
for (let d = 0; d < n; d++) { A.runOne(fa, fb, d, 1, true); A.runOne(fa, fb, d, 1, false); }
const base = st.pos / st.n;
st.base = st.n * base * (1 - base);
console.log('样本', st.n, '| 实际「压得住」比例', (base * 100).toFixed(1) + '%');
console.log('Brier(越低越好):  常数基线', (st.base / st.n).toFixed(4),
  '| 闭式', (st.cf / st.n).toFixed(4), '| 蒙特卡洛', (st.mc / st.n).toFixed(4), '| IPF', (st.ipf / st.n).toFixed(4));
console.log('二值判错率:        闭式', (st.cfT / st.n * 100).toFixed(1) + '%',
  '| 蒙特卡洛', (st.mcT / st.n * 100).toFixed(1) + '%', '| IPF', (st.ipfT / st.n * 100).toFixed(1) + '%');
