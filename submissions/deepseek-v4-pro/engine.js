'use strict';

/* engine.js —— 80分(上海规则)规则引擎, 逐条对照 RULES.md §S3 的八个判定实现。
 *
 * 只依赖 JS 内建 (Object/Array/Map/Set/Math), 无 fs/process/网络/随机源,
 * 全部纯函数, 不保存任何对局状态。
 *
 * 牌: {suit: 'S'|'H'|'D'|'C'|'X', rank: 2..16, id: 0..107}
 *   rank 11=J 12=Q 13=K 14=A; 王: 15=小王 16=大王; id 全场唯一。
 * 主: trump = {suit, rank}; suit === null 表示无主局, rank 是当局级数。
 */

const SUITS = ['S', 'H', 'D', 'C'];
const CUT_SUIT_ORDER = { S: 3, H: 2, C: 1, D: 0 }; // 切牌同点比花色 ♠>♥>♣>♦

/* ---------- 牌与分值 ---------- */

function cardPoints(c) {
  if (c.rank === 5) return 5;
  if (c.rank === 10 || c.rank === 13) return 10; // K=13
  return 0;
}

function countPoints(cards) {
  let s = 0;
  for (let i = 0; i < cards.length; i++) s += cardPoints(cards[i]);
  return s;
}

function makeDeck() {
  const deck = [];
  let id = 0;
  for (let d = 0; d < 2; d++) {
    for (let si = 0; si < 4; si++) {
      for (let rank = 2; rank <= 14; rank++) {
        deck.push({ suit: SUITS[si], rank, id: id++ });
      }
    }
  }
  for (let i = 0; i < 2; i++) deck.push({ suit: 'X', rank: 15, id: id++ }); // 小王
  for (let i = 0; i < 2; i++) deck.push({ suit: 'X', rank: 16, id: id++ }); // 大王
  return deck;
}

function cardName(c) {
  const rs = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: 'SJ', 16: 'BJ' };
  return (c.suit === 'X' ? '' : c.suit) + (rs[c.rank] || c.rank);
}

/* ---------- ① 有效花色 effSuit ---------- */

function effSuit(c, trump) {
  if (c.suit === 'X') return 'T';                    // 王
  if (c.rank === trump.rank) return 'T';             // 级数牌, 不论花色
  if (trump.suit && c.suit === trump.suit) return 'T';
  return c.suit;
}

/* ---------- ② 牌序 ordIdx ---------- */

function ordIdx(c, trump) {
  if (c.rank === 16) return 15;                      // 大王
  if (c.rank === 15) return 14;                      // 小王
  if (c.rank === trump.rank) {
    if (trump.suit === null) return 13;              // 无主: 四门级数牌同级
    return c.suit === trump.suit ? 13 : 12;          // 正级牌 / 副级牌
  }
  // [2..14] 去掉 trump.rank 后的位置, 0..11
  let idx = c.rank - 2;
  if (c.rank > trump.rank) idx -= 1;
  return idx;
}

/* 切牌比大小: 自然序 (王>A>...>2), 同点 ♠>♥>♣>♦ */
function cutOrder(c) {
  return c.rank * 10 + (CUT_SUIT_ORDER[c.suit] || 0);
}
/* cards: 每人一张 (4 张); 返回最大那张的下标 */
function cutWinner(cards) {
  let bi = 0;
  for (let i = 1; i < cards.length; i++) {
    if (cutOrder(cards[i]) > cutOrder(cards[bi])) bi = i;
  }
  return bi;
}

/* ---------- ③ 拆解 decompose ---------- */

/* 按 (suit,rank) 分组 → 同花同点两张 = 对; 两副牌每组至多 2 张。
 * 对子按 ordIdx 升序扫描, 相邻(差恰为1)接成拖拉机。
 * 输出组件: {type:'single'|'pair'|'tractor', len?, cards, top} */
function decompose(cards, trump) {
  const groups = new Map();
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const k = c.suit + ':' + c.rank;
    let g = groups.get(k);
    if (!g) { g = []; groups.set(k, g); }
    g.push(c);
  }
  const pairs = [];
  const singles = [];
  for (const g of groups.values()) {
    if (g.length >= 2) {
      pairs.push({ suit: g[0].suit, rank: g[0].rank, cards: [g[0], g[1]], ord: ordIdx(g[0], trump) });
      for (let i = 2; i < g.length; i++) singles.push(g[i]); // 防御: 理论上不会出现
    } else {
      singles.push(g[0]);
    }
  }
  pairs.sort((a, b) => a.ord - b.ord);
  const comps = [];
  let run = [];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    if (run.length && p.ord === run[run.length - 1].ord + 1) {
      run.push(p);
    } else {
      if (run.length) flushRun(run, comps);
      run = [p];
    }
  }
  if (run.length) flushRun(run, comps);
  for (let i = 0; i < singles.length; i++) {
    comps.push({ type: 'single', cards: [singles[i]], top: ordIdx(singles[i], trump) });
  }
  return comps;
}

