/* engine.js —— 照 RULES.md §S3 实现的规则引擎。
 * 纯函数,无外部依赖,不使用任何 node 内置模块。
 * 每个导出函数都对应 §S3 里的一条伪码,函数名与规则书一致。
 */
'use strict';

/* ---------- S1 数据模型 ---------- */

const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_ORDER = { S: 3, H: 2, C: 1, D: 0 };   // 切牌花色序 §S4

function cardPoints(c) {
  if (c.rank === 5) return 5;
  if (c.rank === 10 || c.rank === 13) return 10;
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
    for (let s = 0; s < 4; s++) {
      for (let r = 2; r <= 14; r++) deck.push({ suit: SUITS[s], rank: r, id: id++ });
    }
    deck.push({ suit: 'X', rank: 15, id: id++ });
    deck.push({ suit: 'X', rank: 16, id: id++ });
  }
  return deck;
}

/* ---------- ① effSuit ---------- */

function effSuit(c, trump) {
  if (c.suit === 'X') return 'T';
  if (c.rank === trump.rank) return 'T';
  if (trump.suit && c.suit === trump.suit) return 'T';
  return c.suit;
}

/* ---------- ② ordIdx ---------- */

function ordIdx(c, trump) {
  if (c.rank === 16) return 15;
  if (c.rank === 15) return 14;
  if (c.rank === trump.rank) {
    if (trump.suit === null) return 13;
    return c.suit === trump.suit ? 13 : 12;
  }
  return c.rank < trump.rank ? c.rank - 2 : c.rank - 3;
}

/* ---------- ③ decompose ---------- */

function runToComp(run) {
  if (run.length === 1) {
    return { type: 'pair', cards: run[0].cards.slice(), top: run[0].top };
  }
  const cards = [];
  for (let i = 0; i < run.length; i++) { cards.push(run[i].cards[0], run[i].cards[1]); }
  return { type: 'tractor', len: run.length, cards, top: run[run.length - 1].top };
}

function decompose(cards, trump) {
  const groups = new Map();
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const k = c.suit + '/' + c.rank;
    let g = groups.get(k);
    if (!g) { g = []; groups.set(k, g); }
    g.push(c);
  }
  const pairs = [];
  const singles = [];
  groups.forEach(function (g) {
    let i = 0;
    while (i + 1 < g.length) {
      pairs.push({ cards: [g[i], g[i + 1]], top: ordIdx(g[i], trump) });
      i += 2;
    }
    if (i < g.length) singles.push({ type: 'single', cards: [g[i]], top: ordIdx(g[i], trump) });
  });
  pairs.sort(function (a, b) { return a.top - b.top; });
  const comps = [];
  let run = [];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    if (run.length === 0 || p.top - run[run.length - 1].top === 1) run.push(p);
    else { comps.push(runToComp(run)); run = [p]; }
  }
  if (run.length) comps.push(runToComp(run));
  for (let i = 0; i < singles.length; i++) comps.push(singles[i]);
  return comps;
}

/* ---------- ④ classify ---------- */

function classify(cards, trump) {
  if (!cards || cards.length === 0) return null;
  const s = effSuit(cards[0], trump);
  for (let i = 1; i < cards.length; i++) if (effSuit(cards[i], trump) !== s) return null;
  if (cards.length === 1) {
    return { type: 'single', suit: s, top: ordIdx(cards[0], trump), cards: cards.slice() };
  }
  const comps = decompose(cards, trump);
  if (comps.length === 1) {
    const c = comps[0];
    return { type: c.type, suit: s, top: c.top, cards: cards.slice(), len: c.len, comps: comps };
  }
  let top = -1;
  for (let i = 0; i < comps.length; i++) if (comps[i].top > top) top = comps[i].top;
  return { type: 'throw', suit: s, top: top, cards: cards.slice(), comps: comps };
}

/* 结构签名 —— 组件类型的多重集合(§E) */
function compSig(c) { return c.type === 'tractor' ? 'tractor' + c.len : c.type; }

function sigOf(cl) {
  if (!cl) return null;
  if (cl.type !== 'throw') return compSig(cl);
  const a = [];
  for (let i = 0; i < cl.comps.length; i++) a.push(compSig(cl.comps[i]));
  a.sort();
  return a.join(',');
}

/* ---------- ⑤ isLegalFollow ---------- */

function countPairsIn(cards) {
  const m = new Map();
  for (let i = 0; i < cards.length; i++) {
    const k = cards[i].suit + '/' + cards[i].rank;
    m.set(k, (m.get(k) || 0) + 1);
  }
  let n = 0;
  m.forEach(function (v) { n += Math.floor(v / 2); });
  return n;
}

