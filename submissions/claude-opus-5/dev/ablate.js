/* dev/ablate.js —— 消融:把某一个决策换成最笨的合法着法,看损失多少。
 * 损失越大 = 该决策的杠杆越大 = 值得继续优化的地方。 */
'use strict';
const A = require('./arena.js');
const S = require('../strategy.js');
const E = require('../engine.js');
const M = require('../moves.js');

function ablated(which) {
  return function () {
    const ai = S.makeAI();
    const o = {
      name: 'ablate-' + which,
      onDeal: which === 'deal' ? () => null : ai.onDeal,
      onRebel: which === 'rebel' ? () => false : ai.onRebel,
      discard: which === 'discard'
        ? (v) => v.hand.slice().sort((a, b) => M.junkScore(a, v.trump) - M.junkScore(b, v.trump)).slice(0, 8)
        : ai.discard,
      lead: which === 'lead' ? (v) => M.forceLegalLead(v.hand, v.trump) : ai.lead,
      follow: which === 'follow'
        ? (v, p) => M.forceLegalFollow(v.hand, E.classify(p[0].cards, v.trump), v.trump, null)
        : ai.follow,
    };
    return o;
  };
}
const n = parseInt(process.argv[2] || '400', 10);
const full = () => S.makeAI();
console.log('n=' + n + '  (负数 = 拆掉这一块之后变差,绝对值 = 这一块的价值)');
for (const w of ['deal', 'rebel', 'discard', 'lead', 'follow']) {
  const r = A.roundArena(ablated(w), full, n, 1);
  console.log('  去掉 ' + w.padEnd(9), (r.lvl >= 0 ? '+' : '') + r.lvl.toFixed(4), '±' + r.lvlSE.toFixed(4),
    ('(' + (r.lvlSE > 0 ? (r.lvl / r.lvlSE).toFixed(1) : '0') + 'σ)').padStart(9),
    ' 净分 ' + r.np.toFixed(2), ' 行为差 ' + (r.diffRate * 100).toFixed(0) + '%');
}