function flushRun(run, comps) {
  if (run.length >= 2) {
    const cards = [];
    for (let i = 0; i < run.length; i++) cards.push(run[i].cards[0], run[i].cards[1]);
    comps.push({ type: 'tractor', len: run.length, cards, top: run[run.length - 1].ord });
  } else {
    comps.push({ type: 'pair', cards: [run[0].cards[0], run[0].cards[1]], top: run[0].ord });
  }
}

/* ---------- ④ 分类 classify ---------- */

/* 输出 {type, suit, top, cards, len?, comps?}; 空或混门 → null */
function classify(cards, trump) {
  if (!cards || cards.length === 0) return null;
  const s = effSuit(cards[0], trump);
  for (let i = 1; i < cards.length; i++) {
    if (effSuit(cards[i], trump) !== s) return null;
  }
  if (cards.length === 1) {
    return { type: 'single', suit: s, cards, top: ordIdx(cards[0], trump) };
  }
  const comps = decompose(cards, trump);
  if (comps.length === 1) {
    const co = comps[0];
    const out = { type: co.type, suit: s, cards, top: co.top };
    if (co.type === 'tractor') out.len = co.len;
    out.comps = comps;
    return out;
  }
  let top = -1;
  for (let i = 0; i < comps.length; i++) if (comps[i].top > top) top = comps[i].top;
  return { type: 'throw', suit: s, cards, top, comps };
}

/* 对子数: 各 (suit,rank) 组 ⌊张数/2⌋ 之和 */
function countPairsIn(cards) {
  const groups = new Map();
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const k = c.suit + ':' + c.rank;
    groups.set(k, (groups.get(k) || 0) + 1);
  }
  let n = 0;
  for (const v of groups.values()) n += (v >> 1);
  return n;
}

/* 最长拖拉机长度 */
function longestTractor(cards, trump) {
  let best = 0;
  const comps = decompose(cards, trump);
  for (let i = 0; i < comps.length; i++) {
    if (comps[i].type === 'tractor' && comps[i].len > best) best = comps[i].len;
  }
  return best;
}

/* ---------- ⑤ 跟牌合法 isLegalFollow ---------- */

/* lead 是领出的 classify 输出。opts: strictTractorFollow / partialTractorFollow, 默认开。 */
function isLegalFollow(hand, lead, chosen, trump, opts) {
  const strict = !opts || opts.strictTractorFollow !== false;
  const partial = !opts || opts.partialTractorFollow !== false;

  if (chosen.length !== lead.cards.length) return false;
  const handIds = new Set();
  for (let i = 0; i < hand.length; i++) handIds.add(hand[i].id);
  const chosenIds = new Set();
  for (let i = 0; i < chosen.length; i++) {
    const c = chosen[i];
    if (!handIds.has(c.id) || chosenIds.has(c.id)) return false;
    chosenIds.add(c.id);
  }
  const suitInHand = [];
  const chosenInSuit = [];
  for (let i = 0; i < hand.length; i++) if (effSuit(hand[i], trump) === lead.suit) suitInHand.push(hand[i]);
  for (let i = 0; i < chosen.length; i++) if (effSuit(chosen[i], trump) === lead.suit) chosenInSuit.push(chosen[i]);
  if (chosenInSuit.length !== Math.min(lead.cards.length, suitInHand.length)) return false;

  let need = 0;
  if (lead.type === 'pair') need = 1;
  else if (lead.type === 'tractor') need = lead.len;
  else if (lead.type === 'throw') {
    for (let i = 0; i < lead.comps.length; i++) {
      const cm = lead.comps[i];
      if (cm.type === 'pair') need += 1;
      else if (cm.type === 'tractor') need += cm.len;
    }
  }
  if (need > 0) {
    const must = Math.min(need, countPairsIn(suitInHand));
    if (countPairsIn(chosenInSuit) < must) return false;
  }
  if (strict && lead.type === 'tractor') {
    const m = longestTractor(suitInHand, trump);
    const cm = longestTractor(chosenInSuit, trump);
    if (m >= lead.len && cm < lead.len) return false;
    if (partial && m >= 2 && m < lead.len && cm < m) return false;
  }
  return true;
}

