'use strict';
/* 80分(上海规则)规则引擎 —— 严格照 RULES.md §S3 八个判定实现。
 * 纯 JS:只用语言内建,无 fs/process/网络/npm。裁判环境与本文件行为一致。 */

const SUITS = ['S', 'H', 'D', 'C'];

/* ---------------- 牌堆与分值 ---------------- */

function makeDeck() {
  const cards = [];
  let id = 0;
  for (let d = 0; d < 2; d++) {
    for (const s of SUITS)
      for (let r = 2; r <= 14; r++) cards.push({ suit: s, rank: r, id: id++ });
    cards.push({ suit: 'X', rank: 15, id: id++ });
    cards.push({ suit: 'X', rank: 16, id: id++ });
  }
  return cards; // 108
}

function cardPoints(c) {
  return c.rank === 5 ? 5 : (c.rank === 10 || c.rank === 13 ? 10 : 0);
}

function countPoints(cards) {
  let s = 0;
  for (const c of cards) s += cardPoints(c);
  return s;
}

/* ---------------- §S3 ① effSuit ---------------- */

function effSuit(c, trump) {
  if (c.suit === 'X') return 'T';
  if (c.rank === trump.rank) return 'T';
  if (trump.suit && c.suit === trump.suit) return 'T';
  return c.suit;
}

/* ---------------- §S3 ② ordIdx ---------------- */

function ordIdx(c, trump) {
  if (c.rank === 16) return 15; // 大王
  if (c.rank === 15) return 14; // 小王
  if (c.rank === trump.rank) {
    if (trump.suit === null) return 13; // 无主:四门级数牌同级
    return c.suit === trump.suit ? 13 : 12; // 正级牌 / 副级牌
  }
  // [2..14] 去掉 trump.rank 后的位置,0..11
  return c.rank < trump.rank ? c.rank - 2 : c.rank - 3;
}

/* ---------------- §S3 ③ decompose ---------------- */

function groupBySR(cards) {
  const m = new Map();
  for (const c of cards) {
    const k = c.suit + '|' + c.rank;
    let g = m.get(k);
    if (!g) { g = { suit: c.suit, rank: c.rank, cards: [] }; m.set(k, g); }
    g.cards.push(c);
  }
  return m;
}

function decompose(cards, trump) {
  const groups = groupBySR(cards);
  const pairs = [], singles = [];
  for (const g of groups.values()) {
    const o = ordIdx(g.cards[0], trump);
    const nPairs = (g.cards.length / 2) | 0;
    for (let i = 0; i < nPairs; i++)
      pairs.push({ ord: o, cards: [g.cards[2 * i], g.cards[2 * i + 1]] });
    if (g.cards.length % 2 === 1)
      singles.push({ ord: o, cards: [g.cards[g.cards.length - 1]] });
  }
  pairs.sort((a, b) => a.ord - b.ord);
  const comps = [];
  let i = 0;
  while (i < pairs.length) {
    let j = i;
    while (j + 1 < pairs.length && pairs[j + 1].ord === pairs[j].ord + 1) j++;
    const run = pairs.slice(i, j + 1);
    if (run.length >= 2) {
      const all = [];
      for (const p of run) { all.push(p.cards[0], p.cards[1]); }
      comps.push({ type: 'tractor', len: run.length, cards: all, top: run[run.length - 1].ord });
    } else {
      comps.push({ type: 'pair', cards: run[0].cards, top: run[0].ord });
    }
    i = j + 1;
  }
  for (const s of singles) comps.push({ type: 'single', cards: s.cards, top: s.ord });
  return comps;
}

/* ---------------- §S3 ④ classify ---------------- */

