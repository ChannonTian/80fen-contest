/* engine2.js —— deepseek-v4-pro 第二赛季规则引擎。
 * 照 80fen-contest/RULES.md(2026-09-07 版,§S3 八个判定)从零实现。
 * 签名与官方裁判引擎对齐(方便对拍),但与官方实现互不共享代码。
 * trump = {suit:'S'|'H'|'D'|'C'|null, rank};suit===null 即无主局。
 * 纯函数,不碰全局可变状态,不抛异常。
 */
'use strict';

const RULES = {
  levelStart: 2,
  handSize: 25,
  kittySize: 8,
  kittyMultiplier: (lastLeadSize) => 2 * (lastLeadSize || 1),
  offsuitRankTractor: true,
  strictTractorFollow: true,
  partialTractorFollow: true,
  pointRebelThreshold: 15,
  trumpRebelThreshold: 3,
  maxRedeal: 3,
  speedRun: false,
  speedLadder: [2, 5, 10, 13, 14],
};

const SUITS = ['S', 'H', 'D', 'C'];

/* ---------------- 牌堆与发牌 ---------------- */

function makeDeck() {
  const cards = []; let id = 0;
  for (let copy = 0; copy < 2; copy++) {
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) cards.push({ suit: SUITS[s], rank: r, id: id++ });
    cards.push({ suit: 'X', rank: 15, id: id++ });
    cards.push({ suit: 'X', rank: 16, id: id++ });
  }
  return cards;
}

function cardPoints(c) { return c.rank === 5 ? 5 : (c.rank === 10 || c.rank === 13 ? 10 : 0); }
function countPoints(cards) { let a = 0; for (let i = 0; i < cards.length; i++) a += cardPoints(cards[i]); return a; }

/* 确定性随机(开发工具与裁判兜底用,策略层不依赖) */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function cutForFirst(seed) {
  const deck = shuffle(makeDeck(), rng(seed * 7 + 3));
  const cuts = [0, 1, 2, 3].map(s => deck[s]);
  const sv = { S: 3, H: 2, C: 1, D: 0, X: 4 };
  let first = 0;
  for (let s = 1; s < 4; s++) {
    const a = cuts[s], b = cuts[first];
    if (a.rank > b.rank || (a.rank === b.rank && sv[a.suit] > sv[b.suit])) first = s;
  }
  return { cuts, first };
}

function dealRound(seed, firstTaker = 0) {
  const deck = shuffle(makeDeck(), rng(seed));
  const hands = [[], [], [], []];
  for (let i = 0; i < 100; i++) hands[(firstTaker + i) % 4].push(deck[i]);
  return { hands, kitty: deck.slice(100), deck };
}

/* ---------------- 主牌与大小序 ---------------- */

function effSuit(c, trump) {
  if (c.suit === 'X' || c.rank === trump.rank) return 'T';
  if (trump.suit && c.suit === trump.suit) return 'T';
  return c.suit;
}

function natOrder(trumpRank) {
  const r = [];
  for (let x = 2; x <= 14; x++) if (x !== trumpRank) r.push(x);
  return r;
}

/* 有主:0..11 主花色散牌,12 副常主,13 正级牌,14 小王,15 大王。无主:13 常主,14,15。 */
function ordIdx(c, trump) {
  if (c.rank === 16) return 15;
  if (c.rank === 15) return 14;
  if (c.rank === trump.rank) {
    if (!trump.suit) return 13;
    return c.suit === trump.suit ? 13 : 12;
  }
  return natOrder(trump.rank).indexOf(c.rank);
}

/* ---------------- 牌型判定 ---------------- */

function pairKey(c) { return c.suit + ':' + c.rank; }

/* §S3 ③ 分层拆解:同序号的多对按层分开,每层内 ordIdx 严格递增扫链。
 * 只影响「同序号对子 + 相邻对子」同时存在的手牌(0.0033% 的跟牌义务)。 */
