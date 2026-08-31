/* 每次决策的平均耗时(µs) */
'use strict';
const G = require('./game.js'); const A = require('./arena.js');
const B = require('./bots.js'); const S = require('../strategy.js');
const { mcpvbot } = require('./mcpv.js');
const N = 120;
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
  for (let d = 0; d < N; d++) { A.runOne(wrap, () => S.makeAI(), d, 1, true); }
  return { name, calls, us: ns / 1000 / calls, totalMs: ns / 1e6 };
}
const rows = [
  timeBot('template', B.template), timeBot('naive', B.naive), timeBot('greedy', B.greedy),
  timeBot('pointHog', B.pointHog),
  timeBot('本AI(当前)', () => S.makeAI()),
  timeBot('roll<=4 K6 M4', () => S.makeAI({ rollout: true, rolloutK: 6, rolloutM: 4 })),
  timeBot('roll<=4 K8 M4', () => S.makeAI({ rollout: true, rolloutK: 8, rolloutM: 4 })),
  timeBot('roll<=3 K12 M6', () => S.makeAI({ rollout: true, rolloutMaxCards: 3, rolloutK: 12, rolloutM: 6 })),
  timeBot('roll<=4 K10 M5', () => S.makeAI({ rollout: true })),
];
const base = rows.find(r => r.name === 'greedy').us;
console.log('每次决策平均耗时(' + N + ' 个 deal,两个座位)');
for (const r of rows) {
  console.log('  ' + r.name.padEnd(20), r.us.toFixed(1).padStart(8) + ' µs',
    '| 相对 greedy ' + (r.us / base).toFixed(2) + '×',
    '| 一场30局×100手 ≈ ' + (r.us * 3000 / 1000).toFixed(0) + ' ms');
}