/* ---------- ⑥ 一墩胜负 resolveTrick ---------- */

/* 结构 = 组件类型多重集 (single=0, pair=1, tractor=len) */
function structOf(cl) {
  if (cl.type === 'single') return [0];
  if (cl.type === 'pair') return [1];
  if (cl.type === 'tractor') return [cl.len];
  const s = [];
  for (let i = 0; i < cl.comps.length; i++) {
    const cm = cl.comps[i];
    s.push(cm.type === 'single' ? 0 : cm.type === 'pair' ? 1 : cm.len);
  }
  s.sort((a, b) => a - b);
  return s;
}
function sameStruct(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* plays: [{seat, cards}] ×4, plays[0] 是领出。返回 {seat, points}。 */
function resolveTrick(plays, trump) {
  const lead = classify(plays[0].cards, trump);
  let best = lead;
  let winIdx = 0;
  if (lead) {
    const leadStruct = structOf(lead);
    for (let i = 1; i < plays.length; i++) {
      const cl = classify(plays[i].cards, trump);
      if (!cl || !sameStruct(structOf(cl), leadStruct)) continue;
      if (cl.suit === best.suit) {
        if (cl.top > best.top) { best = cl; winIdx = i; }
      } else if (cl.suit === 'T') {
        best = cl; winIdx = i;
      }
    }
  }
  let points = 0;
  for (let i = 0; i < plays.length; i++) {
    const cs = plays[i].cards;
    for (let j = 0; j < cs.length; j++) points += cardPoints(cs[j]);
  }
  return { seat: plays[winIdx].seat, winnerIdx: winIdx, points };
}

/* ---------- ⑦ 甩牌校验 checkThrow ---------- */

function canBeatComp(sc, comp, trump) {
  if (comp.type === 'single') {
    for (let i = 0; i < sc.length; i++) {
      if (ordIdx(sc[i], trump) > comp.top) return true;
    }
    return false;
  }
  if (comp.type === 'pair') {
    const comps = decompose(sc, trump);
    for (let i = 0; i < comps.length; i++) {
      const cm = comps[i];
      if ((cm.type === 'pair' || cm.type === 'tractor') && cm.top > comp.top) return true;
    }
    return false;
  }
  const comps = decompose(sc, trump);
  for (let i = 0; i < comps.length; i++) {
    const cm = comps[i];
    if (cm.type === 'tractor' && cm.len >= comp.len && cm.top > comp.top) return true;
  }
  return false;
}

/* hands: 四家当前手牌; 甩牌失败返回 {ok:false, forced} (最小的组件), 否则 {ok:true}。 */
function checkThrow(hands, seat, cards, trump) {
  const lead = classify(cards, trump);
  if (!lead || lead.type !== 'throw') return { ok: true };
  for (let ci = 0; ci < lead.comps.length; ci++) {
    const comp = lead.comps[ci];
    for (let p = 0; p < 4; p++) {
      if (p === seat) continue;
      const sc = [];
      for (let i = 0; i < hands[p].length; i++) {
        if (effSuit(hands[p][i], trump) === lead.suit) sc.push(hands[p][i]);
      }
      if (canBeatComp(sc, comp, trump)) {
        let forced = lead.comps[0];
        for (let i = 1; i < lead.comps.length; i++) {
          if (lead.comps[i].top < forced.top) forced = lead.comps[i];
        }
        return { ok: false, forced };
      }
    }
  }
  return { ok: true };
}

/* ---------- ⑧ 结算与推进 ---------- */

/* 返回 {total, declHeld, up} */
function scoreRound(defPoints, kitty, defWonLastTrick, lastLeadSize) {
  const mult = 2 * lastLeadSize;
  const total = defPoints + (defWonLastTrick ? countPoints(kitty) * mult : 0);
  if (total < 80) {
    return { total, declHeld: true, up: total === 0 ? 3 : total < 40 ? 2 : 1 };
  }
  return { total, declHeld: false, up: Math.floor((total - 80) / 40) };
}

function clampAtGate(from, to, gates) {
  if (to <= from) return to;
  let hit = null;
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    if (g > from && g < to && (hit === null || g < hit)) hit = g;
  }
  return hit === null ? to : hit;
}

