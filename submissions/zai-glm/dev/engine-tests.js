/* §S5 一致性自测向量。跑法:node dev/engine-tests.js */
'use strict';
const E = require('../engine.js');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

const C = (suit, rank, id) => ({ suit, rank, id });
// id 无关紧要(测试里保证唯一即可)
let nid = 0;
const c = (s, r) => C(s, r, nid++);
const SJ = () => C('X', 15, nid++); // 小王
const BJ = () => C('X', 16, nid++); // 大王
const P = (s, r) => [C(s, r, nid++), C(s, r, nid++)];

const T = { suit: 'S', rank: 2 };   // 主♠打2
const NT = { suit: null, rank: 2 }; // 无主打2

/* ===== 牌序与主牌归属 ===== */
eq(E.effSuit(c('H', 2), T), 'T', 'effSuit(♥2,T)');
eq(E.effSuit(c('S', 9), T), 'T', 'effSuit(♠9,T)');
eq(E.effSuit(BJ(), T), 'T', 'effSuit(大王,T)');
eq(E.effSuit(c('H', 9), T), 'H', 'effSuit(♥9,T)');
{
  const ord = [BJ().id, SJ().id, c('S', 2).id, c('H', 2).id, c('S', 14).id].map((id, i) => [id, i]);
  const cards = [BJ(), SJ(), c('S', 2), c('H', 2), c('S', 14)];
  const o = cards.map(x => E.ordIdx(x, T));
  ok(o[0] > o[1] && o[1] > o[2] && o[2] > o[3] && o[3] > o[4], `ordIdx 排序 大王>小王>♠2>♥2>♠A (got ${o})`);
}
eq(E.effSuit(c('H', 2), NT), 'T', 'effSuit(♥2,NT)');
eq(E.effSuit(c('S', 14), NT), 'S', 'effSuit(♠A,NT)');
ok(E.ordIdx(SJ(), NT) > E.ordIdx(c('H', 2), NT), 'ordIdx(小王,NT) > ordIdx(♥2,NT)');

/* ===== 牌型 ===== */
eq(E.classify([c('H', 5)], T) && E.classify([c('H', 5)], T).type, 'single', '[♥5] single');
eq(E.classify(P('H', 5), T).type, 'pair', '[♥5♥5] pair');
eq(E.classify([c('H', 5), c('D', 5)], T), null, '[♥5,♦5] 混门 null');
eq(E.classify(P('H', 5).concat(P('H', 6)), T).type, 'tractor', 'P(H,5)+P(H,6) 打2 tractor');
eq(E.classify(P('H', 6).concat(P('H', 8)), { suit: 'H', rank: 7 }).type, 'tractor', 'P(H,6)+P(H,8) 打7 tractor');
eq(E.classify(P('H', 6).concat(P('H', 8)), T).type, 'throw', 'P(H,6)+P(H,8) 打2 throw');
eq(E.classify(P('S', 14).concat(P('H', 2)), T).type, 'tractor', 'P(S,A)+P(H,2) T tractor(11→12)');
eq(E.classify(P('H', 2).concat(P('S', 2)), T).type, 'tractor', 'P(H,2)+P(S,2) T tractor(12→13)');
eq(E.classify(P('S', 2).concat([SJ(), SJ()]), T).type, 'tractor', 'P(S,2)+P(小王) T tractor(13→14)');
eq(E.classify([SJ(), SJ(), BJ(), BJ()], T).type, 'tractor', 'P(小王)+P(大王) T tractor(14→15)');
eq(E.classify(P('H', 2).concat(P('D', 2)), T).type, 'throw', 'P(H,2)+P(D,2) T throw(同级不相邻)');
eq(E.classify(P('S', 14).concat(P('S', 2)), T).type, 'throw', 'P(S,A)+P(S,2) T throw(11→13)');
eq(E.classify(P('H', 2).concat([SJ(), SJ()]), NT).type, 'tractor', 'P(H,2)+P(小王) NT tractor');
eq(E.classify(P('H', 2).concat(P('D', 2)), NT).type, 'throw', 'P(H,2)+P(D,2) NT throw');
{
  const cl = E.classify(P('H', 14).concat([c('H', 13)]), T);
  eq(cl.type, 'throw', 'P(H,A)+[♥K] T throw');
}

