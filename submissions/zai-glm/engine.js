/* 规则引擎 —— 严格照 RULES.md §S3 实现。
 * 只用 JS 内建。每个函数名与规则书 S3 的判定一一对应。 */
'use strict';

const SUITS = ['S', 'H', 'D', 'C'];

function makeDeck() {
  const deck = [];
  let id = 0;
  for (const s of SUITS)
    for (let r = 2; r <= 14; r++) {
      deck.push({ suit: s, rank: r, id: id++ });
      deck.push({ suit: s, rank: r, id: id++ });
    }
  deck.push({ suit: 'X', rank: 15, id: id++ }); // 小王 ×2
  deck.push({ suit: 'X', rank: 15, id: id++ });
  deck.push({ suit: 'X', rank: 16, id: id++ }); // 大王 ×2
  deck.push({ suit: 'X', rank: 16, id: id++ });
  return deck;
}

function cardPts(c) {
  if (c.rank === 5) return 5;
  if (c.rank === 10 || c.rank === 13) return 10;
  return 0;
}
function countPts(cards) {
  let p = 0;
  for (const c of cards) p += cardPts(c);
  return p;
}

/* ① 有效花色：这张牌实际算哪门（主牌一律 'T'） */
function effSuit(c, trump) {
  if (c.suit === 'X') return 'T';
  if (c.rank === trump.rank) return 'T';
  if (trump.suit && c.suit === trump.suit) return 'T';
  return c.suit;
}

/* ② 牌序：只在同一门内可比 */
function ordIdx(c, trump) {
  if (c.rank === 16) return 15;
  if (c.rank === 15) return 14;
  if (c.rank === trump.rank) {
    if (trump.suit === null) return 13;
    return c.suit === trump.suit ? 13 : 12;
  }
  // 2..14 去掉级数,剩 12 档,0..11
  let i = 0;
  for (let r = 2; r <= 14; r++) {
    if (r === trump.rank) continue;
    if (r === c.rank) return i;
    i++;
  }
  return -1; // 不可达
}

