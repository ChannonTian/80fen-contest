/* RULES.md §S5 一致性自测向量 —— 逐条断言 */
'use strict';
const E = require('../engine.js');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra !== undefined ? '  → got: ' + JSON.stringify(extra) : '')); }
}
function eq(name, got, want) { ok(name + ' (want ' + JSON.stringify(want) + ')', got === want, got); }

/* 牌工厂:每次调用给一个新 id,同花同点可造两张 */
let _id = 0;
function C(suit, rank) { return { suit: suit, rank: rank, id: _id++ }; }
function P(suit, rank) { return [C(suit, rank), C(suit, rank)]; }
const SJ = () => C('X', 15), BJ = () => C('X', 16);

const T = { suit: 'S', rank: 2 };     // 主♠打2
const NT = { suit: null, rank: 2 };   // 无主打2

/* ===== 牌序与主牌归属 ===== */
eq('effSuit(♥2,T)', E.effSuit(C('H', 2), T), 'T');
eq('effSuit(♠9,T)', E.effSuit(C('S', 9), T), 'T');
eq('effSuit(大王,T)', E.effSuit(BJ(), T), 'T');
eq('effSuit(♥9,T)', E.effSuit(C('H', 9), T), 'H');
ok('ordIdx 排序 大王>小王>♠2>♥2>♠A',
  E.ordIdx(BJ(), T) > E.ordIdx(SJ(), T) &&
  E.ordIdx(SJ(), T) > E.ordIdx(C('S', 2), T) &&
  E.ordIdx(C('S', 2), T) > E.ordIdx(C('H', 2), T) &&
  E.ordIdx(C('H', 2), T) > E.ordIdx(C('S', 14), T),
  [E.ordIdx(BJ(), T), E.ordIdx(SJ(), T), E.ordIdx(C('S', 2), T), E.ordIdx(C('H', 2), T), E.ordIdx(C('S', 14), T)]);
eq('effSuit(♥2,NT)', E.effSuit(C('H', 2), NT), 'T');
eq('effSuit(♠A,NT)', E.effSuit(C('S', 14), NT), 'S');
ok('NT: ordIdx(小王)>ordIdx(♥2)', E.ordIdx(SJ(), NT) > E.ordIdx(C('H', 2), NT));
/* 补充:主花色散牌 A 恒 11、最小恒 0,不管级数 */
eq('打2 ♠3 = 0', E.ordIdx(C('S', 3), T), 0);
eq('打2 ♠A = 11', E.ordIdx(C('S', 14), T), 11);
eq('打5 ♠2 = 0', E.ordIdx(C('S', 2), { suit: 'S', rank: 5 }), 0);
eq('打5 ♠A = 11', E.ordIdx(C('S', 14), { suit: 'S', rank: 5 }), 11);

/* ===== 牌型 ===== */
function ty(cards, trump) { const c = E.classify(cards, trump); return c ? (c.type === 'tractor' ? 'tractor' + c.len : c.type) : null; }
eq('[♥5] single', ty([C('H', 5)], T), 'single');
eq('[♥5,♥5] pair', ty(P('H', 5), T), 'pair');
eq('[♥5,♦5] null', ty([C('H', 5), C('D', 5)], T), null);
eq('P(H,5)+P(H,6) 打2 tractor', ty(P('H', 5).concat(P('H', 6)), T), 'tractor2');
eq('P(H,6)+P(H,8) 打7 tractor', ty(P('H', 6).concat(P('H', 8)), { suit: 'S', rank: 7 }), 'tractor2');
eq('P(H,6)+P(H,8) 打2 throw', ty(P('H', 6).concat(P('H', 8)), T), 'throw');
eq('P(S,A)+P(H,2) T tractor', ty(P('S', 14).concat(P('H', 2)), T), 'tractor2');
eq('P(H,2)+P(S,2) T tractor', ty(P('H', 2).concat(P('S', 2)), T), 'tractor2');
eq('P(S,2)+P(小王) T tractor', ty(P('S', 2).concat([SJ(), SJ()]), T), 'tractor2');
eq('P(小王)+P(大王) T tractor', ty([SJ(), SJ(), BJ(), BJ()], T), 'tractor2');
eq('P(H,2)+P(D,2) T throw', ty(P('H', 2).concat(P('D', 2)), T), 'throw');
eq('P(S,A)+P(S,2) T throw', ty(P('S', 14).concat(P('S', 2)), T), 'throw');
eq('P(H,2)+P(小王) NT tractor', ty(P('H', 2).concat([SJ(), SJ()]), NT), 'tractor2');
eq('P(H,2)+P(D,2) NT throw', ty(P('H', 2).concat(P('D', 2)), NT), 'throw');
eq('P(H,A)+[♥K] T throw', ty(P('H', 14).concat([C('H', 13)]), T), 'throw');