function needPairs(lead) {
  if (lead.type === 'pair') return 1;
  if (lead.type === 'tractor') return lead.len;
  if (lead.type === 'throw') {
    let n = 0;
    for (let i = 0; i < lead.comps.length; i++) {
      const c = lead.comps[i];
      n += c.type === 'pair' ? 1 : (c.type === 'tractor' ? c.len : 0);
    }
    return n;
  }
  return 0;
}

function longestTractor(cards, trump) {
  const comps = decompose(cards, trump);
  let m = 0;
  for (let i = 0; i < comps.length; i++) {
    if (comps[i].type === 'tractor' && comps[i].len > m) m = comps[i].len;
  }
  return m;
}

function filterSuit(cards, suit, trump) {
  const out = [];
  for (let i = 0; i < cards.length; i++) if (effSuit(cards[i], trump) === suit) out.push(cards[i]);
  return out;
}

const DEFAULT_OPTS = { strictTractorFollow: true, partialTractorFollow: true };

function isLegalFollow(hand, lead, chosen, trump, opts) {
  const o = opts || DEFAULT_OPTS;
  const strict = o.strictTractorFollow !== false;
  const partial = strict && o.partialTractorFollow !== false;

  if (!chosen || chosen.length !== lead.cards.length) return false;

  const handIds = new Set();
  for (let i = 0; i < hand.length; i++) handIds.add(hand[i].id);
  const seen = new Set();
  for (let i = 0; i < chosen.length; i++) {
    const id = chosen[i].id;
    if (seen.has(id)) return false;
    seen.add(id);
    if (!handIds.has(id)) return false;
  }

  const suitInHand = filterSuit(hand, lead.suit, trump);
  const chosenInSuit = filterSuit(chosen, lead.suit, trump);
  if (chosenInSuit.length !== Math.min(lead.cards.length, suitInHand.length)) return false;

  const need = needPairs(lead);
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

/* ---------- ⑥ resolveTrick ---------- */

function resolveTrick(plays, trump) {
  const lead = classify(plays[0].cards, trump);
  const leadSig = sigOf(lead);
  let best = lead;
  let winIdx = 0;
  for (let i = 1; i < plays.length; i++) {
    const cl = classify(plays[i].cards, trump);
    if (!cl) continue;
    if (sigOf(cl) !== leadSig) continue;
    if (cl.suit === best.suit) {
      if (cl.top > best.top) { best = cl; winIdx = i; }
    } else if (cl.suit === 'T') {
      best = cl; winIdx = i;
    }
  }
  let points = 0;
  for (let i = 0; i < plays.length; i++) points += countPoints(plays[i].cards);
  return { winIdx: winIdx, winner: plays[winIdx].seat, points: points, lead: lead };
}

/* ---------- ⑦ checkThrow ---------- */

function canBeatComp(sc, comp, trump) {
  if (comp.type === 'single') {
    for (let i = 0; i < sc.length; i++) if (ordIdx(sc[i], trump) > comp.top) return true;
    return false;
  }
  const comps = decompose(sc, trump);
  if (comp.type === 'pair') {
    for (let i = 0; i < comps.length; i++) {
      const c = comps[i];
      if ((c.type === 'pair' || c.type === 'tractor') && c.top > comp.top) return true;
    }
    return false;
  }
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    if (c.type === 'tractor' && c.len >= comp.len && c.top > comp.top) return true;
  }
  return false;
}

function smallestComp(comps) {
  let best = comps[0];
  for (let i = 1; i < comps.length; i++) if (comps[i].top < best.top) best = comps[i];
  return best;
}

function checkThrow(hands, seat, cards, trump) {
  const lead = classify(cards, trump);
  if (!lead || lead.type !== 'throw') return { ok: true };
  for (let ci = 0; ci < lead.comps.length; ci++) {
    const comp = lead.comps[ci];
    for (let p = 0; p < 4; p++) {
      if (p === seat) continue;
      const sc = filterSuit(hands[p], lead.suit, trump);
      if (canBeatComp(sc, comp, trump)) {
        return { ok: false, forced: smallestComp(lead.comps) };
      }
    }
  }
  return { ok: true };
}

/* ---------- ⑧ 结算与推进 ---------- */

function scoreRound(defPoints, kitty, defWonLastTrick, lastLeadSize) {
  const mult = 2 * lastLeadSize;
  const kittyPts = countPoints(kitty);
  const total = defPoints + (defWonLastTrick ? kittyPts * mult : 0);
  if (total < 80) {
    return { total: total, declHeld: true, up: (total === 0 ? 3 : total < 40 ? 2 : 1) };
  }
  return { total: total, declHeld: false, up: Math.floor((total - 80) / 40) };
}

