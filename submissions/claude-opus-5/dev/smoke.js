'use strict';
const G = require('./game.js');
const { makeAI } = require('../strategy.js');
const f = () => makeAI();
let t0 = Date.now();
let totalRounds = 0, totalViol = 0, totalPen = 0;
for (let s = 1; s <= 10; s++) {
  const m = G.playMatch([f, f, f, f], s, {});
  totalRounds += m.nRounds;
  totalViol += m.violations.reduce((a, b) => a + b, 0);
  totalPen += m.penalties[0] + m.penalties[1];
  console.log('seed', s, '| winner team', m.winner, '| levels', m.levels.join('/'), '| rounds', m.nRounds,
    '| viol', m.violations.join(','), '| pen', m.penalties.join(','));
}
console.log('---');
console.log('总局数', totalRounds, '| 总违规', totalViol, '| 总罚分', totalPen, '| 耗时', Date.now() - t0, 'ms');