function classify(cards, trump) {
  if (!cards || cards.length === 0) return null;
  const s0 = effSuit(cards[0], trump);
  for (const c of cards) if (effSuit(c, trump) !== s0) return null;
  const comps = decompose(cards, trump);
  if (comps.length === 1) {
    const c0 = comps[0];
    const r = { type: c0.type, suit: s0, top: c0.top, cards, comps };
    if (c0.type === 'tractor') r.len = c0.len;
    return r;
  }
  let top = -1;
  for (const c of comps) if (c.top > top) top = c.top;
  return { type: 'throw', suit: s0, top, cards, comps };
}

/* 结构 = 组件类型多重集(单张 single / 对子 pair / 长度 L 拖拉机 tractorL) */
function structKey(cl) {
  return cl.comps
    .map(c => (c.type === 'tractor' ? 'tractor' + c.len : c.type))
    .sort()
    .join(',');
}

/* 领出里的对子数:pair=1,tractor=len,throw=各组件之和 */
function leadPairCount(cl) {
  let n = 0;
  for (const c of cl.comps) n += c.type === 'tractor' ? c.len : (c.type === 'pair' ? 1 : 0);
  return n;
}

/* countPairsIn: ⌊同花同点张数/2⌋ 之和,不看是否相邻 */
function countPairsIn(cards) {
  const m = groupBySR(cards);
  let n = 0;
  for (const g of m.values()) n += (g.cards.length / 2) | 0;
  return n;
}

/* 最长拖拉机长度(对数);没有拖拉机 → 0 */
function longestTractor(cards, trump) {
  const comps = decompose(cards, trump);
  let m = 0;
  for (const c of comps) if (c.type === 'tractor' && c.len > m) m = c.len;
  return m;
}

/* ---------------- §S3 ⑤ isLegalFollow ---------------- */

const FOLLOW_OPTS = { strictTractorFollow: true, partialTractorFollow: true };

function isLegalFollow(hand, leadCl, chosen, trump, opts) {
  opts = opts || FOLLOW_OPTS;
  const n = leadCl.cards.length;
  if (!chosen || chosen.length !== n) return false;
  const seen = new Set();
  const handIds = new Set();
  for (const c of hand) handIds.add(c.id);
  for (const c of chosen) {
    if (!handIds.has(c.id)) return false;
    if (seen.has(c.id)) return false;
    seen.add(c.id);
  }
  const suitInHand = [], chosenInSuit = [];
  for (const c of hand) if (effSuit(c, trump) === leadCl.suit) suitInHand.push(c);
  for (const c of chosen) if (effSuit(c, trump) === leadCl.suit) chosenInSuit.push(c);
  if (chosenInSuit.length !== Math.min(n, suitInHand.length)) return false;

  const need = leadPairCount(leadCl);
  if (need > 0) {
    const must = Math.min(need, countPairsIn(suitInHand));
    if (countPairsIn(chosenInSuit) < must) return false;
  }
  if (opts.strictTractorFollow && leadCl.type === 'tractor') {
    const m = longestTractor(suitInHand, trump);
    const cm = longestTractor(chosenInSuit, trump);
    if (m >= leadCl.len && cm < leadCl.len) return false;
    if (opts.partialTractorFollow && m >= 2 && m < leadCl.len && cm < m) return false;
  }
  return true;
}

/* ---------------- §S3 ⑥ resolveTrick ---------------- */

function resolveTrick(plays, trump) {
  const lead = classify(plays[0].cards, trump);
  const leadKey = structKey(lead);
  let best = lead, winIdx = 0;
  for (let i = 1; i < plays.length; i++) {
    const cl = classify(plays[i].cards, trump);
    if (!cl) continue;
    if (structKey(cl) !== leadKey) continue;
    if (cl.suit === best.suit) {
      if (cl.top > best.top) { best = cl; winIdx = i; }
    } else if (cl.suit === 'T') {
      best = cl; winIdx = i;
    }
  }
  let points = 0;
  for (const p of plays) points += countPoints(p.cards);
  return { winSeat: plays[winIdx].seat, winIdx, points };
}

/* ---------------- §S3 ⑦ checkThrow ---------------- */