function clampAtGate(from, to, gates) {
  if (to <= from) return to;
  if (!gates || gates.length === 0) return to;
  let hit = -1;
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    if (g > from && g < to && (hit === -1 || g < hit)) hit = g;
  }
  return hit === -1 ? to : hit;
}

/* levels/played 会被就地修改的副本返回;调用方保存 played */
function advanceMatch(levels, declSeat, sc, gates, played, ruleOpts) {
  const o = ruleOpts || {};
  const L = [levels[0], levels[1]];
  const P = played ? [played[0], played[1]] : null;
  const declTeam = declSeat % 2;

  if (sc.declHeld && P) {
    if (L[declTeam] > P[declTeam]) P[declTeam] = L[declTeam];
  }

  let team, dealer;
  if (sc.declHeld) { team = declTeam; dealer = (declSeat + 2) % 4; }
  else { team = 1 - declTeam; dealer = (declSeat + 1) % 4; }
  const up = sc.up;

  if (o.speedRun) {
    if (up > 0) {
      const ladder = o.speedLadder || [2, 5, 10, 13, 14];
      let nxt = -1;
      for (let i = 0; i < ladder.length; i++) if (ladder[i] > L[team]) { nxt = ladder[i]; break; }
      L[team] = nxt === -1 ? L[team] + 1 : nxt;
    }
  } else {
    let level = clampAtGate(L[team], L[team] + up, gates);
    if (up > 0 && gates && gates.indexOf(L[team]) !== -1 && P && P[team] < L[team]) {
      level = L[team];
    }
    L[team] = level;
  }

  const over = L[0] > 14 || L[1] > 14;
  return { levels: L, played: P, dealer: dealer, over: over, winner: over ? (L[0] > 14 ? 0 : 1) : -1 };
}

/* ---------- F 亮主链 ---------- */

function declarationOf(cards, rank) {
  if (!cards) return null;
  if (cards.length === 1) {
    const c = cards[0];
    if (c.suit !== 'X' && c.rank === rank) return { suit: c.suit, strength: 1 };
    return null;
  }
  if (cards.length === 2) {
    const a = cards[0], b = cards[1];
    if (a.suit !== b.suit || a.rank !== b.rank) return null;
    if (a.rank === 15) return { suit: null, strength: 3 };
    if (a.rank === 16) return { suit: null, strength: 4 };
    if (a.suit !== 'X' && a.rank === rank) return { suit: a.suit, strength: 2 };
    return null;
  }
  return null;
}

/* 别家想压过 cur */
function canOverride(cur, next) {
  if (!cur) return true;
  if (next.seat === cur.seat) return false;    // 不能反自己
  return next.strength > cur.strength;
}

/* 加固:自己亮的单张升成同花色的一对,且尚未有人用王对造反 */
function canReinforce(cur, next, rebelHappened) {
  if (!cur) return false;
  if (rebelHappened) return false;
  if (next.seat !== cur.seat) return false;
  if (cur.strength !== 1) return false;
  if (next.strength !== 2) return false;
  return next.suit === cur.suit;
}

/* 是否允许这一次亮主(含加固) */
function declAllowed(cur, next, rebelHappened) {
  if (!cur) return true;
  if (canReinforce(cur, next, rebelHappened)) return true;
  return canOverride(cur, next);
}

/* ---------- F 完全造反 ---------- */

function canFullRebel(hand, trump, opts) {
  const o = opts || {};
  const pts = o.pointRebelThreshold === undefined ? 15 : o.pointRebelThreshold;
  const nt = o.trumpRebelThreshold === undefined ? 3 : o.trumpRebelThreshold;
  const p = countPoints(hand);
  let t = 0;
  for (let i = 0; i < hand.length; i++) if (effSuit(hand[i], trump) === 'T') t++;
  const byPts = pts > 0 && p <= pts;
  const byTrump = nt >= 0 && t <= nt;
  return { ok: byPts || byTrump, pts: p, nT: t, byPts: byPts, byTrump: byTrump };
}

/* ---------- 切牌定先 ---------- */

function cutValue(c) {
  if (c.rank === 16) return 1000;
  if (c.rank === 15) return 999;
  return c.rank * 4 + SUIT_ORDER[c.suit];
}

module.exports = {
  SUITS, SUIT_ORDER, cardPoints, countPoints, makeDeck,
  effSuit, ordIdx, decompose, classify, sigOf, compSig,
  countPairsIn, needPairs, longestTractor, filterSuit, isLegalFollow,
  resolveTrick, canBeatComp, checkThrow, smallestComp,
  scoreRound, clampAtGate, advanceMatch,
  declarationOf, canOverride, canReinforce, declAllowed, canFullRebel, cutValue,
};