/* ===== 跟牌义务 ===== */
function lf(hand, chosen, leadCards, trump, opts) {
  const lead = E.classify(leadCards, trump);
  return E.isLegalFollow(hand, lead, chosen, trump, opts);
}
{
  const h = [c('H', 9), c('H', 9), c('H', 3), c('D', 4), c('S', 5)];
  ok(!lf(h, [h[2], h[0]], P('H', 10), T), '♥3+♥9 非法(门内有对必对)');
  ok(lf(h, [h[0], h[1]], P('H', 10), T), '♥9♥9 合法');
}
{
  const h = [c('H', 3), c('H', 7), c('D', 4)];
  ok(lf(h, [h[0], h[1]], P('H', 10), T), '♥3+♥7 合法(无对拆两单)');
}
{
  const h = [c('H', 3), c('D', 4), c('D', 9)];
  ok(lf(h, [h[0], h[1]], P('H', 10), T), '♥3+♦4 合法(本门只剩一张全出)');
  ok(!lf(h, [h[1], h[2]], P('H', 10), T), '♦4+♦9 非法(藏本门)');
}
{
  const h = [c('D', 4), c('D', 9), c('C', 3)];
  ok(lf(h, [h[0], h[2]], P('H', 10), T), '♦4+♣3 合法(断门任出)');
}
{
  // 领出 ♥10♥10+♥JJ 拖拉机
  const leadC = P('H', 10).concat(P('H', 11));
  const h = P('H', 5).concat(P('H', 6)).concat(P('H', 13)).concat([c('H', 3), c('D', 2)]);
  const hh = h.slice(0, 4).concat(h.slice(4)); // 展平
  ok(!lf(hh, [hh[0], hh[1], hh[4], hh[5]], leadC, T), '♥55+♥KK 非法(有拖拉机必须跟)');
  ok(lf(hh, [hh[0], hh[1], hh[2], hh[3]], leadC, T), '♥55+♥66 合法');
}
{
  // 三连对 55-66-77 拆 55-66 合法,拆 55+77 非法
  const h = P('H', 5).concat(P('H', 6)).concat(P('H', 7));
  const leadC = P('H', 10).concat(P('H', 11));
  ok(E.isLegalFollow(h, E.classify(leadC, T), [h[0], h[1], h[2], h[3]], T), '拆 55-66 合法(子拖拉机)');
  ok(!E.isLegalFollow(h, E.classify(leadC, T), [h[0], h[1], h[4], h[5]], T), '拆 55+77 非法(不相邻)');
}
{
  // 领出三连对、手中最长拖拉机只有二连对(9-10)。本门 4 对,跟 3 个互不相连的对(5/9/K)
  const h = P('H', 5).concat(P('H', 9)).concat(P('H', 10)).concat(P('H', 13));
  const leadC = P('H', 10).concat(P('H', 11)).concat(P('H', 12));
  const lead = E.classify(leadC, T);
  const chosen = [h[0], h[1], h[2], h[3], h[6], h[7]]; // H5H5 + H9H9 + HKK
  ok(!E.isLegalFollow(h, lead, chosen, T), 'partial 开:拆散跟非法');
  ok(E.isLegalFollow(h, lead, chosen, T, { partialTractorFollow: false }), 'partial 关:拆散跟合法');
}

/* ===== 一墩胜负 ===== */
{
  const plays = [
    { seat: 0, cards: [c('H', 5)] },
    { seat: 1, cards: [c('H', 13)] },
    { seat: 2, cards: [c('H', 14)] },
    { seat: 3, cards: [c('H', 7)] },
  ];
  eq(E.resolveTrick(plays, T).winIdx, 2, '♥5/♥K/♥A/♥7 第三家赢');
}
{
  const plays = [
    { seat: 0, cards: [c('H', 14)] },
    { seat: 1, cards: [c('S', 3)] },
    { seat: 2, cards: [c('H', 6)] },
    { seat: 3, cards: [c('H', 7)] },
  ];
  eq(E.resolveTrick(plays, T).winIdx, 1, '♥A/♠3/♥6/♥7 第二家毙');
}
{
  const plays = [
    { seat: 0, cards: P('H', 10) },
    { seat: 1, cards: [c('S', 3), c('S', 4)] },
    { seat: 2, cards: P('H', 4) },
    { seat: 3, cards: [c('H', 6), c('H', 7)] },
  ];
  eq(E.resolveTrick(plays, T).winIdx, 0, '两张散主毙不了对子,领出方赢');
}
{
  const plays = [
    { seat: 0, cards: [c('H', 5)] },
    { seat: 1, cards: [c('S', 14)] },
    { seat: 2, cards: [c('H', 6)] },
    { seat: 3, cards: [c('D', 14)] },
  ];
  eq(E.resolveTrick(plays, NT).winIdx, 2, '无主局外门A是垫牌,第三家♥6赢');
}

/* ===== 甩牌 ===== */
{
  const hands = [[], [c('H', 13)], [], []];
  const cards = P('H', 12).concat([c('H', 11)]);
  const r = E.checkThrow(hands, 0, cards, T);
  ok(!r.ok, '甩♥QQ+♥J 别家有♥K → 失败');
  eq(r.forced.cards.map(x => x.rank), [11], '被迫只出♥J');
}
{
  const hands = [[], [c('H', 12)], [], []];
  const cards = P('H', 14).concat([c('H', 13)]);
  ok(E.checkThrow(hands, 0, cards, T).ok, '甩♥AA+♥K 别家最大♥Q → 成功');
}