function canBeatComp(sc, comp, trump) {
  if (comp.type === 'single') {
    for (const c of sc) if (ordIdx(c, trump) > comp.top) return true;
    return false;
  }
  const comps = decompose(sc, trump);
  if (comp.type === 'pair') {
    for (const c of comps)
      if ((c.type === 'pair' || c.type === 'tractor') && c.top > comp.top) return true;
    return false;
  }
  // tractor
  for (const c of comps)
    if (c.type === 'tractor' && c.len >= comp.len && c.top > comp.top) return true;
  return false;
}

function checkThrow(hands, seat, cards, trump) {
  const lead = classify(cards, trump);
  if (!lead || lead.type !== 'throw') return { ok: true };
  for (const comp of lead.comps) {
    for (let p = 0; p < hands.length; p++) {
      if (p === seat) continue;
      const sc = hands[p].filter(c => effSuit(c, trump) === lead.suit);
      if (canBeatComp(sc, comp, trump)) {
        let forced = lead.comps[0];
        for (const c of lead.comps) if (c.top < forced.top) forced = c;
        return { ok: false, forced };
      }
    }
  }
  return { ok: true };
}

/* ---------------- §S3 ⑧ 结算与推进 ---------------- */

function scoreFromTotal(total) {
  if (total < 80)
    return { total, dealerHeld: true, up: total === 0 ? 3 : total < 40 ? 2 : 1 };
  return { total, dealerHeld: false, up: Math.floor((total - 80) / 40) };
}

function scoreRound(defPoints, kittyPts, defWonLastTrick, lastLeadSize) {
  const mult = 2 * lastLeadSize;
  const total = defPoints + (defWonLastTrick ? kittyPts * mult : 0);
  return scoreFromTotal(total);
}

function clampAtGate(from, to, gates) {
  if (!gates || gates.length === 0) return to;
  if (to <= from) return to;
  let hit = null;
  for (const g of gates) if (g > from && g < to && (hit === null || g < hit)) hit = g;
  return hit !== null ? hit : to;
}

/* levels/played 传入数组,返回新状态(不改传入的)。
 * speedRun: {on:false} 或 {on:true, ladder:[2,5,10,13,14]};速通时关卡自动失效。 */
function advanceMatch(levels, declSeat, sc, gates, played, speedRun) {
  const L = levels.slice();
  const P = played ? played.slice() : [-1, -1];
  const declTeam = declSeat % 2;
  let team, dealer;
  const up = sc.up;
  if (sc.dealerHeld) {
    P[declTeam] = Math.max(P[declTeam], L[declTeam]); // 先记账再升级
    team = declTeam;
    dealer = (declSeat + 2) % 4;
  } else {
    team = 1 - declTeam;
    dealer = (declSeat + 1) % 4;
  }
  if (speedRun && speedRun.on) {
    if (up > 0) {
      const lad = speedRun.ladder;
      let nxt = null;
      for (const g of lad) if (g > L[team] && (nxt === null || g < nxt)) nxt = g;
      L[team] = nxt !== null ? nxt : L[team] + 1;
    }
  } else {
    let level = clampAtGate(L[team], L[team] + up, gates);
    if (up > 0 && gates && gates.indexOf(L[team]) >= 0 && P[team] < L[team])
      level = L[team]; // 卡在没打过的关卡:只换庄不升级
    L[team] = level;
  }
  const over = L[0] > 14 || L[1] > 14;
  return { levels: L, played: P, dealer, over, team, up };
}

/* ---------------- 亮主链(§F) ---------------- */

