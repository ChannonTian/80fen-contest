/* 崩溃面 fuzz。
 *
 * 联赛里抛一次异常就是灾难,而我唯一的防线是五个方法外面的 try/catch。
 * 这个测试专门喂**畸形和极端的 view**,确认:
 *   ① 没有异常逃出来(逃出来 = 裁判那边直接炸)
 *   ② 返回值仍然是合法着法(兜底也得合法,否则只是把崩溃换成罚分)
 *   ③ 冻结的 view 不被改写(README 说 view 和里面每张牌都是冻结的)
 * 注意:兜底次数**不要求**为 0 —— 这些输入本来就是非法的,能兜住就算过。
 */
'use strict';
const S = require('../strategy.js'); const E = require('../engine.js');
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const SUITS = ['S', 'H', 'D', 'C'];
function card(id) {
  if (rnd() < 0.06) return Object.freeze({ suit: 'X', rank: 15 + (rnd() < 0.5 ? 0 : 1), id: id });
  return Object.freeze({ suit: SUITS[Math.floor(rnd() * 4) % 4], rank: 2 + Math.floor(rnd() * 13) % 13, id: id });
}
function deepFreeze(v) {
  Object.freeze(v);
  for (const k of Object.keys(v)) {
    const x = v[k];
    if (x && typeof x === 'object' && !Object.isFrozen(x)) deepFreeze(x);
  }
  return v;
}
function mkHand(n) { const h = []; for (let i = 0; i < n; i++) h.push(card(i)); return h; }

let calls = 0, escaped = 0, illegal = 0, mutated = 0;
const fbTot = { deal: 0, rebel: 0, discard: 0, lead: 0, follow: 0, hard: 0 };
const cases = [];
/* 各种畸形/极端形状 */
const sizes = [0, 1, 2, 3, 8, 25, 33];
for (const n of sizes) {
  for (let t = 0; t < 120; t++) {
    const hand = mkHand(n);
    const trumpRank = 2 + Math.floor(rnd() * 13) % 13;
    const tr = rnd() < 0.25 ? null : SUITS[Math.floor(rnd() * 4) % 4];   // null = 无主局
    const histLen = Math.floor(rnd() * 12) % 12;
    const history = [];
    for (let i = 0; i < histLen; i++) {
      history.push(Object.freeze({ seat: i % 4, cards: Object.freeze([card(200 + i)]) }));
    }
    cases.push({
      hand: hand, trumpRank: trumpRank,
      trump: Object.freeze({ suit: tr, rank: trumpRank }),
      history: history, buriedKnown: rnd() < 0.5 ? [] : mkHand(8),
      seat: Math.floor(rnd() * 4) % 4, myTeam: Math.floor(rnd() * 2) % 2,
      declSeat: Math.floor(rnd() * 4) % 4, kittySize: 8,
      curDecl: rnd() < 0.5 ? null : Object.freeze({ seat: 0, suit: 'S', strength: 1 }),
      levels: Object.freeze([2, 2]), played: Object.freeze([false, false]),
    });
  }
}
/* 更脏的一档:重复 id、越界点数、hand 里混进 null。裁判按 README 不会发这种,
 * 但兜底路径本来就是为「没想到的输入」准备的,顺手一起压。 */
for (let t = 0; t < 200; t++) {
  const n = 1 + Math.floor(rnd() * 10) % 10;
  const hand = [];
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.15) hand.push(Object.freeze({ suit: 'S', rank: 5, id: 7 }));        // 重复 id
    else if (rnd() < 0.1) hand.push(Object.freeze({ suit: 'S', rank: 99, id: 300 + i })); // 越界点数
    else if (rnd() < 0.05) hand.push(null);                                            // 空洞
    else hand.push(card(400 + i));
  }
  cases.push({
    hand: hand, trumpRank: 2, trump: Object.freeze({ suit: 'C', rank: 2 }),
    history: [], buriedKnown: [], seat: 0, myTeam: 0, declSeat: 0, kittySize: 8,
    curDecl: null, levels: Object.freeze([2, 2]), played: Object.freeze([false, false]),
  });
}

function snap(v) { return JSON.stringify(v); }
for (const raw of cases) {
  const v = deepFreeze(raw);
  const before = snap(v);
  const ai = S.makeAI();
  for (const m of ['onDeal', 'onRebel', 'discard', 'lead']) {
    calls++;
    try { ai[m](v); } catch (e) { escaped++; if (escaped < 4) console.log('  逃逸 ' + m + ': ' + e.message); }
  }
  /* follow:构造一个领出 */
  if (v.hand.length > 0) {
    const lc = [card(900)];
    const plays = Object.freeze([Object.freeze({ seat: (v.seat + 3) % 4, cards: Object.freeze(lc) })]);
    calls++;
    let r = null;
    try { r = ai.follow(v, plays); } catch (e) { escaped++; if (escaped < 4) console.log('  逃逸 follow: ' + e.message); }
    /* 合法性检查本身也要防畸形手牌 —— 这里的 null 是测试故意塞的,
     * 用它调引擎会崩,但那是测试脚本的问题,不是 AI 的。 */
    if (r && v.hand.every(function (c) { return c && typeof c.rank === 'number' && c.rank <= 16; })) {
      try {
        const lead = E.classify(lc, v.trump);
        if (lead && !E.isLegalFollow(v.hand, lead, r, v.trump, null)) illegal++;
      } catch (e) { /* 手牌本身非法时引擎会拒绝,不算 AI 的问题 */ }
    }
  }
  if (snap(v) !== before) mutated++;
  for (const k of Object.keys(fbTot)) fbTot[k] += ai.fallbacks[k];
}
console.log('畸形 view fuzz:' + cases.length + ' 个 view / ' + calls + ' 次调用');
console.log('  异常逃出 try/catch : ' + escaped + (escaped ? ' ✗' : ' ✓'));
console.log('  跟牌返回非法着法   : ' + illegal + (illegal ? ' ✗' : ' ✓'));
console.log('  改写了冻结的 view  : ' + mutated + (mutated ? ' ✗' : ' ✓'));
console.log('  走到兜底的次数     : ' + JSON.stringify(fbTot) +
  '  (这些输入本来就非法,兜住即可;逃逸 0 说明 try/catch 真的接得住)');
