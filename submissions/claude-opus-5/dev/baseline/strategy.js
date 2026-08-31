/* strategy.js —— 决策层。
 * 所有改动都挂在 CONFIG 的开关上,默认值 = 当前 baseline,便于一键回退与 A/B。
 */
'use strict';
const E = require('./engine.js');
const M = require('./moves.js');

const SUITIDX = { S: 0, H: 1, D: 2, C: 3, X: 4 };
const ALLSUITS = ['S', 'H', 'D', 'C'];
function keyOf(c) { return SUITIDX[c.suit] * 17 + c.rank; }

const DEFAULTS = {
  /* 亮主 */
  declMinLen: 5,             // 该花色最少张数(按已发牌折算后)
  declProjNeed: 6.2,         // 折算到 25 张时的主门张数门槛
  declEarlyCards: 5,         // 至少发到几张才考虑亮
  declPairBonus: 1.0,        // 有一对级数牌时门槛放宽
  declLateGrab: true,        // 快发完还没人亮时降门槛抢亮
  reinforce: true,           // 加固
  jokerRebel: true,          // 王对造反成无主
  jokerRebelMinTrumplessScore: 999, // 王对造反的门槛(999=基本不用)
  /* 造反 */
  rebelPts: 10,
  rebelTrump: 2,
  /* 扣底 */
  buryVoidBonus: 8,
  buryPointPenalty: 14,
  buryMaxVoidPoints: 10,
  buryKeepTrump: true,
  /* 出牌 */
  drawTrumpBonus: 12,
  sureWinBonus: 30,
  leadPointRisk: 3,
  pairLeadBonus: 5,
  followWinBase: 100,
  followPartnerDump: 50,
  followPtsWeight: 3.0,
  dumpPtsWeight: 4.0,
  cardCostWeight: 1.0,
};

/* ---------------- 局面分析 ---------------- */

function analyze(view) {
  const trump = view.trump || { suit: null, rank: view.trumpRank };
  const unseen = new Int8Array(85);
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) unseen[s * 17 + r] = 2;
  unseen[4 * 17 + 15] = 2; unseen[4 * 17 + 16] = 2;
  const hand = view.hand;
  for (let i = 0; i < hand.length; i++) unseen[keyOf(hand[i])]--;
  const hist = view.history;
  for (let i = 0; i < hist.length; i++) {
    const cs = hist[i].cards;
    for (let j = 0; j < cs.length; j++) unseen[keyOf(cs[j])]--;
  }
  const bk = view.buriedKnown;
  for (let i = 0; i < bk.length; i++) unseen[keyOf(bk[i])]--;

  /* 断门推断 + 每队已得分 */
  const voids = [{}, {}, {}, {}];
  const teamPts = [0, 0];
  const nTricks = Math.floor(hist.length / 4);
  for (let t = 0; t < nTricks; t++) {
    const plays = [];
    for (let i = 0; i < 4; i++) plays.push(hist[t * 4 + i]);
    const lead = E.classify(plays[0].cards, trump);
    if (!lead) continue;
    for (let i = 1; i < 4; i++) {
      const p = plays[i];
      let inSuit = 0;
      for (let j = 0; j < p.cards.length; j++) if (E.effSuit(p.cards[j], trump) === lead.suit) inSuit++;
      if (inSuit < p.cards.length) voids[p.seat][lead.suit] = true;
    }
    const r = E.resolveTrick(plays, trump);
    teamPts[r.winner % 2] += r.points;
  }
  return { trump: trump, unseen: unseen, voids: voids, teamPts: teamPts, nTricks: nTricks };
}

/* 同门里还没露面、比它大的牌有几张 */
function beatersLeft(a, card, trump) {
  const es = E.effSuit(card, trump);
  const oi = E.ordIdx(card, trump);
  let n = 0;
  const u = a.unseen;
  for (let s = 0; s < 5; s++) {
    const suit = s === 4 ? 'X' : ALLSUITS[s];
    const lo = s === 4 ? 15 : 2, hi = s === 4 ? 16 : 14;
    for (let r = lo; r <= hi; r++) {
      const cnt = u[s * 17 + r];
      if (cnt <= 0) continue;
      const c = { suit: suit, rank: r, id: -1 };
      if (E.effSuit(c, trump) !== es) continue;
      if (E.ordIdx(c, trump) > oi) n += cnt;
    }
  }
  return n;
}