function decompose(cards, trump) {
  const by = {};
  for (let i = 0; i < cards.length; i++) {
    const k = pairKey(cards[i]);
    (by[k] = by[k] || []).push(cards[i]);
  }
  const pairs = [], singles = [];
  for (const k in by) {
    const arr = by[k];
    if (arr.length >= 2) pairs.push([arr[0], arr[1]]);
    if (arr.length % 2 === 1) singles.push(arr[arr.length - 1]);
  }
  pairs.sort((a, b) => ordIdx(a[0], trump) - ordIdx(b[0], trump));
  const comps = []; let run = [];
  const flush = () => {
    if (!run.length) return;
    if (run.length >= 2) comps.push({ type: 'tractor', len: run.length, cards: run.flat(), top: ordIdx(run[run.length - 1][0], trump) });
    else comps.push({ type: 'pair', cards: run[0], top: ordIdx(run[0][0], trump) });
    run = [];
  };
  const layer = [];
  for (let i = 0; i < pairs.length; i++)
    layer.push(i && ordIdx(pairs[i - 1][0], trump) === ordIdx(pairs[i][0], trump) ? layer[i - 1] + 1 : 0);
  const nLayer = layer.length ? Math.max(...layer) + 1 : 0;
  for (let L = 0; L < nLayer; L++) {
    for (let i = 0; i < pairs.length; i++) {
      if (layer[i] !== L) continue;
      const p = pairs[i];
      if (run.length && ordIdx(p[0], trump) === ordIdx(run[run.length - 1][0], trump) + 1) run.push(p);
      else { flush(); run = [p]; }
    }
    flush();
  }
  for (let i = 0; i < singles.length; i++) {
    const s = singles[i];
    comps.push({ type: 'single', cards: [s], top: ordIdx(s, trump) });
  }
  return comps;
}

function classify(cards, trump) {
  if (!cards || !cards.length) return null;
  const es = effSuit(cards[0], trump);
  for (let i = 1; i < cards.length; i++) if (effSuit(cards[i], trump) !== es) return null;
  if (cards.length === 1) return { type: 'single', suit: es, top: ordIdx(cards[0], trump), cards };
  const comps = decompose(cards, trump);
  if (comps.length === 1) { const c = comps[0]; return { type: c.type, len: c.len, suit: es, top: c.top, cards }; }
  return { type: 'throw', suit: es, cards, comps, top: Math.max(...comps.map(c => c.top)) };
}

/* ---------------- 跟牌合法性与一墩胜负 ---------------- */

function countPairsIn(cards) {
  const by = {};
  for (let i = 0; i < cards.length; i++) { const k = pairKey(cards[i]); by[k] = (by[k] || 0) + 1; }
  let a = 0;
  for (const k in by) a += Math.floor(by[k] / 2);
  return a;
}

function maxTractorLen(cards, trump) {
  let m = 0;
  const comps = decompose(cards, trump);
  for (let i = 0; i < comps.length; i++) if (comps[i].type === 'tractor' && comps[i].len > m) m = comps[i].len;
  return m;
}

function pairsInLead(lead) {
  if (lead.type === 'pair') return 1;
  if (lead.type === 'tractor') return lead.len;
  if (lead.type === 'throw') return lead.comps.reduce((a, c) => a + (c.type === 'pair' ? 1 : c.type === 'tractor' ? c.len : 0), 0);
  return 0;
}