/* ③ 拆解：一手同门牌拆成组件。分组键是 (suit,rank) —— 同花同点才算一对。 */
function decompose(cards, trump) {
  const groups = new Map();
  for (const c of cards) {
    const k = c.suit + c.rank;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const singles = [];
  const pairs = [];
  for (const g of groups.values()) {
    if (g.length >= 2) {
      pairs.push({ type: 'pair', cards: [g[0], g[1]], top: ordIdx(g[0], trump) });
      for (let i = 2; i < g.length; i++) singles.push(g[i]);
    } else {
      singles.push(g[0]);
    }
  }
  pairs.sort((a, b) => a.top - b.top);
  const comps = [];
  let run = [];
  const flush = () => {
    if (run.length >= 2) {
      comps.push({
        type: 'tractor', len: run.length,
        cards: run.reduce((a, p) => a.concat(p.cards), []),
        top: run[run.length - 1].top,
      });
    } else if (run.length === 1) comps.push(run[0]);
    run = [];
  };
  for (const p of pairs) {
    if (run.length && p.top - run[run.length - 1].top === 1) run.push(p);
    else { flush(); run.push(p); }
  }
  flush();
  for (const s of singles) comps.push({ type: 'single', cards: [s], top: ordIdx(s, trump) });
  comps.sort((a, b) => b.top - a.top);
  return comps;
}

/* 结构签名：组件类型多重集（resolveTrick 用它判「结构一样」） */
function structSig(comps) {
  const m = {};
  for (const c of comps) {
    const k = c.type === 'tractor' ? 'tractor' + c.len : c.type;
    m[k] = (m[k] || 0) + 1;
  }
  return Object.keys(m).sort().map(k => k + ':' + m[k]).join(',');
}

/* ④ 分类 */
function classify(cards, trump) {
  if (!cards || cards.length === 0) return null;
  const s = effSuit(cards[0], trump);
  for (const c of cards) if (effSuit(c, trump) !== s) return null;
  const comps = decompose(cards, trump);
  if (comps.length === 1) {
    const c0 = comps[0];
    return { type: c0.type, suit: s, top: c0.top, cards: cards.slice(), len: c0.len, comps: [c0] };
  }
  let top = -1;
  for (const c of comps) if (c.top > top) top = c.top;
  return { type: 'throw', suit: s, top, cards: cards.slice(), comps };
}

/* countPairsIn：⌊同(suit,rank)张数/2⌋ 之和，不看是否相邻 */
function countPairsIn(cards) {
  const g = new Map();
  for (const c of cards) {
    const k = c.suit + c.rank;
    g.set(k, (g.get(k) || 0) + 1);
  }
  let n = 0;
  for (const v of g.values()) n += (v / 2) | 0;
  return n;
}

function maxTractorLen(cards, trump) {
  let m = 0;
  for (const c of decompose(cards, trump))
    if (c.type === 'tractor' && c.len > m) m = c.len;
  return m;
}

/* ⑤ 跟牌合法（opts: {strictTractorFollow=true, partialTractorFollow=true}） */
function isLegalFollow(hand, lead, chosen, trump, opts) {
  opts = opts || {};
  const strict = opts.strictTractorFollow !== false;
  const partial = opts.partialTractorFollow !== false;
  if (!chosen || chosen.length !== lead.cards.length) return false;
  const seen = new Set();
  for (const c of chosen) {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
  }
  const handIds = new Set(hand.map(c => c.id));
  for (const c of chosen) if (!handIds.has(c.id)) return false;

  const suitInHand = hand.filter(c => effSuit(c, trump) === lead.suit);
  const chosenInSuit = chosen.filter(c => effSuit(c, trump) === lead.suit);
  if (chosenInSuit.length !== Math.min(lead.cards.length, suitInHand.length)) return false;

  let need = 0;
  if (lead.type === 'pair') need = 1;
  else if (lead.type === 'tractor') need = lead.len;
  else if (lead.type === 'throw') for (const c of lead.comps) need += c.type === 'tractor' ? c.len : 1;
  if (need > 0) {
    const must = Math.min(need, countPairsIn(suitInHand));
    if (countPairsIn(chosenInSuit) < must) return false;
  }
  if (strict && lead.type === 'tractor') {
    const m = maxTractorLen(suitInHand, trump);
    const cm = maxTractorLen(chosenInSuit, trump);
    if (m >= lead.len && cm < lead.len) return false;
    if (partial && m >= 2 && m < lead.len && cm < m) return false;
  }
  return true;
}

/* ⑥ 一墩胜负：返回赢家在 plays 里的下标 */
function resolveTrick(plays, trump) {
  const lead = classify(plays[0].cards, trump);
  const sig = structSig(lead.comps);
  let best = lead, winIdx = 0;
  for (let i = 1; i < plays.length; i++) {
    const cl = classify(plays[i].cards, trump);
    if (!cl || structSig(cl.comps) !== sig) continue;
    if (cl.suit === best.suit) { if (cl.top > best.top) { best = cl; winIdx = i; } }
    else if (cl.suit === 'T') { best = cl; winIdx = i; }
  }
  let pts = 0;
  for (const p of plays) pts += countPts(p.cards);
  return { winIdx, winner: plays[winIdx].seat, pts, lead };
}

/* ⑦ 甩牌校验 */
function canBeatComp(suitCards, comp, trump) {
  if (!suitCards || suitCards.length === 0) return false;
  if (comp.type === 'single') {
    const t = comp.top;
    for (const c of suitCards) if (ordIdx(c, trump) > t) return true;
    return false;
  }
  const comps = decompose(suitCards, trump);
  if (comp.type === 'pair') {
    for (const c of comps) {
      if (c.type === 'pair' || c.type === 'tractor') {
        // tractor 里任意一段对子都可用
        if (c.top > comp.top) return true;
      }
    }
    return false;
  }
  // tractor
  for (const c of comps)
    if (c.type === 'tractor' && c.len >= comp.len && c.top > comp.top) return true;
  return false;
}

function checkThrow(hands, seat, cards, trump) {
  const lead = classify(cards, trump);
  if (lead.type !== 'throw') return { ok: true };
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

/* ⑧ 结算与推进 */
function scoreRound(defPoints, kitty, defWonLastTrick, lastLeadSize) {
  const mult = 2 * lastLeadSize;
  const total = defPoints + (defWonLastTrick ? countPts(kitty) * mult : 0);
  let res;
  if (total < 80) {
    res = { defended: true, up: total === 0 ? 3 : total < 40 ? 2 : 1, total };
  } else {
    res = { defended: false, up: Math.floor((total - 80) / 40), total };
  }
  return res;
}

function clampAtGate(from, to, gates) {
  if (to <= from) return to;
  let hit = null;
  for (const g of gates || []) if (g > from && g < to && (hit === null || g < hit)) hit = g;
  return hit !== null ? hit : to;
}

/* advanceMatch:levels/declSeat/played 会被原地改;返回 {over, winnerTeam, dealer} */
function advanceMatch(levels, declSeat, sc, gates, played, speedLadder) {
  const declTeam = declSeat % 2;
  let team, dealer, up;
  if (sc.defended) {
    team = declTeam;
    dealer = (declSeat + 2) % 4;
    up = sc.up;
    if (played) played[declTeam] = Math.max(played[declTeam], levels[declTeam]); // 先记账
  } else {
    team = 1 - declTeam;
    dealer = (declSeat + 1) % 4;
    up = sc.up;
  }
  if (up > 0) {
    if (speedLadder) {
      let nxt = null;
      for (const g of speedLadder) if (g > levels[team]) { nxt = g; break; }
      levels[team] = nxt !== null ? nxt : levels[team] + 1;
    } else {
      const onGate = (gates || []).indexOf(levels[team]) >= 0;
      if (onGate && played && played[team] < levels[team]) {
        // 站在关卡上、这一关没坐庄守住过:只换庄不升级
      } else {
        levels[team] = clampAtGate(levels[team], levels[team] + up, gates);
      }
    }
  }
  const over = levels[0] > 14 || levels[1] > 14;
  const winnerTeam = over ? (levels[0] > 14 ? 0 : 1) : -1;
  return { over, winnerTeam, dealer };
}

/* ===== 亮主辅助 ===== */

/* declarationOf:手里这组牌能构成的亮主选项;trumpRank 是「我队的级数」 */
function declarationOf(cards, trumpRank) {
  if (!cards || cards.length === 0) return null;
  if (cards.length === 1) {
    const c = cards[0];
    if (c.suit !== 'X' && c.rank === trumpRank) return { suit: c.suit, strength: 1 };
    return null;
  }
  if (cards.length === 2) {
    if (cards[0].suit === 'X' && cards[1].suit === 'X' && cards[0].rank === cards[1].rank) {
      return { suit: null, strength: cards[0].rank === 15 ? 3 : 4 };
    }
    if (cards[0].suit === cards[1].suit && cards[0].suit !== 'X' &&
        cards[0].rank === cards[1].rank && cards[0].rank === trumpRank) {
      return { suit: cards[0].suit, strength: 2 };
    }
  }
  return null;
}

/* canOverride:新亮主要压过当前声明。不能反自己。 */
function canOverride(curDecl, seat, opts) {
  if (!curDecl) return true;
  if (curDecl.seat === seat) return false;
  return opts.strength > curDecl.strength;
}

/* canReinforce:加固 —— 亮主者本人、同花色、单张→对、未发生王对造反 */
function canReinforce(curDecl, seat, opts, rebelHappened) {
  if (!curDecl || rebelHappened) return false;
  if (curDecl.seat !== seat) return false;
  if (curDecl.strength !== 1) return false;
  return opts.strength === 2 && opts.suit === curDecl.suit;
}

/* isRebelEligible:手牌太差可造反 */
function isRebelEligible(hand, trump, ptsThresh, trumpThresh) {
  if (ptsThresh > 0 && countPts(hand) <= ptsThresh) return { ok: true, pts: true };
  if (trumpThresh >= 0) {
    let n = 0;
    for (const c of hand) if (effSuit(c, trump) === 'T') n++;
    if (n <= trumpThresh) return { ok: true, byTrump: true };
  }
  return { ok: false };
}

/* 规则书洞(RULES.md §S3 ⑤):领出为甩牌、跟牌方本门对子数超过 ⌊领出张数/2⌋ 时,
 * 伪码义务不可能满足 —— 不存在合法跟牌。这里给出两个工具:
 *   followSpecImpossible: 判定该局面是否「按伪码无解」
 *   isLegalFollowRelaxed: 把对子义务按 k/2 封顶后的合法性(最接近义务的一手) */
function followSpecImpossible(hand, lead, trump) {
  const S = hand.filter(c => effSuit(c, trump) === lead.suit);
  const k = Math.min(lead.cards.length, S.length);
  let need = 0;
  if (lead.type === 'pair') need = 1;
  else if (lead.type === 'tractor') need = lead.len;
  else if (lead.type === 'throw') for (const c of lead.comps) need += c.type === 'tractor' ? c.len : 1;
  return Math.min(need, countPairsIn(S)) > (k / 2) | 0;
}
function isLegalFollowRelaxed(hand, lead, chosen, trump) {
  // 与 isLegalFollow 相同,仅 mustP 封顶到 ⌊k/2⌋
  if (!chosen || chosen.length !== lead.cards.length) return false;
  const seen = new Set();
  for (const c of chosen) {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
  }
  const handIds = new Set(hand.map(c => c.id));
  for (const c of chosen) if (!handIds.has(c.id)) return false;
  const S = hand.filter(c => effSuit(c, trump) === lead.suit);
  const chosenInSuit = chosen.filter(c => effSuit(c, trump) === lead.suit);
  if (chosenInSuit.length !== Math.min(lead.cards.length, S.length)) return false;
  let need = 0;
  if (lead.type === 'pair') need = 1;
  else if (lead.type === 'tractor') need = lead.len;
  else if (lead.type === 'throw') for (const c of lead.comps) need += c.type === 'tractor' ? c.len : 1;
  if (need > 0) {
    const must = Math.min(need, countPairsIn(S), (chosenInSuit.length / 2) | 0);
    if (countPairsIn(chosenInSuit) < must) return false;
  }
  return true;
}

module.exports = {
  SUITS, makeDeck, cardPts, countPts, effSuit, ordIdx, decompose, classify,
  structSig, countPairsIn, maxTractorLen, isLegalFollow, resolveTrick,
  canBeatComp, checkThrow, scoreRound, clampAtGate, advanceMatch,
  declarationOf, canOverride, canReinforce, isRebelEligible,
  followSpecImpossible, isLegalFollowRelaxed,
};