/* 还剩几个能压过 top 的对子 */
function pairBeatersLeft(a, top, es, trump) {
  let n = 0;
  const u = a.unseen;
  for (let s = 0; s < 5; s++) {
    const suit = s === 4 ? 'X' : ALLSUITS[s];
    const lo = s === 4 ? 15 : 2, hi = s === 4 ? 16 : 14;
    for (let r = lo; r <= hi; r++) {
      if (u[s * 17 + r] < 2) continue;
      const c = { suit: suit, rank: r, id: -1 };
      if (E.effSuit(c, trump) !== es) continue;
      if (E.ordIdx(c, trump) > top) n++;
    }
  }
  return n;
}

function unseenInSuit(a, es, trump) {
  let n = 0;
  const u = a.unseen;
  for (let s = 0; s < 5; s++) {
    const suit = s === 4 ? 'X' : ALLSUITS[s];
    const lo = s === 4 ? 15 : 2, hi = s === 4 ? 16 : 14;
    for (let r = lo; r <= hi; r++) {
      const cnt = u[s * 17 + r];
      if (cnt <= 0) continue;
      if (E.effSuit({ suit: suit, rank: r, id: -1 }, trump) === es) n += cnt;
    }
  }
  return n;
}

/* 留牌价值:越高越舍不得出 */
function cardValue(a, c, trump) {
  const es = E.effSuit(c, trump);
  const oi = E.ordIdx(c, trump);
  const b = beatersLeft(a, c, trump);
  let v = b === 0 ? 12 : (b <= 2 ? 7 : Math.max(0, 4 - b * 0.3));
  if (es === 'T') v += 3 + oi * 0.35;
  else v += oi * 0.15;
  v += E.cardPoints(c) * 0.25;
  return v;
}

/* ---------------- 亮主 ---------------- */

function onDeal(cfg, view) {
  const rank = view.trumpRank;
  const hand = view.hand;
  const n = hand.length;
  const cur = view.curDecl;

  const cnt = { S: 0, H: 0, D: 0, C: 0 };
  const rankCnt = { S: 0, H: 0, D: 0, C: 0 };
  let jokers = 0, sj = 0, bj = 0;
  for (let i = 0; i < n; i++) {
    const c = hand[i];
    if (c.suit === 'X') { jokers++; if (c.rank === 15) sj++; else bj++; continue; }
    cnt[c.suit]++;
    if (c.rank === rank) rankCnt[c.suit]++;
  }
  let totalRank = rankCnt.S + rankCnt.H + rankCnt.D + rankCnt.C;

  /* 加固:自己亮的单张升成对 */
  if (cfg.reinforce && cur && cur.seat === view.seat && cur.strength === 1 && !view.rebelHappened) {
    if (cur.suit && rankCnt[cur.suit] >= 2) return { suit: cur.suit, strength: 2 };
  }

  /* 王对造反(默认极保守) */
  if (cfg.jokerRebel && (bj >= 2 || sj >= 2)) {
    const st = bj >= 2 ? 4 : 3;
    if (!cur || (cur.seat !== view.seat && st > cur.strength)) {
      let best = 0;
      for (let i = 0; i < 4; i++) { const s = ALLSUITS[i]; if (cnt[s] > best) best = cnt[s]; }
      const proj = n > 0 ? best * 25 / n : 0;
      if (proj < cfg.jokerRebelMinTrumplessScore) {
        /* 无主局对手牌要求高:级数牌 + 王多才划算 */
        const ntScore = totalRank * 2 + jokers * 2;
        if (ntScore >= 8) return { suit: null, strength: st };
      }
    }
  }

  if (n < cfg.declEarlyCards) return null;

  /* 挑最好的花色 */
  let bestSuit = null, bestScore = -1;
  for (let i = 0; i < 4; i++) {
    const s = ALLSUITS[i];
    if (rankCnt[s] < 1) continue;
    const proj = cnt[s] * 25 / n;
    const score = proj + (rankCnt[s] >= 2 ? cfg.declPairBonus : 0) + jokers * 0.4;
    if (score > bestScore) { bestScore = score; bestSuit = s; }
  }
  if (!bestSuit) return null;

  const strength = rankCnt[bestSuit] >= 2 ? 2 : 1;
  const next = { seat: view.seat, suit: bestSuit, strength: strength };
  if (cur) {
    if (cur.seat === view.seat) return null;
    if (strength <= cur.strength) return null;
  }

  let need = cfg.declProjNeed;
  if (cfg.declLateGrab && n >= 20 && !cur) need -= 1.5;
  if (n >= 24 && !cur) need -= 1.0;
  if (strength === 2) need -= 0.8;
  if (bestScore >= need && cnt[bestSuit] >= Math.min(cfg.declMinLen, n)) return next;
  return null;
}

/* ---------------- 造反 ---------------- */

