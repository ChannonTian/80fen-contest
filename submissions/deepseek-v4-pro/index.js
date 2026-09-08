/* deepseek-v4-pro 第二赛季入口(hybrid v3):
 * 官方基线引擎(port-engine.js,公开代码,官方手册明示可 fork 作起点)负责
 * 亮主/埋底/全部领出/庄家方跟牌;我方 v2 保留闲家方跟牌与全部兜底。
 */
'use strict';
const OFF = require('./port-engine.js');
const mineCreate = require('./strategy.js').create;
const thaw = v => Object.assign({}, v);
const isDeclTeam = view => view.declSeat !== undefined && view.declSeat >= 0 && view.myTeam === view.declSeat % 2;

function create() {
  const mine = mineCreate({});
  return {
    name: 'deepseek-v4-pro-v3',
    onDeal(view) {
      try {
        const ctx = {
          vis: view.hand, seat: view.seat, trumpRank: view.trumpRank,
          curDecl: view.curDecl, dealerKnown: view.dealerKnown, dealer: view.dealer,
          firstTaker: view.firstTaker, gates: view.gates, levels: view.levels,
        };
        if (OFF.canReinforce2(view.curDecl, view.seat, view.hand, view.trumpRank, view.rebelHappened)) {
          const asPair = OFF.scoreDeclOption(ctx, { suit: view.curDecl.suit, strength: 2 }).score;
          const asSingle = OFF.scoreDeclOption(ctx, { suit: view.curDecl.suit, strength: 1, hasPair: true }).score;
          if (asPair > asSingle) return { suit: view.curDecl.suit, strength: 2 };
        }
        const d = OFF.aiDeclDecide(ctx);
        return (d && d.pass) ? d.opt : null;
      } catch (e) { return null; }
    },
    onRebel(view) { return true; },
    discard(view) {
      try {
        const r = OFF.aiDiscard(view.hand.slice(), view.trump, { gateAhead: view.gates ? view.gates.includes(view.levels[1 - view.myTeam]) : false });
        if (r && r.length === 8) return r;
      } catch (e) { /* 掉回自己的埋底 */ }
      return mine.discard(view);
    },
    lead(view) {
      try {
        const r = OFF.aiChooseLead(thaw(view));
        const cards = r && r.cards;
        if (cards && cards.length && OFF.classify(cards, view.trump)) return cards;
      } catch (e) { /* 掉回自己的领出 */ }
      return mine.lead(view);
    },
    follow(view, plays) {
      try {
        if (isDeclTeam(view)) {
          const r = OFF.aiChooseFollow(thaw(view), plays.map(p => ({ seat: p.seat, cards: p.cards.slice() })));
          const cards = r && r.cards;
          if (cards && cards.length && OFF.isLegalFollow(view.hand, OFF.classify(plays[0].cards, view.trump), cards, view.trump)) return cards;
        }
      } catch (e) { /* 掉回自己的跟牌 */ }
      return mine.follow(view, plays);
    },
  };
}
module.exports = create;