/* ===== 亮主 / 加固 / 造反 ===== */
eq(E.declarationOf([c('H', 2)], 2), { suit: 'H', strength: 1 }, 'declarationOf([♥2],2)');
eq(E.declarationOf([SJ(), SJ()], 2), { suit: null, strength: 3 }, 'declarationOf(P(小王),2)');
eq(E.declarationOf([SJ(), BJ()], 2), null, '大小王混对无效');
ok(E.canOverride({ seat: 1, suit: 'S', strength: 2 }, 3, { suit: null, strength: 3 }), '王对可反一对级数牌');
{
  const cur = { seat: 0, suit: 'S', strength: 1 };
  ok(!E.canOverride(cur, 0, { suit: 'H', strength: 2 }), '不能反自己(改亮♥对)');
  ok(!E.canOverride(cur, 0, { suit: null, strength: 3 }), '不能反自己(小王对)');
  ok(!E.canOverride(cur, 0, { suit: null, strength: 4 }), '不能反自己(大王对)');
  ok(E.canOverride(cur, 1, { suit: null, strength: 4 }), '别家用大王对反 → 允许');
}
{
  const cur = { seat: 2, suit: 'H', strength: 1 };
  ok(E.canReinforce(cur, 2, { suit: 'H', strength: 2 }, false), '本人♥单张未造反可加固');
  ok(!E.canReinforce(cur, 2, { suit: 'H', strength: 2 }, true), '已造反不可加固');
  ok(!E.canReinforce(cur, 3, { suit: 'H', strength: 2 }, false), '非亮主者不可加固');
  ok(!E.canReinforce({ seat: 2, suit: 'H', strength: 2 }, 2, { suit: 'H', strength: 2 }, false), '已经是对,不可加固');
}
{
  // 15分且无主牌 → 可造反
  const h = [c('H', 5), c('H', 5), c('H', 5), c('S', 3), c('D', 7), c('C', 9)];
  eq(E.isRebelEligible(h, T, 15, 3).ok, true, '15分无主牌可造反');
  const h2 = [c('S', 2), c('S', 2), c('H', 2), c('D', 3), c('D', 10), c('D', 10), c('H', 10), c('H', 5), c('C', 5), c('C', 10)];
  eq(E.isRebelEligible(h2, T, 15, 3).ok, true, '主3张50分可造反(按主牌)');
  const h3 = [c('S', 2), c('S', 2), c('H', 2), c('D', 2), c('D', 10), c('D', 10), c('H', 5), c('C', 5)];
  eq(E.isRebelEligible(h3, T, 15, 3).ok, false, '主4张20分不可造反');
}

/* ===== 定庄 ===== */
// 庄定局:亮主/造反不换庄 —— 这是 game.js 的职责,这里测引擎侧的 canOverride 已覆盖。
// 无庄局坐庄逻辑同样在 game.js;引擎无状态。用 advanceMatch 的轮庄向量覆盖:

/* ===== 结算 ===== */
const kitty = [c('H', 10), c('D', 13)].concat([c('S', 3), c('S', 4), c('D', 6), c('D', 7), c('C', 8), c('C', 9)]);
eq(E.countPts(kitty), 20, '底牌20分');
eq(E.scoreRound(75, kitty, false, 1).up, 1, '闲家75未赢末墩 → 庄升1');
eq(E.scoreRound(75, kitty, false, 1).defended, true, '75分庄家守住');
{
  const r = E.scoreRound(75, kitty, true, 1);
  eq(r.total, 115, '75+20×2=115');
  eq(r.defended, false, '115 上台');
}
{
  const r = E.scoreRound(35, kitty, true, 2);
  eq(r.total, 115, '35+20×4=115 上台');
}
eq(E.scoreRound(0, kitty, false, 1).up, 3, '0分关光升3');
{
  const r = E.scoreRound(85, kitty, false, 1);
  eq(r.defended, false, '85 上台');
  eq(r.up, 0, '85 上台不升级');
}

