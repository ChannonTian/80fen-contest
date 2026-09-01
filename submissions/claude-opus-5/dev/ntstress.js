/* 无主局压力测试:自对弈里 0% 出现,但联赛里对手会用王对造出来 */
'use strict';
const G = require('./game.js'); const A = require('./arena.js');
const S = require('../strategy.js'); const B = require('./bots.js');
const E = require('../engine.js');
const me = () => S.makeAI();

/* ① 用 ntForcer 当对手,逼出真实的无主局 */
let nt = 0, rounds = 0, viol = 0, pen = 0;
for (let d = 0; d < 400; d++) {
  for (const on of [true, false]) {
    const r = A.runOne(me, B.ntForcer, d, 4242, on);
    rounds++; if (!r.trump.suit) nt++;
    viol += r.violations.reduce((a, b) => a + b, 0);
    pen += r.penalties[0] + r.penalties[1];
  }
}
console.log('① vs ntForcer:', rounds, '局 | 无主局', nt, '(' + (nt / rounds * 100).toFixed(1) + '%) | 违规', viol, '| 罚分', pen);

/* ② 强制无主:把四家都换成不亮主的,一定走「无人亮主 → 无主局」 */
function mute(f) { return () => { const a = f(); return { name: a.name, cfg: a.cfg, onDeal: () => null, onRebel: a.onRebel, discard: a.discard, lead: a.lead, follow: a.follow }; }; }
let r2 = 0, v2 = 0, p2 = 0, nt2 = 0;
for (let d = 0; d < 300; d++) {
  const st = A.setupFor(d);
  const res = G.playRound({
    bots: [mute(me)(), mute(me)(), mute(me)(), mute(me)()], seed: 99, roundIdx: d,
    levels: st.levels, played: st.played, dealerKnown: st.dealerKnown, dealer: st.dealer,
    firstTaker: st.firstTaker, needCut: st.needCut, cutBase: st.cutBase, rebelMode: st.rebelMode,
  });
  r2++; if (!res.trump.suit) nt2++;
  v2 += res.violations.reduce((a, b) => a + b, 0); p2 += res.penalties[0] + res.penalties[1];
}
console.log('② 全场不亮主:', r2, '局 | 无主局', nt2, '| 违规', v2, '| 罚分', p2);

/* ③ 极端手牌:一门到底 / 全是王和级数牌 */
let v3 = 0, n3 = 0;
const ai = S.makeAI();
const T = [{ suit: null, rank: 2 }, { suit: 'S', rank: 14 }, { suit: 'H', rank: 2 }];
for (const trump of T) {
  for (let k = 0; k < 3; k++) {
    const hand = [];
    let id = 0;
    if (k === 0) for (let r = 2; r <= 14 && hand.length < 25; r++) { hand.push({ suit: 'S', rank: r, id: id++ }); hand.push({ suit: 'S', rank: r, id: id++ }); }
    if (k === 1) { for (let j = 0; j < 4; j++) hand.push({ suit: 'X', rank: j < 2 ? 15 : 16, id: id++ }); for (const s of ['S', 'H', 'D', 'C']) for (let j = 0; j < 2; j++) hand.push({ suit: s, rank: trump.rank, id: id++ }); while (hand.length < 25) hand.push({ suit: 'D', rank: 3 + (hand.length % 9), id: id++ }); }
    if (k === 2) { while (hand.length < 25) hand.push({ suit: 'C', rank: 2 + (hand.length % 13), id: id++ }); }
    const view = Object.freeze({
      phase: 'lead', seat: 0, myTeam: 0, hand: Object.freeze(hand.slice(0, 25)), trumpRank: trump.rank,
      trump: Object.freeze(trump), declSeat: 0, curDecl: null, rebelHappened: false, dealerKnown: true,
      dealer: 0, firstTaker: 0, levels: Object.freeze([2, 2]), played: Object.freeze([-1, -1]),
      gates: Object.freeze([2, 5, 10, 13]), round: 0, kittySize: 8,
      history: Object.freeze([]), buriedKnown: Object.freeze([]), trickNo: 0,
    });
    try {
      const l = ai.lead(view); n3++;
      if (!l || !l.length || !E.classify(l, trump)) v3++;
      const lc = [hand[0]];
      const fv = Object.freeze(Object.assign({}, view, { seat: 1, myTeam: 1, phase: 'follow', hand: Object.freeze(hand.slice(1, 25)), history: Object.freeze([Object.freeze({ seat: 0, cards: Object.freeze(lc) })]) }));
      const f = ai.follow(fv, [{ seat: 0, cards: lc }]); n3++;
      if (!E.isLegalFollow(fv.hand, E.classify(lc, trump), f, trump, null)) v3++;
    } catch (e) { v3++; console.log('  抛异常:', e.message); }
  }
}
console.log('③ 极端手牌(单门到底/全王级/无主):', n3, '次调用 | 有问题', v3, v3 === 0 ? '✓' : '✗');