function isLegalFollow(hand, lead, chosen, trump) {
  const n = lead.cards.length;
  if (!chosen || chosen.length !== n) return false;
  const ids = new Set(); const seen = new Set();
  for (let i = 0; i < hand.length; i++) ids.add(hand[i].id);
  for (let i = 0; i < chosen.length; i++) {
    if (!ids.has(chosen[i].id) || seen.has(chosen[i].id)) return false;
    seen.add(chosen[i].id);
  }
  const suitInHand = hand.filter(c => effSuit(c, trump) === lead.suit);
  const chosenInSuit = chosen.filter(c => effSuit(c, trump) === lead.suit);
  if (chosenInSuit.length !== Math.min(n, suitInHand.length)) return false;
  const need = pairsInLead(lead);
  if (need > 0) {
    const must = Math.min(need, countPairsIn(suitInHand));
    if (countPairsIn(chosenInSuit) < must) return false;
  }
  if (RULES.strictTractorFollow && lead.type === 'tractor') {
    const m = maxTractorLen(suitInHand, trump);
    const cm = maxTractorLen(chosenInSuit, trump);
    if (m >= lead.len && cm < lead.len) return false;
    if (RULES.partialTractorFollow && m >= 2 && m < lead.len && cm < m) return false;
  }
  return true;
}

function structSig(comps) { return comps.map(c => c.type + (c.len || '')).sort().join(','); }
function structMatches(cand, lead) {
  const a = cand.type === 'throw' ? cand.comps : [cand];
  const b = lead.type === 'throw' ? lead.comps : [lead];
  return structSig(a) === structSig(b);
}

function resolveTrick(plays, trump) {
  const lead = classify(plays[0].cards, trump);
  let winIdx = 0, best = lead;
  for (let i = 1; i < plays.length; i++) {
    const cl = classify(plays[i].cards, trump);
    if (!cl || !structMatches(cl, lead)) continue;
    if (cl.suit === best.suit) { if (cl.top > best.top) { winIdx = i; best = cl; } }
    else if (cl.suit === 'T') { winIdx = i; best = cl; }
  }
  return { winner: plays[winIdx].seat, points: countPoints(plays.flatMap(p => p.cards)), winningPlay: best };
}

/* ---------------- 甩牌 ---------------- */

function canBeatComp(suitCards, comp, trump) {
  if (comp.type === 'single') return suitCards.some(c => ordIdx(c, trump) > comp.top);
  const comps = decompose(suitCards, trump);
  if (comp.type === 'pair') return comps.some(c => (c.type === 'pair' || c.type === 'tractor') && c.top > comp.top);
  return comps.some(c => c.type === 'tractor' && c.len >= comp.len && c.top > comp.top);
}

function checkThrow(hands, seat, cards, trump) {
  const lead = classify(cards, trump);
  if (!lead || lead.type !== 'throw') return { ok: true };
  for (const comp of lead.comps) {
    for (let p = 0; p < 4; p++) {
      if (p === seat) continue;
      const sc = hands[p].filter(c => effSuit(c, trump) === lead.suit);
      if (canBeatComp(sc, comp, trump)) {
        const lowest = lead.comps.reduce((a, c) => c.top < a.top ? c : a);
        return { ok: false, forced: lowest.cards };
      }
    }
  }
  return { ok: true };
}

/* ---------------- 亮主/反主/造反/加固 ---------------- */

function declarationOf(cards, trumpRank) {
  if (cards.length === 1 && cards[0].rank === trumpRank) return { suit: cards[0].suit, strength: 1 };
  if (cards.length === 2 && pairKey(cards[0]) === pairKey(cards[1])) {
    if (cards[0].rank === trumpRank) return { suit: cards[0].suit, strength: 2 };
    if (cards[0].rank === 15) return { suit: null, strength: 3 };
    if (cards[0].rank === 16) return { suit: null, strength: 4 };
  }
  return null;
}

function declOptions(hand, trumpRank) {
  const opts = [];
  for (let i = 0; i < SUITS.length; i++) {
    const s = SUITS[i];
    const n = hand.filter(c => c.suit === s && c.rank === trumpRank).length;
    if (n >= 2) { opts.push({ suit: s, strength: 2 }); opts.push({ suit: s, strength: 1, hasPair: true }); }
    else if (n === 1) opts.push({ suit: s, strength: 1 });
  }
  return opts.sort((a, b) => b.strength - a.strength);
}