/* ===== 整场推进 ===== */
{
  const lv = [2, 2];
  const played = [-1, -1];
  const r = E.advanceMatch(lv, 1, { defended: true, up: 2 }, [2, 5, 10, 13], played);
  eq(lv, [2, 4], '队1升2级到4');
  eq(r.dealer, 3, '对家连庄,下一局庄家3');
}
{
  // 不传 played = 只做第一层(§S3);传了会触发关卡拦截,另有关卡专项向量
  const lv = [2, 2];
  const r = E.advanceMatch(lv, 1, { defended: false, up: 1 }, [2, 5, 10, 13]);
  eq(lv, [3, 2], '队0上台升1级到3');
  eq(r.dealer, 2, '前庄下家做庄');
}
{
  const lv = [2, 2];
  E.advanceMatch(lv, 1, { defended: false, up: 0 }, [2, 5, 10, 13], [-1, -1]);
  eq(lv, [2, 2], '80-119 上台级数不动');
}
{
  const lv = [13, 2];
  const r = E.advanceMatch(lv, 0, { defended: true, up: 3 }, [2, 5, 10, 13], [-1, -1]);
  ok(r.over && r.winnerTeam === 0, '[13,2] 庄家守住升3 → 整场结束,队0胜');
}
{
  const lv = [14, 2];
  const r = E.advanceMatch(lv, 0, { defended: true, up: 1 }, [2, 5, 10, 13], [-1, -1]);
  ok(r.over, '[14,2] A上守住 → 整场结束');
}

/* ===== 必打关卡 ===== */
eq(E.clampAtGate(3, 6, [2, 5, 10, 13]), 5, 'clampAtGate(3,6) 停5');
eq(E.clampAtGate(3, 5, [2, 5, 10, 13]), 5, 'clampAtGate(3,5) 到5');
eq(E.clampAtGate(5, 8, [2, 5, 10, 13]), 8, 'clampAtGate(5,8) 到8');
eq(E.clampAtGate(4, 12, [2, 5, 10, 13]), 5, 'clampAtGate(4,12) 停5');
eq(E.clampAtGate(4, 12, []), 12, '关卡关闭不拦');
{
  // 队1坐庄打2,队0抢150分(up=1? 150→floor(70/40)=1... 用 up 表示)
  const lv = [2, 2];
  const played = [-1, -1];
  const r = E.advanceMatch(lv, 1, { defended: false, up: 1 }, [2, 5, 10, 13], played);
  eq(lv, [2, 2], 'played=[-1,-1] 队0停在2不升级');
  eq(r.dealer, 2, '只换庄,队0坐庄');
}
{
  const lv = [2, 2];
  const played = [2, -1];
  E.advanceMatch(lv, 1, { defended: false, up: 1 }, [2, 5, 10, 13], played);
  eq(lv, [3, 2], 'played=[2,-1] 队0升到3');
}
{
  const lv = [3, 3];
  E.advanceMatch(lv, 1, { defended: false, up: 1 }, [2, 5, 10, 13], [-1, -1]);
  eq(lv, [4, 3], '非关卡级数照常升到4');
}
{
  // 庄家方在关卡级守住 → 不卡自己,记进 played
  const lv = [5, 3];
  const played = [-1, -1];
  E.advanceMatch(lv, 0, { defended: true, up: 2 }, [2, 5, 10, 13], played);
  eq(played[0], 5, '守住记 played');
  eq(lv, [7, 3], '关卡上守住不卡自己,升到7');
}
{
  // 庄家方在关卡 10 丢庄 → 不记 played
  const lv = [10, 10];
  const played = [-1, -1];
  E.advanceMatch(lv, 0, { defended: false, up: 1 }, [2, 5, 10, 13], played);
  eq(played, [-1, -1], '丢庄不记 played');
  eq(lv[1], 10, '队1也仍卡在10');
}

/* ===== 速通模式 ===== */
{
  const ladder = [2, 5, 10, 13, 14];
  let lv = [2, 2];
  E.advanceMatch(lv, 0, { defended: true, up: 4 }, [], [-1, -1], ladder);
  eq(lv, [5, 2], '速通:打2赢4级到5');
  E.advanceMatch(lv, 0, { defended: true, up: 1 }, [], [-1, -1], ladder);
  eq(lv, [10, 2], '速通:5赢1级到10');
  E.advanceMatch(lv, 0, { defended: true, up: 3 }, [], [-1, -1], ladder);
  eq(lv, [13, 2], '速通:10赢3级到K');
  E.advanceMatch(lv, 0, { defended: true, up: 2 }, [], [-1, -1], ladder);
  eq(lv, [14, 2], '速通:K赢2级到A');
  const r = E.advanceMatch(lv, 0, { defended: true, up: 1 }, [], [-1, -1], ladder);
  ok(r.over && r.winnerTeam === 0, '速通:A上再赢整场结束');
  let lv2 = [5, 2];
  E.advanceMatch(lv2, 0, { defended: false, up: 0 }, [], [-1, -1], ladder);
  eq(lv2, [5, 2], '速通:没升级原地不动');
}

console.log(`S5 自测:通过 ${pass} / 失败 ${fail}`);
if (fail === 0) console.log('  ✓ 全部通过');
process.exit(fail === 0 ? 0 : 1);