/* ===== 跟牌义务 ===== */
function legal(hand, leadCards, chosen, trump, opts) {
  const lead = E.classify(leadCards, trump || T);
  return E.isLegalFollow(hand, lead, chosen, trump || T, opts);
}
{
  const h9a = C('H', 9), h9b = C('H', 9), h3 = C('H', 3), d4 = C('D', 4), s5 = C('S', 5);
  const hand = [h9a, h9b, h3, d4, s5];
  eq('门内有对必对 ♥3+♥9 非法', legal(hand, P('H', 10), [h3, h9a]), false);
  eq('♥9♥9 合法', legal(hand, P('H', 10), [h9a, h9b]), true);
}
{
  const h3 = C('H', 3), h7 = C('H', 7), d4 = C('D', 4);
  eq('无对可拆两单 合法', legal([h3, h7, d4], P('H', 10), [h3, h7]), true);
}
{
  const h3 = C('H', 3), d4 = C('D', 4), d9 = C('D', 9);
  eq('本门只剩一张全出 合法', legal([h3, d4, d9], P('H', 10), [h3, d4]), true);
  eq('藏本门 非法', legal([h3, d4, d9], P('H', 10), [d4, d9]), false);
}
{
  const d4 = C('D', 4), d9 = C('D', 9), c3 = C('C', 3);
  eq('断门任出 合法', legal([d4, d9, c3], P('H', 10), [d4, c3]), true);
}
{
  const h5 = P('H', 5), h6 = P('H', 6), hK = P('H', 13), h3 = C('H', 3), d2 = C('D', 2);
  const hand = h5.concat(h6, hK, [h3, d2]);
  const lead = P('H', 10).concat(P('H', 11));
  eq('有拖拉机必须跟:♥5♥5+♥K♥K 非法', legal(hand, lead, h5.concat(hK)), false);
  eq('♥5♥5+♥6♥6 合法', legal(hand, lead, h5.concat(h6)), true);
}
{
  const h5 = P('H', 5), h6 = P('H', 6), h7 = P('H', 7);
  const hand = h5.concat(h6, h7);
  const lead = P('H', 9).concat(P('H', 10));
  eq('三连对拆 55-66 合法', legal(hand, lead, h5.concat(h6)), true);
  eq('三连对拆 55+77 非法', legal(hand, lead, h5.concat(h7)), false);
}
{
  /* 领出三连对(♥9♥9 ♥10♥10 ♥J♥J,ord 6-7-8),手中最长只有二连对 */
  const leadT3 = P('H', 9).concat(P('H', 10), P('H', 11));
  /* 手牌 8 张 ♥:对子 ord 2,3,7,10 → 最长拖拉机 m=2 */
  const p5 = P('H', 5), p6 = P('H', 6), p10 = P('H', 10), pK = P('H', 13);
  const myHand = p5.concat(p6, p10, pK);
  const noAdj = p6.concat(p10, pK);           // ord 3,7,10 → cm=0
  const withAdj = p5.concat(p6, pK);          // ord 2,3,10 → cm=2
  eq('partial 开 → 拆散跟(cm<m) 非法', legal(myHand, leadT3, noAdj), false);
  eq('partial 关 → 拆散跟 合法',
    legal(myHand, leadT3, noAdj, T, { strictTractorFollow: true, partialTractorFollow: false }), true);
  eq('partial 开 → 跟出最长二连对 合法', legal(myHand, leadT3, withAdj), true);
  eq('strict 全关 → 拆散跟 合法',
    legal(myHand, leadT3, noAdj, T, { strictTractorFollow: false, partialTractorFollow: false }), true);
}

