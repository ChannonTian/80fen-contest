/* 时间预算专项:相对各档「可能的基准选手」的倍数。
 * README §时间:「超出基准选手 3 倍的提交不进决赛」。基准选手是主办方插进
 * 联赛的未知 bot,只知道它守同样的规则。所以要看的是**最坏情况**倍数。 */
'use strict';
const A = require('./arena.js'); const B = require('./bots.js'); const S = require('../strategy.js');
const N = parseInt(process.argv[2] || '120', 10);
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
  for (let d = 0; d < 15; d++) A.runOne(wrap, () => S.makeAI(), 900 + d, 1, true); // JIT 热身
  calls = 0; ns = 0;
  for (let d = 0; d < N; d++) A.runOne(wrap, () => S.makeAI(), d, 1, true);
  return { name, us: ns / 1000 / calls };
}
const refs = [['template', B.template], ['naive', B.naive], ['greedy', B.greedy],
              ['pointHog', B.pointHog], ['trumpMiser', B.trumpMiser]];
const cands = (process.argv[3] ? JSON.parse(process.argv[3]) : [['提交配置', {}]]);
const r = refs.map(([n, f]) => timeBot(n, f));
const c = cands.map(([n, cfg]) => timeBot(n, () => S.makeAI(cfg)));
console.log('N=' + N + ' deal,每次决策平均 µs');
console.log('参照:', r.map(x => x.name + ' ' + x.us.toFixed(1)).join(' | '));
const worst = Math.min(...r.map(x => x.us));           // 最快的参照 = 最坏情况分母
const worstName = r.find(x => x.us === worst).name;
for (const x of c) {
  const line = r.map(y => y.name + ' ' + (x.us / y.us).toFixed(2) + '×').join('  ');
  const ok = (x.us / worst) <= 3;
  console.log('  ' + x.name.padEnd(16), x.us.toFixed(1).padStart(7) + ' µs |', line,
    '| 最坏(' + worstName + ') ' + (x.us / worst).toFixed(2) + '× ' + (ok ? '✓' : '✗超线'));
}