function onRebel(cfg, view) {
  const r = view.rebelReason || {};
  if (r.nT !== undefined && r.nT <= cfg.rebelTrump) return true;
  if (r.pts !== undefined && r.pts <= cfg.rebelPts) return true;
  return false;
}

/* ---------------- 扣底 ---------------- */

function discard(cfg, view) {
  const trump = view.trump;
  const hand = view.hand;
  const a = analyze(view);
  const groups = M.bySuit(hand, trump);
  const need = 8;

  /* 每张牌的「愿意扣掉」分:越大越想扣 */
  function buryScore(c, suitLen) {
    const es = E.effSuit(c, trump);
    let s = 20 - E.ordIdx(c, trump) * 1.2;
    if (es === 'T') s -= 40;                                  // 主牌尽量不扣
    s -= E.cardPoints(c) * cfg.buryPointPenalty / 10;
    if (beatersLeft(a, c, trump) === 0) s -= 25;               // 光牌不扣
    return s;
  }

  const chosen = [];
  const used = new Set();

  /* 优先做短门(方便毙牌) */
  const cands = [];
  for (let i = 0; i < 4; i++) {
    const s = ALLSUITS[i];
    const cs = groups[s];
    if (cs.length === 0) continue;
    const pts = E.countPoints(cs);
    if (cs.length <= need && pts <= cfg.buryMaxVoidPoints) {
      cands.push({ suit: s, cards: cs, len: cs.length, pts: pts });
    }
  }
  cands.sort(function (x, y) { return (x.len + x.pts * 0.6) - (y.len + y.pts * 0.6); });
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (chosen.length + c.len > need) continue;
    /* 只在这门没有光牌(A)时才整门扣掉 */
    let hasTop = false;
    for (let j = 0; j < c.cards.length; j++) if (beatersLeft(a, c.cards[j], trump) === 0) hasTop = true;
    if (hasTop && c.len > 2) continue;
    for (let j = 0; j < c.cards.length; j++) { chosen.push(c.cards[j]); used.add(c.cards[j].id); }
  }

  const rest = [];
  for (let i = 0; i < hand.length; i++) if (!used.has(hand[i].id)) rest.push(hand[i]);
  const suitLen = {};
  for (let i = 0; i < 4; i++) suitLen[ALLSUITS[i]] = groups[ALLSUITS[i]].length;
  rest.sort(function (x, y) { return buryScore(y, suitLen) - buryScore(x, suitLen); });
  for (let i = 0; i < rest.length && chosen.length < need; i++) chosen.push(rest[i]);
  return chosen.slice(0, need);
}

/* ---------------- 领出 ---------------- */

function structSureWin(a, cl, trump) {
  if (cl.type === 'single') return beatersLeft(a, cl.cards[0], trump) === 0;
  if (cl.type === 'pair') return pairBeatersLeft(a, cl.top, cl.suit, trump) === 0;
  if (cl.type === 'tractor') return pairBeatersLeft(a, cl.top, cl.suit, trump) === 0;
  return false;
}

/* 对手可能毙掉这一门吗 */
function ruffRisk(a, view, es, trump) {
  if (es === 'T') return 0;
  let risk = 0;
  for (let i = 0; i < 4; i++) {
    if (i % 2 === view.myTeam) continue;
    if (a.voids[i][es]) risk += 1;
  }
  const left = unseenInSuit(a, es, trump);
  if (left <= 2) risk += 0.5;
  return risk;
}

function lead(cfg, view) {
  const trump = view.trump;
  const hand = view.hand;
  const a = analyze(view);
  let cands = M.genLeadCandidates(hand, trump);
  const thr = M.genThrowCandidates(hand, trump, 24);
  for (let i = 0; i < thr.length; i++) cands.push(thr[i]);

  const isDecl = view.myTeam === (view.declSeat % 2);
  let myTrumps = 0;
  for (let i = 0; i < hand.length; i++) if (E.effSuit(hand[i], trump) === 'T') myTrumps++;
  const trumpLeft = unseenInSuit(a, 'T', trump);

  let best = null, bestScore = -1e9;
  const seen = new Set();
  for (let i = 0; i < cands.length; i++) {
    const cd = cands[i];
    const key = cd.map(function (c) { return c.id; }).sort(function (x, y) { return x - y; }).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const cl = E.classify(cd, trump);
    if (!cl) continue;
    let sc = 0;
    const pts = E.countPoints(cd);
    const sure = structSureWin(a, cl, trump);
    const risk = ruffRisk(a, view, cl.suit, trump);

    if (sure && risk < 1) sc += cfg.sureWinBonus + cd.length * 3;
    else if (sure) sc += cfg.sureWinBonus * 0.4;
    else sc -= pts * cfg.leadPointRisk;

    if (cl.type === 'pair' || cl.type === 'tractor') sc += cfg.pairLeadBonus * (cd.length / 2);
    if (cl.type === 'throw') sc -= 6;

    if (cl.suit === 'T') {
      if (isDecl && myTrumps >= 8 && trumpLeft > 0 && a.nTricks < 8) sc += cfg.drawTrumpBonus;
      else sc -= 6;
      sc -= cd.length * 1.5;
    }
    let cost = 0;
    for (let j = 0; j < cd.length; j++) cost += cardValue(a, cd[j], trump);
    sc -= cost * cfg.cardCostWeight;
    if (sc > bestScore) { bestScore = sc; best = cd; }
  }
  if (!best) best = M.forceLegalLead(hand, trump);
  return best;
}

