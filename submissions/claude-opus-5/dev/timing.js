/* 每次决策的平均耗时(µs) */
'use strict';
const G = require('./game.js'); const A = require('./arena.js');
const B = require('./bots.js'); const S = require('../strategy.js');
const { mcpvbot } = require('./mcpv.js');
const N = parseInt(process.argv[2] || '120', 10);
function timeBot(name, f) {
  let calls = 0, ns = 0;
  const wrap = () => {
    const ai = f();
    const w = { name: ai.name, cfg: ai.cfg };
    for (const m of ['onDeal', 'onRebel', 'discard', 'lead', 'follow']) {
      const orig = ai[m].bind(ai);
      w[m] = function (a, b) {
        const t = process.hrtime.bigint();
        const r = orig(a, b);
        ns += Number(process.hrtime.bigint() - t); calls++;
        return r;
      };
    }
    return w;
  };
  /* 先跑几局热身让 JIT 稳定,再计时 */
  for (let d = 0; d < 15; d++) A.runOne(wrap, () => S.makeAI(), 900 + d, 1, true);
  calls = 0; ns = 0;
  for (let d = 0; d < N; d++) { A.runOne(wrap, () => S.makeAI(), d, 1, true); }
  return { name, calls, us: ns / 1000 / calls, totalMs: ns / 1e6 };
}
const rows = [
  timeBot('template', B.template), timeBot('naive', B.naive), timeBot('greedy', B.greedy),
  timeBot('pointHog', B.pointHog),
  timeBot('本AI(提交配置)', () => S.makeAI()),
  timeBot('无rollout', () => S.makeAI({ rollout: false })),
];
const base = rows.find(r => r.name === 'greedy').us;
console.log('每次决策平均耗时(' + N + ' 个 deal,两个座位)');
for (const r of rows) {
  console.log('  ' + r.name.padEnd(20), r.us.toFixed(1).padStart(8) + ' µs',
    '| 相对 greedy ' + (r.us / base).toFixed(2) + '×',
    '| 一场30局×100手 ≈ ' + (r.us * 3000 / 1000).toFixed(0) + ' ms');
}