/* 从一组牌得到亮主选项;无效返回 null */
function declarationOf(cards, rank) {
  if (!cards || cards.length === 0) return null;
  const ids = new Set(cards.map(c => c.id));
  if (ids.size !== cards.length) return null;
  if (cards.length === 1) {
    const c = cards[0];
    if (c.suit !== 'X' && c.rank === rank) return { suit: c.suit, strength: 1 };
    return null;
  }
  if (cards.length === 2) {
    const [a, b] = cards;
    if (a.suit !== 'X' && a.suit === b.suit && a.rank === rank && b.rank === rank)
      return { suit: a.suit, strength: 2 };
    if (a.rank === 15 && b.rank === 15) return { suit: null, strength: 3 };
    if (a.rank === 16 && b.rank === 16) return { suit: null, strength: 4 };
    return null; // 大小王混对无效
  }
  return null;
}

/* next 能否盖过 cur(seat 是 next 的座位)。不能反自己;加固是唯一例外。 */
function canOverride(cur, next, seat, rebelHappened) {
  if (!cur) return true;
  if (seat === cur.seat) {
    return !rebelHappened && cur.strength === 1 && next.strength === 2 && next.suit === cur.suit;
  }
  return next.strength > cur.strength;
}

/* 加固的前置条件(§F):必须本人亮过单张、且还没人用王对反过。
 * 注:别家物理上不可能持有同花级数对(一张在亮主者手里),所以这条与
 * canOverride 的强度比较在实际对局中不会冲突。 */
function canReinforce(cur, seat, rebelHappened) {
  return !!cur && cur.seat === seat && cur.strength === 1 && !rebelHappened;
}

/* 定主定庄(§S2 ③):返回 {declSeat, trump} */
function settleDeclaration(dealerKnown, dealer, firstTaker, curDecl, levels) {
  if (dealerKnown) {
    return {
      declSeat: dealer,
      trump: { suit: curDecl ? curDecl.suit : null, rank: levels[dealer % 2] },
    };
  }
  if (curDecl)
    return { declSeat: curDecl.seat, trump: { suit: curDecl.suit, rank: levels[curDecl.seat % 2] } };
  return { declSeat: firstTaker, trump: { suit: null, rank: levels[firstTaker % 2] } };
}

function trumpCount(hand, trump) {
  let n = 0;
  for (const c of hand) if (effSuit(c, trump) === 'T') n++;
  return n;
}

/* 完全造反资格(§F):分 ≤ pointRebelThreshold 或主 ≤ trumpRebelThreshold */
function canFullRebel(hand, trump, rules) {
  const pt = rules.pointRebelThreshold, tt = rules.trumpRebelThreshold;
  const pts = countPoints(hand);
  const nT = trumpCount(hand, trump);
  const byPts = pt > 0 && pts <= pt;
  const byTrump = tt >= 0 && nT <= tt;
  return { can: byPts || byTrump, pts, nT, byPts, byTrump };
}

/* ---------------- 构造性合法跟牌(裁判替出 / 策略候选都用) ----------------
 * pref: {high: 取大端, keepPairs: 填充时尽量不散对子(默认 true)} */
