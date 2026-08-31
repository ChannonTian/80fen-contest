/* dev/diag.js —— 找损失来源:按阶段/牌型/庄闲/墩号统计 */
'use strict';
const G = require('./game.js');
const E = require('../engine.js');
const A = require('./arena.js');
const S = require('../strategy.js');
const B = require('./bots.js');

const n = parseInt(process.argv[2] || '400', 10);
const oppName = process.argv[3] || 'self';
const fa = () => S.makeAI();
const fb = oppName === 'self' ? (() => S.makeAI()) : (B[oppName] || (() => S.makeAI()));

const acc = {
  rounds: 0, held: 0, totalSum: 0, up: 0,
  ntRounds: 0, declStrength: [0, 0, 0, 0, 0],
  kittyPts: 0, kittyTaken: 0, kittyBonus: 0,
  lastSize: {}, byTrick: [], defByTrick: [],
  leadType: {}, ptsBySuitType: {},
  redeals: 0,
  noDeclare: 0,
  histTotal: new Array(11).fill(0),   // total 分布 0,1-39,40-79,80-119,...
};
for (let i = 0; i < 30; i++) { acc.byTrick.push(0); acc.defByTrick.push(0); }

function collect(res) {
  acc.rounds++;
  if (res.sc.declHeld) acc.held++;
  acc.totalSum += res.sc.total;
  acc.up += res.sc.up;
  if (!res.trump.suit) acc.ntRounds++;
  if (res.curDecl) acc.declStrength[res.curDecl.strength]++; else acc.noDeclare++;
  acc.kittyPts += res.kittyPts;
  if (res.defWonLast) { acc.kittyTaken++; acc.kittyBonus += res.kittyPts * 2 * res.lastLeadSize; }
  acc.lastSize[res.lastLeadSize] = (acc.lastSize[res.lastLeadSize] || 0) + 1;
  acc.redeals += res.redeals;
  const b = res.sc.total === 0 ? 0 : res.sc.total < 40 ? 1 : res.sc.total < 80 ? 2 : res.sc.total < 120 ? 3 : res.sc.total < 160 ? 4 : 5;
  acc.histTotal[b]++;
  for (const tk of res.tricks) {
    const i = Math.min(tk.t, 29);
    acc.byTrick[i] += tk.points;
    if (tk.winner % 2 === res.defTeam) acc.defByTrick[i] += tk.points;
    const key = tk.type + (tk.suit === 'T' ? '-主' : '-副');
    if (!acc.leadType[key]) acc.leadType[key] = { n: 0, pts: 0, defWon: 0 };
    acc.leadType[key].n++; acc.leadType[key].pts += tk.points;
    if (tk.winner % 2 === res.defTeam) acc.leadType[key].defWon += tk.points;
  }
}

for (let d = 0; d < n; d++) {
  collect(A.runOne(fa, fb, d, 1, true));
  collect(A.runOne(fa, fb, d, 1, false));
}
const R = acc.rounds;
console.log('局数', R, '| 庄家守住率', (acc.held / R * 100).toFixed(1) + '%',
  '| 闲家均分', (acc.totalSum / R).toFixed(1), '| 平均升级', (acc.up / R).toFixed(2));
console.log('结果分布 0 / 1-39 / 40-79 / 80-119 / 120-159 / 160+ :', acc.histTotal.slice(0, 6).join(' / '),
  '(' + acc.histTotal.slice(0, 6).map(x => (x / R * 100).toFixed(0) + '%').join(' ') + ')');
console.log('无主局', (acc.ntRounds / R * 100).toFixed(1) + '%', '| 无人亮主', (acc.noDeclare / R * 100).toFixed(1) + '%',
  '| 亮主强度 1/2/3/4:', acc.declStrength.slice(1).join('/'), '| 重发', acc.redeals);
console.log('底分均值', (acc.kittyPts / R).toFixed(1), '| 闲家抠底率', (acc.kittyTaken / R * 100).toFixed(1) + '%',
  '| 抠底进账均值', (acc.kittyBonus / R).toFixed(1), '| 末墩张数分布', JSON.stringify(acc.lastSize));
console.log('每墩总分(前12墩):', acc.byTrick.slice(0, 12).map(x => (x / R).toFixed(1)).join(' '));
console.log('每墩闲家得分:', acc.defByTrick.slice(0, 12).map(x => (x / R).toFixed(1)).join(' '));
const lt = Object.entries(acc.leadType).sort((a, b) => b[1].pts - a[1].pts);
console.log('按领出牌型:');
for (const [k, v] of lt) console.log('  ' + k.padEnd(12), 'n=' + String(v.n).padStart(6),
  '总分/墩 ' + (v.pts / v.n).toFixed(2), ' 闲家拿走 ' + (v.defWon / Math.max(1, v.pts) * 100).toFixed(0) + '%');
