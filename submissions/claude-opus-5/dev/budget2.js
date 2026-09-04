/* 当前 vs baseline vs 参照,同一进程内计时,消掉机器噪声 */
'use strict';
const A = require('./arena.js'); const B = require('./bots.js');
const CUR = require('../strategy.js'); const BASE = require('./baseline/strategy.js');
const N = parseInt(process.argv[2] || '150', 10);
function timeBot(name, f) {
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
  for (let d = 0; d < 15; d++) A.runOne(wrap, () => BASE.makeAI(), 900 + d, 1, true);
  calls = 0; ns = 0;
  for (let d = 0; d < N; d++) A.runOne(wrap, () => BASE.makeAI(), d, 1, true);
  return { name, us: ns / 1000 / calls };
}
const rows = [ timeBot('greedy', B.greedy), timeBot('pointHog', B.pointHog),
  timeBot('baseline(已提交)', () => BASE.makeAI()), timeBot('当前', () => CUR.makeAI()) ];
const g = rows[0].us, b = rows[2].us;
for (const r of rows) console.log('  ' + r.name.padEnd(18), r.us.toFixed(2).padStart(7) + ' µs',
  '| /greedy ' + (r.us / g).toFixed(2) + '×', '| /baseline ' + (r.us / b).toFixed(3) + '×');