/* ===== 一墩胜负 ===== */
function trick(handsCards, trump) {
  const plays = handsCards.map(function (cards, i) { return { seat: i, cards: cards }; });
  return E.resolveTrick(plays, trump || T);
}
eq('♥5/♥K/♥A/♥7 → 第三家', trick([[C('H', 5)], [C('H', 13)], [C('H', 14)], [C('H', 7)]]).winIdx, 2);
eq('♥A/♠3/♥6/♥7 → 第二家毙', trick([[C('H', 14)], [C('S', 3)], [C('H', 6)], [C('H', 7)]]).winIdx, 1);
eq('♥10♥10/♠3♠4/♥4♥4/♥6♥7 → 领出方',
  trick([P('H', 10), [C('S', 3), C('S', 4)], P('H', 4), [C('H', 6), C('H', 7)]]).winIdx, 0);
eq('NT ♥5/♠A/♥6/♦A → 第三家',
  trick([[C('H', 5)], [C('S', 14)], [C('H', 6)], [C('D', 14)]], NT).winIdx, 2);
/* 补充:分数计入收牌方,垫的分也算 */
eq('分数统计', trick([[C('H', 5)], [C('S', 13)], [C('H', 10)], [C('H', 7)]]).points, 25);

/* ===== 甩牌 ===== */
{
  const hands = [[], [], [], []];
  const throwCards = P('H', 12).concat([C('H', 11)]);
  hands[0] = throwCards.slice();
  hands[1] = [C('H', 13), C('D', 3)];
  hands[2] = [C('C', 3)]; hands[3] = [C('C', 4)];
  const r = E.checkThrow(hands, 0, throwCards, T);
  ok('甩 ♥Q♥Q+♥J,别家有 ♥K → 失败', r.ok === false, r);
  ok('被迫只出 ♥J', r.ok === false && r.forced.type === 'single' && r.forced.cards[0].rank === 11, r.forced && r.forced.type);
}
{
  const hands = [[], [], [], []];
  const throwCards = P('H', 14).concat([C('H', 13)]);
  hands[0] = throwCards.slice();
  hands[1] = [C('H', 12), C('D', 3)];
  hands[2] = [C('H', 12)]; hands[3] = [C('C', 4)];
  const r = E.checkThrow(hands, 0, throwCards, T);
  ok('甩 ♥A♥A+♥K,别家最大 ♥Q → 成功', r.ok === true, r);
}

/* ===== 亮主 / 加固 / 造反 ===== */
eq('declarationOf([♥2],2).suit', (E.declarationOf([C('H', 2)], 2) || {}).suit, 'H');
eq('declarationOf([♥2],2).strength', (E.declarationOf([C('H', 2)], 2) || {}).strength, 1);
eq('declarationOf(P(小王),2)', (E.declarationOf([SJ(), SJ()], 2) || {}).strength, 3);
eq('declarationOf(P(大王),2)', (E.declarationOf([BJ(), BJ()], 2) || {}).strength, 4);
eq('declarationOf([小王,大王],2) null', E.declarationOf([SJ(), BJ()], 2), null);
eq('王对反一对级数牌 允许', E.declAllowed({ seat: 1, suit: 'H', strength: 2 }, { seat: 2, suit: null, strength: 3 }, false), true);
eq('自己已亮♠单张,改亮♥对 拒绝', E.declAllowed({ seat: 1, suit: 'S', strength: 1 }, { seat: 1, suit: 'H', strength: 2 }, false), false);
eq('自己已亮♠单张,改亮小王对 拒绝', E.declAllowed({ seat: 1, suit: 'S', strength: 1 }, { seat: 1, suit: null, strength: 3 }, false), false);
eq('自己已亮♠单张,改亮大王对 拒绝', E.declAllowed({ seat: 1, suit: 'S', strength: 1 }, { seat: 1, suit: null, strength: 4 }, false), false);
eq('别家大王对反♠单张 允许', E.declAllowed({ seat: 1, suit: 'S', strength: 1 }, { seat: 2, suit: null, strength: 4 }, false), true);
eq('亮主者本人加固 允许', E.canReinforce({ seat: 1, suit: 'H', strength: 1 }, { seat: 1, suit: 'H', strength: 2 }, false), true);
eq('已发生造反不可加固', E.canReinforce({ seat: 1, suit: 'H', strength: 1 }, { seat: 1, suit: 'H', strength: 2 }, true), false);
eq('非亮主者不可加固', E.canReinforce({ seat: 1, suit: 'H', strength: 1 }, { seat: 3, suit: 'H', strength: 2 }, false), false);
eq('已经是对不可加固', E.canReinforce({ seat: 1, suit: 'H', strength: 2 }, { seat: 1, suit: 'H', strength: 2 }, false), false);
{
  /* 15 分且无主牌 → 可造反 (主♠打2) */
  const h = [C('H', 5), C('D', 5), C('C', 5), C('H', 3), C('D', 4), C('C', 6), C('H', 7)];
  const r = E.canFullRebel(h, T);
  ok('15分无主牌 可造反', r.ok === true && r.pts === 15 && r.nT === 0, r);
}
{
  /* 主 3 张、50 分 → 可造反(按主牌那条) */
  const h = [C('S', 3), C('S', 4), C('S', 6), C('H', 13), C('D', 13), C('C', 13), C('H', 10), C('D', 10)];
  const r = E.canFullRebel(h, T);
  ok('主3张50分 可造反', r.ok === true && r.byTrump === true && r.nT === 3 && r.pts === 50, r);
}
{
  /* 主 4 张、20 分 → 不可造反 */
  const h = [C('S', 3), C('S', 4), C('S', 6), C('S', 7), C('H', 10), C('D', 10), C('C', 3)];
  const r = E.canFullRebel(h, T);
  ok('主4张20分 不可造反', r.ok === false, r);
}