function jokerPairOf(hand) {
  let bj = 0, sj = 0;
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].rank === 16) bj++; else if (hand[i].rank === 15) sj++;
  }
  if (bj >= 2) return { suit: null, strength: 4 };
  if (sj >= 2) return { suit: null, strength: 3 };
  return null;
}

function canOverride(cur, next, seat) {
  if (!cur) return true;
  if (next.strength <= cur.strength) return false;
  if (seat !== undefined && cur.seat === seat) return false;
  return true;
}

function canReinforce2(decl, seat, hand, trumpRank, rebelHappened) {
  if (!decl || decl.seat !== seat || decl.strength !== 1 || rebelHappened || decl.suit === null) return false;
  return hand.filter(c => c.suit === decl.suit && c.rank === trumpRank).length >= 2;
}

function dealerAfterDecl({ dealerKnown, dealer, declSeat, firstTaker }) {
  if (dealerKnown) return dealer;
  return declSeat >= 0 ? declSeat : firstTaker;
}

function canFullRebel(hand, trump) {
  const p = RULES.pointRebelThreshold, t = RULES.trumpRebelThreshold;
  const pts = countPoints(hand);
  const nT = hand.filter(c => effSuit(c, trump) === 'T').length;
  const byPts = p > 0 && pts <= p, byTrump = t >= 0 && nT <= t;
  return { ok: byPts || byTrump, pts, nT, byPts, byTrump };
}

/* ---------------- 结算与整场推进 ---------------- */

function scoreRound({ defPoints, kitty, defWonLastTrick, lastLeadSize }) {
  const kittyPts = countPoints(kitty);
  const mult = RULES.kittyMultiplier(lastLeadSize);
  const total = defPoints + (defWonLastTrick ? kittyPts * mult : 0);
  if (total < 80) {
    return { defendersWin: false, total, kittyPts, mult, declarerLevelsUp: total === 0 ? 3 : total < 40 ? 2 : 1 };
  }
  return { defendersWin: true, total, kittyPts, mult, defenderLevelsUp: Math.floor((total - 80) / 40) };
}

function clampAtGate(from, to, gates) {
  if (!gates || !gates.length || to <= from) return { level: to, gate: null };
  const hit = gates.filter(g => g > from && g < to).sort((a, b) => a - b)[0];
  return hit === undefined ? { level: to, gate: null } : { level: hit, gate: hit };
}

function advanceMatch(levels, declSeat, sc, gates, played) {
  const declTeam = declSeat % 2;
  const L = levels.slice();
  const pl = played ? played.slice() : null;
  if (pl && !sc.defendersWin) pl[declTeam] = Math.max(pl[declTeam], L[declTeam]);
  let dealer, up, team;
  if (!sc.defendersWin) { team = declTeam; up = sc.declarerLevelsUp; dealer = (declSeat + 2) % 4; }
  else { team = 1 - declTeam; up = sc.defenderLevelsUp; dealer = (declSeat + 1) % 4; }
  if (RULES.speedRun) {
    const ld = RULES.speedLadder;
    const nx = ld.find(x => x > L[team]);
    L[team] = up > 0 ? (nx === undefined ? L[team] + 1 : nx) : L[team];
    const over = L[0] > 14 || L[1] > 14;
    return { levels: L, dealer, matchOver: over, winnerTeam: over ? (L[0] > 14 ? 0 : 1) : null, gateStopped: null, gateHeld: null, played: pl };
  }
  const c = clampAtGate(L[team], L[team] + up, gates);
  let level = c.level, gateStopped = c.gate, gateHeld = null;
  if (gates && gates.length && pl && up > 0 && gates.includes(L[team]) && pl[team] < L[team]) {
    level = L[team]; gateStopped = null; gateHeld = L[team];
  }
  L[team] = level;
  const matchOver = L[0] > 14 || L[1] > 14;
  return { levels: L, dealer, matchOver, winnerTeam: matchOver ? (L[0] > 14 ? 0 : 1) : null, gateStopped, gateHeld, played: pl };
}

/* ---------------- 兜底走子(裁判替出用;策略层另有生成器) ---------------- */