/* ---------------- 跟牌 ---------------- */

function follow(cfg, view, plays) {
  const trump = view.trump;
  const hand = view.hand;
  const lead0 = E.classify(plays[0].cards, trump);
  if (!lead0) return M.forceLegalFollow(hand, E.classify(plays[0].cards, trump) || { cards: plays[0].cards, suit: 'T', type: 'single' }, trump, null);
  const a = analyze(view);
  const cands = M.genFollowCandidates(hand, lead0, trump, null, 60);

  const cur = E.resolveTrick(plays, trump);
  const winnerSeat = cur.winner;
  const partnerWinning = (winnerSeat % 2) === view.myTeam && plays.length > 1;
  const isLast = plays.length === 3;
  const ptsOnTable = E.countPoints(plays[0].cards) +
    (plays[1] ? E.countPoints(plays[1].cards) : 0) +
    (plays[2] ? E.countPoints(plays[2].cards) : 0);

  let best = null, bestScore = -1e9;
  for (let i = 0; i < cands.length; i++) {
    const cd = cands[i];
    const test = plays.concat([{ seat: view.seat, cards: cd }]);
    const r = E.resolveTrick(test, trump);
    const iWin = r.winner === view.seat;
    const myPts = E.countPoints(cd);
    let sc = 0;
    if (iWin) {
      sc = cfg.followWinBase + (ptsOnTable + myPts) * cfg.followPtsWeight;
      if (!isLast) sc -= 12;                       // 后面还有人可能压回去
    } else if (partnerWinning) {
      sc = cfg.followPartnerDump + myPts * cfg.dumpPtsWeight;
      if (!isLast) sc -= 10;
    } else {
      sc = 0 - myPts * cfg.dumpPtsWeight;
    }
    let cost = 0;
    for (let j = 0; j < cd.length; j++) cost += cardValue(a, cd[j], trump);
    sc -= cost * cfg.cardCostWeight;
    if (sc > bestScore) { bestScore = sc; best = cd; }
  }
  if (!best || !E.isLegalFollow(hand, lead0, best, trump, null)) {
    best = M.forceLegalFollow(hand, lead0, trump, null);
  }
  return best;
}

/* ---------------- 工厂 ---------------- */

function makeAI(config) {
  const cfg = {};
  for (const k in DEFAULTS) cfg[k] = DEFAULTS[k];
  if (config) for (const k in config) cfg[k] = config[k];
  return {
    name: config && config.name ? config.name : 'claude-opus-5',
    cfg: cfg,
    onDeal: function (view) { try { return onDeal(cfg, view); } catch (e) { return null; } },
    onRebel: function (view) { try { return onRebel(cfg, view); } catch (e) { return false; } },
    discard: function (view) {
      try {
        const d = discard(cfg, view);
        if (d && d.length === 8) return d;
      } catch (e) { }
      const h = view.hand.slice().sort(function (x, y) { return M.junkScore(x, view.trump) - M.junkScore(y, view.trump); });
      return h.slice(0, 8);
    },
    lead: function (view) {
      try {
        const l = lead(cfg, view);
        if (l && l.length && E.classify(l, view.trump)) return l;
      } catch (e) { }
      return M.forceLegalLead(view.hand, view.trump);
    },
    follow: function (view, plays) {
      const lead0 = E.classify(plays[0].cards, view.trump);
      try {
        const f = follow(cfg, view, plays);
        if (f && lead0 && E.isLegalFollow(view.hand, lead0, f, view.trump, null)) return f;
      } catch (e) { }
      return M.forceLegalFollow(view.hand, lead0, view.trump, null);
    },
  };
}

module.exports = { makeAI, DEFAULTS, analyze, beatersLeft, cardValue };
