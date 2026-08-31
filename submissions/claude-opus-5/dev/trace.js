/* dev/trace.js —— 打印一局的完整过程,人工找昏招 */
'use strict';
const G = require('./game.js');
const E = require('../engine.js');
const S = require('../strategy.js');
const A = require('./arena.js');

const d = parseInt(process.argv[2] || '0', 10);
const N = { 15: '小王', 16: '大王' };
const SY = { S: '♠', H: '♥', D: '♦', C: '♣', X: '' };
const RK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
function cs(c, trump) {
  const t = trump && E.effSuit(c, trump) === 'T' ? '*' : '';
  if (c.suit === 'X') return N[c.rank] + t;
  return SY[c.suit] + (RK[c.rank] || c.rank) + t;
}
function hs(cards, trump) { return cards.map(c => cs(c, trump)).join(' '); }

const st = A.setupFor(d);
const bots = [0, 1, 2, 3].map(() => S.makeAI());
const seatName = ['南0', '东1', '北2', '西3'];
const res = G.playRound({
  bots, seed: 1, roundIdx: d, levels: st.levels, played: st.played,
  dealerKnown: st.dealerKnown, dealer: st.dealer, firstTaker: st.firstTaker,
  needCut: st.needCut, cutBase: st.cutBase, rebelMode: st.rebelMode,
  trace: function (t, plays, r, trump) {
    const pts = r.points;
    const line = plays.map(p => seatName[p.seat] + ':' + hs(p.cards, trump)).join('  ');
    console.log('  墩' + String(t).padStart(2) + ' ' + line.padEnd(66) +
      ' → ' + seatName[r.winner] + (pts ? '  +' + pts : '') +
      (r.winner % 2 === (res0.declTeam) ? ' [庄]' : ' [闲]'));
  },
});
var res0 = res;
