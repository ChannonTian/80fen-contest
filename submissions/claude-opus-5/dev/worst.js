/* 找出庄家输得最惨的几局,打印牌局过程 */
'use strict';
const G = require('./game.js'); const E = require('../engine.js');
const S = require('../strategy.js'); const A = require('./arena.js');
const N = { 15: 'sJ', 16: 'BJ' }, SY = { S: '♠', H: '♥', D: '♦', C: '♣', X: '' }, RK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
function cs(c, tr) { return (c.suit === 'X' ? N[c.rank] : SY[c.suit] + (RK[c.rank] || c.rank)) + (tr && E.effSuit(c, tr) === 'T' ? '*' : ''); }
function hs(a, tr) { return a.map(c => cs(c, tr)).join(''); }
const sn = ['S0', 'E1', 'N2', 'W3'];
const f = () => S.makeAI();
const results = [];
for (let d = 0; d < 300; d++) {
  const r = A.runOne(f, f, d, 1, true);
  results.push({ d, total: r.sc.total, r });
}
results.sort((a, b) => b.total - a.total);
for (const { d, total } of results.slice(0, parseInt(process.argv[2] || '2', 10))) {
  const st = A.setupFor(d);
  let declTeam = -1;
  console.log('\n===== deal ' + d + '  闲家总分 ' + total + ' =====');
  const res = G.playRound({
    bots: [0, 1, 2, 3].map(() => S.makeAI()), seed: 1, roundIdx: d, levels: st.levels, played: st.played,
    dealerKnown: st.dealerKnown, dealer: st.dealer, firstTaker: st.firstTaker, needCut: st.needCut,
    cutBase: st.cutBase, rebelMode: st.rebelMode,
    trace: (t, plays, rr, trump) => {
      console.log(('t' + t).padStart(3) + ' ' + plays.map(p => sn[p.seat] + ':' + hs(p.cards, trump)).join(' ').padEnd(58) +
        ' → ' + sn[rr.winner] + (rr.points ? ' +' + rr.points : '') + ((rr.winner % 2) === declTeam ? ' 庄' : ' 闲'));
    },
  });
  declTeam = res.declTeam;
  console.log('主 ' + (res.trump.suit || '无主') + res.trumpRank + ' | 庄 ' + sn[res.declSeat] +
    ' | 底 ' + hs(res.buried, res.trump) + '(' + res.kittyPts + '分) | 闲家墩内 ' + res.rawDefPoints +
    ' | 抠底 ' + (res.defWonLast ? '是×' + (2 * res.lastLeadSize) : '否') + ' | 总 ' + res.sc.total);
}