/* ===== 结算 ===== */
{
  const kitty = [C('H', 10), C('D', 13), C('C', 3), C('C', 4), C('C', 6), C('C', 7), C('C', 8), C('C', 9)];
  eq('底分20', E.countPoints(kitty), 20);
  const a = E.scoreRound(75, kitty, false, 1);
  ok('闲家75未赢末墩 → 庄升1', a.declHeld === true && a.up === 1, a);
  const b = E.scoreRound(75, kitty, true, 1);
  ok('闲家75赢末墩单张 → 115 上台', b.total === 115 && b.declHeld === false && b.up === 0, b);
  const c = E.scoreRound(35, kitty, true, 2);
  ok('闲家35赢末墩对子 → 115 上台', c.total === 115 && c.declHeld === false && c.up === 0, c);
  const d = E.scoreRound(0, kitty, false, 1);
  ok('闲家0分 → 庄升3', d.declHeld === true && d.up === 3, d);
}

/* ===== 整场推进 ===== */
{
  const G = [2, 5, 10, 13];
  const r1 = E.advanceMatch([2, 2], 1, { declHeld: true, up: 2 }, null, [2, 2]);
  ok('[2,2] 庄1守住升2 → 队1到4,庄3', r1.levels[1] === 4 && r1.dealer === 3, r1);
  const r2 = E.advanceMatch([2, 2], 1, { declHeld: false, up: 1 }, null, [2, 2]);
  ok('[2,2] 闲上台升1 → 队0到3,庄2', r2.levels[0] === 3 && r2.dealer === 2, r2);
  const r3 = E.advanceMatch([2, 2], 1, { declHeld: false, up: 0 }, null, [2, 2]);
  ok('闲家80-119 上台不升级', r3.levels[0] === 2 && r3.dealer === 2, r3);
  const r4 = E.advanceMatch([13, 2], 0, { declHeld: true, up: 3 }, null, [13, 13]);
  ok('[13,2] 庄(队0)守住升3 → 整场结束队0胜', r4.over === true && r4.winner === 0 && r4.levels[0] === 16, r4);
  const r5 = E.advanceMatch([14, 2], 0, { declHeld: true, up: 1 }, null, [14, 14]);
  ok('[14,2] A上守住升1 → 结束', r5.over === true, r5);
}