/* levels: [l0,l1]; declSeat: 庄家; sc: scoreRound 输出; played: 各队坐庄守住过的最高级数
 * (不传 played = 只做第一层「不可跳级」, 不做关卡卡级判断)。
 * speedLadder: 非空则速通模式 (默认关)。返回 {levels, dealer, over, team, up}。 */
function advanceMatch(levels, declSeat, sc, gates, played, speedLadder) {
  const declTeam = declSeat % 2;
  if (played && sc.declHeld) {
    played[declTeam] = Math.max(played[declTeam], levels[declTeam]); // 先记账再升级
  }
  let team, dealer, up;
  if (sc.declHeld) {
    team = declTeam;
    dealer = (declSeat + 2) % 4;   // 前庄的对家连庄
    up = sc.up;
  } else {
    team = 1 - declTeam;
    dealer = (declSeat + 1) % 4;   // 前庄的下家坐庄
    up = sc.up;
  }
  const newLevels = levels.slice();
  if (up > 0) {
    if (speedLadder && speedLadder.length) {
      let lvl = newLevels[team] + 1;
      for (let i = 0; i < speedLadder.length; i++) {
        if (speedLadder[i] > newLevels[team]) { lvl = speedLadder[i]; break; }
      }
      newLevels[team] = lvl;
    } else {
      let lvl = clampAtGate(newLevels[team], newLevels[team] + up, gates);
      if (played && gates.indexOf(newLevels[team]) >= 0 && played[team] < newLevels[team]) {
        lvl = newLevels[team];      // 卡在这一关: 只换庄不升级
      }
      newLevels[team] = lvl;
    }
  }
  const over = newLevels[0] > 14 || newLevels[1] > 14;
  return { levels: newLevels, dealer, over, team, up };
}

/* ---------- 亮主辅助 ---------- */

/* cards → 亮主选项 {suit, strength} | null
 * strength: 1=单张级数牌 2=一对级数牌 3=小王对 4=大王对(3/4 suit 为 null) */
function declarationOf(cards, rank) {
  if (!cards || cards.length === 0 || cards.length > 2) return null;
  if (cards.length === 2 && cards[0].suit === 'X' && cards[1].suit === 'X') {
    if (cards[0].rank === 15 && cards[1].rank === 15) return { suit: null, strength: 3 };
    if (cards[0].rank === 16 && cards[1].rank === 16) return { suit: null, strength: 4 };
    return null;
  }
  const suit = cards[0].suit;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (c.suit !== suit || c.rank !== rank || c.suit === 'X') return null;
  }
  return { suit, strength: cards.length };
}

/* 亮主合法性 (canOverride):
 * curDecl = {seat,suit,strength} | null; me = 我的座位; opt = {suit,strength}。
 * 返回 {ok, isReinforce}。 */
function canOverride(curDecl, me, opt, rebelHappened) {
  if (!curDecl) return { ok: true, isReinforce: false };
  if (curDecl.seat === me) {
    // 不能反自己; 唯一例外: 加固 (自己的单张 → 一对, 同花色, 未发生造反)
    const isReinforce =
      curDecl.strength === 1 && opt.strength === 2 &&
      opt.suit === curDecl.suit && !rebelHappened;
    return { ok: isReinforce, isReinforce };
  }
  return { ok: opt.strength > curDecl.strength, isReinforce: false };
}

/* 造反资格: hand 手牌, trump 已定。返回 {pts, nT, byPts, byTrump}。 */
function rebelReason(hand, trump, thresholds) {
  const pt = thresholds && thresholds.point !== undefined ? thresholds.point : 15;
  const tr = thresholds && thresholds.trump !== undefined ? thresholds.trump : 3;
  const pts = countPoints(hand);
  let nT = 0;
  for (let i = 0; i < hand.length; i++) if (effSuit(hand[i], trump) === 'T') nT++;
  return { pts, nT, byPts: pts <= pt, byTrump: nT <= tr };
}

module.exports = {
  SUITS,
  makeDeck,
  cardPoints,
  countPoints,
  cardName,
  effSuit,
  ordIdx,
  cutOrder,
  cutWinner,
  decompose,
  classify,
  countPairsIn,
  longestTractor,
  isLegalFollow,
  resolveTrick,
  structOf,
  sameStruct,
  canBeatComp,
  checkThrow,
  scoreRound,
  clampAtGate,
  advanceMatch,
  declarationOf,
  canOverride,
  rebelReason,
};