function removeCard(hand, c) { const i = hand.findIndex(x => x.id === c.id); if (i >= 0) hand.splice(i, 1); }

function pickRandom(arr, k, rand) { return shuffle(arr, rand).slice(0, k); }

function bruteFollow(hand, lead, trump, rand) {
  const n = lead.cards.length;
  for (let t = 0; t < 300; t++) {
    const c = pickRandom(hand, n, rand);
    if (isLegalFollow(hand, lead, c, trump)) return c;
  }
  return hand.slice(0, n);
}

function genFollow(hand, lead, trump, rand) {
  const n = lead.cards.length;
  const inSuit = hand.filter(c => effSuit(c, trump) === lead.suit);
  const rest = hand.filter(c => effSuit(c, trump) !== lead.suit);
  let chosen = [];
  if (inSuit.length <= n) {
    chosen = [...inSuit, ...pickRandom(rest, n - inSuit.length, rand)];
  } else {
    const comps = decompose(inSuit, trump);
    if (RULES.strictTractorFollow && lead.type === 'tractor') {
      const full = comps.find(c => c.type === 'tractor' && c.len >= lead.len);
      if (full) chosen = full.cards.slice(0, lead.len * 2);
      else if (RULES.partialTractorFollow) {
        const part = comps.filter(c => c.type === 'tractor').sort((a, b) => b.len - a.len)[0];
        if (part) chosen = part.cards.slice();
      }
    }
    const targetPairs = Math.min(pairsInLead(lead), countPairsIn(inSuit));
    if (targetPairs > 0) {
      const used = new Set(chosen.map(c => c.id));
      const pairUnits = [];
      comps.forEach(c => {
        if (c.type === 'pair') pairUnits.push(c.cards);
        if (c.type === 'tractor') for (let i = 0; i < c.len; i++) pairUnits.push(c.cards.slice(i * 2, i * 2 + 2));
      });
      let have = Math.floor(chosen.length / 2);
      for (const u of pairUnits) {
        if (have >= targetPairs || chosen.length + 2 > n) break;
        if (u.some(c => used.has(c.id))) continue;
        u.forEach(c => used.add(c.id));
        chosen.push(...u); have++;
      }
    }
    const used2 = new Set(chosen.map(c => c.id));
    chosen.push(...pickRandom(inSuit.filter(c => !used2.has(c.id)), n - chosen.length, rand));
  }
  return isLegalFollow(hand, lead, chosen, trump) ? chosen : bruteFollow(hand, lead, trump, rand);
}

/* ---------------- 额外助手(策略层用,非裁判契约) ---------------- */

/* 手牌里能出的领出候选:各组件 + 安全甩牌扩张 */
function leadComponents(hand, trump) {
  const out = [];
  const bySuit = { T: [], S: [], H: [], D: [], C: [] };
  for (let i = 0; i < hand.length; i++) bySuit[effSuit(hand[i], trump)].push(hand[i]);
  for (const s in bySuit) {
    const comps = decompose(bySuit[s], trump);
    for (const c of comps) out.push(c.cards.slice());
  }
  return out;
}

/* 手牌里某个 effSuit 门的牌 */
function filterSuit(cards, suit, trump) {
  return cards.filter(c => effSuit(c, trump) === suit);
}

module.exports = {
  RULES, SUITS, makeDeck, cardPoints, countPoints, rng, shuffle, cutForFirst, dealRound,
  effSuit, ordIdx, natOrder, pairKey, decompose, classify,
  countPairsIn, maxTractorLen, pairsInLead, structSig, structMatches,
  isLegalFollow, resolveTrick, canBeatComp, checkThrow,
  declarationOf, declOptions, jokerPairOf, canOverride, canReinforce2, dealerAfterDecl, canFullRebel,
  scoreRound, clampAtGate, advanceMatch,
  removeCard, pickRandom, bruteFollow, genFollow,
  leadComponents, filterSuit,
};