function findLegalFollow(hand, leadCl, trump, opts, pref) {
  opts = opts || FOLLOW_OPTS;
  pref = pref || {};
  const keepPairs = pref.keepPairs !== false;
  const n = leadCl.cards.length;
  const suitCards = [], others = [];
  for (const c of hand) (effSuit(c, trump) === leadCl.suit ? suitCards : others).push(c);
  const ord = c => ordIdx(c, trump);
  const suitLenOf = c => (pref.suitLen ? pref.suitLen.get(effSuit(c, trump)) || 0 : 0);
  const isT = c => (effSuit(c, trump) === 'T' ? 1 : 0);
  const cmp = pref.pointFirst
    ? (a, b) => (cardPoints(b) - cardPoints(a)) || (ord(a) - ord(b))
    : pref.giveLowPoints
      ? (a, b) => ((cardPoints(b) > 0 ? 1 : 0) - (cardPoints(a) > 0 ? 1 : 0)) || (ord(a) - ord(b))
      : pref.cheapDump
      ? (a, b) => (cardPoints(a) - cardPoints(b))
        || (pref.trumpLast ? isT(a) - isT(b) : 0)
        || (pref.suitLen ? suitLenOf(a) - suitLenOf(b) : 0)
        || (ord(a) - ord(b))
      : (a, b) => (pref.high ? ord(b) - ord(a) : ord(a) - ord(b));
  suitCards.sort(cmp);
  others.sort(cmp);

  if (suitCards.length <= n) {
    const chosen = suitCards.slice();
    for (const c of others) {
      if (chosen.length === n) break;
      chosen.push(c);
    }
    return chosen;
  }

  const needPairs = leadPairCount(leadCl);
  const mustPairs = Math.min(needPairs, countPairsIn(suitCards));
  let needTractor = 0;
  if (opts.strictTractorFollow && leadCl.type === 'tractor') {
    const m = longestTractor(suitCards, trump);
    if (m >= leadCl.len) needTractor = leadCl.len;
    else if (opts.partialTractorFollow && m >= 2) needTractor = m;
  }

  const groups = [];
  for (const g of groupBySR(suitCards).values())
    groups.push({ ord: ord(g.cards[0]), cards: g.cards, taken: 0 });
  groups.sort(pref.pointFirst
    ? (a, b) => (cardPoints(b.cards[0]) - cardPoints(a.cards[0])) || (a.ord - b.ord)
    : pref.cheapDump
      ? (a, b) => (cardPoints(a.cards[0]) - cardPoints(b.cards[0]))
        || (pref.trumpLast ? isT(a.cards[0]) - isT(b.cards[0]) : 0)
        || (pref.suitLen ? suitLenOf(a.cards[0]) - suitLenOf(b.cards[0]) : 0)
        || (a.ord - b.ord)
      : (a, b) => (pref.high ? b.ord - a.ord : a.ord - b.ord));
  const pairGroups = groups.filter(g => g.cards.length >= 2);

  const chosen = [];
  let pairsTaken = 0;
  const takePair = g => {
    chosen.push(g.cards[0], g.cards[1]);
    g.taken = 2;
    pairsTaken++;
  };

  if (needTractor > 0) {
    const asc = pairGroups.slice().sort((a, b) => a.ord - b.ord);
    let i = 0, seg = null;
    while (i < asc.length) {
      let j = i;
      while (j + 1 < asc.length && asc[j + 1].ord === asc[j].ord + 1) j++;
      if (j - i + 1 >= needTractor) {
        seg = pref.high ? asc.slice(j + 1 - needTractor, j + 1) : asc.slice(i, i + needTractor);
        break;
      }
      i = j + 1;
    }
    for (const g of seg) takePair(g);
  }
  if (pairsTaken < mustPairs) {
    for (const g of pairGroups) {
      if (pairsTaken >= mustPairs) break;
      if (g.taken === 0) takePair(g);
    }
  }
  // 填充剩余张数:默认先填单张(不散对子),再拆对子(先各拆一张,还不够再拆另一半)
  const singleFill = [], pairFill = [], pairSecondFill = [];
  for (const g of groups) {
    if (g.taken > 0) continue;
    if (g.cards.length === 1) { singleFill.push(g.cards[0]); continue; }
    if (keepPairs) { pairFill.push(g.cards[0]); pairSecondFill.push(g.cards[1]); }
    else { singleFill.push(g.cards[0], g.cards[1]); }
  }
  for (const arr of [singleFill, pairFill, pairSecondFill])
    for (const c of arr) {
      if (chosen.length === n) break;
      chosen.push(c);
    }
  return chosen;
}

module.exports = {
  SUITS, makeDeck, cardPoints, countPoints,
  effSuit, ordIdx, decompose, classify, structKey, leadPairCount,
  countPairsIn, longestTractor,
  isLegalFollow, FOLLOW_OPTS, resolveTrick, checkThrow, canBeatComp,
  scoreRound, scoreFromTotal, clampAtGate, advanceMatch,
  declarationOf, canOverride, canReinforce, settleDeclaration, trumpCount, canFullRebel,
  findLegalFollow,
};