/* ===== 必打关卡 ===== */
{
  const G = [2, 5, 10, 13];
  eq('clampAtGate(3,6)', E.clampAtGate(3, 6, G), 5);
  eq('clampAtGate(3,5)', E.clampAtGate(3, 5, G), 5);
  eq('clampAtGate(5,8)', E.clampAtGate(5, 8, G), 8);
  eq('clampAtGate(4,12)', E.clampAtGate(4, 12, G), 5);
  eq('关卡关闭 不拦', E.clampAtGate(3, 6, []), 6);
  /* 队1坐庄打2,队0抢150分,played=[-1,-1] → 队0停在2、只换庄、下局队0坐庄 */
  const a = E.advanceMatch([2, 2], 1, { declHeld: false, up: 1 }, G, [-1, -1]);
  ok('关卡2:队0上台但没打过 → 停在2', a.levels[0] === 2 && a.dealer % 2 === 0, a);
  const b = E.advanceMatch([2, 2], 1, { declHeld: false, up: 1 }, G, [2, -1]);
  ok('played=[2,-1] → 队0升到3', b.levels[0] === 3, b);
  const c = E.advanceMatch([3, 2], 1, { declHeld: false, up: 1 }, G, [-1, -1]);
  ok('非关卡级3 → 照常升到4', c.levels[0] === 4, c);
  const d = E.advanceMatch([2, 5], 1, { declHeld: true, up: 1 }, G, [-1, -1]);
  ok('庄家方在关卡5守住 → 不卡自己且记 played', d.levels[1] === 6 && d.played[1] === 5, d);
  const e = E.advanceMatch([2, 10], 1, { declHeld: false, up: 0 }, G, [-1, -1]);
  ok('庄家方在关卡10丢庄 → 不记 played', e.played[1] === -1, e);
  const e2 = E.advanceMatch([10, 10], 1, { declHeld: false, up: 1 }, G, [-1, -1]);
  ok('双方都仍卡在10', e2.levels[0] === 10 && e2.played[1] === -1, e2);
}

/* ===== 速通模式 ===== */
{
  const S = { speedRun: true, speedLadder: [2, 5, 10, 13, 14] };
  const a = E.advanceMatch([2, 2], 0, { declHeld: true, up: 4 }, null, [2, 2], S);
  eq('速通 打2赢4级 → 5', a.levels[0], 5);
  const b = E.advanceMatch([5, 2], 0, { declHeld: true, up: 1 }, null, [5, 5], S);
  eq('速通 5赢1级 → 10', b.levels[0], 10);
  const c = E.advanceMatch([10, 2], 0, { declHeld: true, up: 3 }, null, [10, 10], S);
  eq('速通 10赢3级 → K', c.levels[0], 13);
  const d = E.advanceMatch([13, 2], 0, { declHeld: true, up: 2 }, null, [13, 13], S);
  eq('速通 K赢2级 → A', d.levels[0], 14);
  const e = E.advanceMatch([14, 2], 0, { declHeld: true, up: 1 }, null, [14, 14], S);
  ok('速通 A上再赢 → 结束', e.over === true, e);
  const f = E.advanceMatch([5, 2], 0, { declHeld: false, up: 0 }, null, [5, 5], S);
  eq('速通 没升级 原地不动', f.levels[1], 2);
}

/* ===== 定庄(在 dev/game.js 的 resolveDealer 里,这里直接测语义) ===== */
function resolveDealer(dealerKnown, dealer, lastDeclSeat, firstTaker) {
  if (dealerKnown) return dealer;
  return lastDeclSeat >= 0 ? lastDeclSeat : firstTaker;
}
eq('庄定局,亮主者3 → 庄仍是1', resolveDealer(true, 1, 3, 0), 1);
eq('庄定局,王对造反者2 → 庄仍是1', resolveDealer(true, 1, 2, 0), 1);
eq('庄定局,无人亮主 → 庄不变', resolveDealer(true, 1, -1, 0), 1);
eq('无庄局,最终亮主者3 → 3坐庄', resolveDealer(false, -1, 3, 2), 3);
eq('无庄局,无人亮主,先拿牌者2 → 2坐庄', resolveDealer(false, -1, -1, 2), 2);

/* ===== 输出 ===== */
console.log('S5 自测:通过 ' + pass + ' / 失败 ' + fail);
if (fail) { fails.forEach(function (f) { console.log('  ✗ ' + f); }); process.exitCode = 1; }
else console.log('  ✓ 全部通过');
