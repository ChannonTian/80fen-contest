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
  declProjNeed: 11,         // 折算到 25 张时的主门张数门槛
  declEarlyCards: 5,         // 至少发到几张才考虑亮
  declPairBonus: 1.0,        // 有一对级数牌时门槛放宽
  declLateGrab: true,        // 快发完还没人亮时降门槛抢亮
  reinforce: true,           // 加固
  jokerRebel: true,          // 王对造反成无主
  jokerRebelMinTrumplessScore: 999, // 王对造反的门槛(999=基本不用)
  /* 造反 */
  rebelPts: 99,
  rebelTrump: 99,
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
  /* --- evalV2:基于「本墩期望得分 × 赢的概率」的 EV 模型 --- */
  evalV2: true,
  ptsPerCardLater: 2.0,      // 后手每张牌平均带来的分
  leadWinPts: 3.2,           // 我赢时其余三家每张牌贡献的分
  leadLosePts: 4.4,          // 我输时其余三家每张牌贡献的分
  tempoW: 4.0,               // 保住领出权的价值
  lossW: 0.9,                // 输掉时被吃掉的牌的价值权重
  overkillW: 0.10,           // 同样能赢时偏好便宜的牌
  drawTrumpW: 10,            // 抽主奖励
  safeThrowOnly: true,       // 只甩每一组都是光牌的
  ruffPairFactor: 0.35,      // 毙对子需要主牌对,概率打折
  /* --- 分数的边际价值:靠近 0/40/80/120/160 这些关口时,一分值好几分 --- */
  dynPts: false,
  kittyPrior: 4,             // 闲家对底分的先验
  kittyTakeP: 0.43,          // 闲家赢下末墩的先验概率
  spreadW: 0.30,             // 终局总分的不确定度 = 剩余分 × 此系数
  scaleMin: 0.35, scaleMax: 5.0,
  /* --- discV2:在「做短门」的子集上搜索扣底 --- */
  discV2: false,
  discPtCost: 0.9,           // 每个底分的代价(闲家抠底的期望损失)
  discVoidBase: 9,           // 做成一个短门值多少
  discVoidTrumpGate: 5,      // 主牌少于这个数时短门没用
  discLostW: 1.0,            // 扣掉一张牌损失的潜力
  discKeepPtSafe: 0.45,      // 留在手上的分牌被对方吃走的概率
  /* --- 末墩意识:抠底 = 底分 × 2 × 末墩每人张数 --- */
  lastTrickAware: false,
  lastTrickW: 1.0,
  /* --- 手牌结构:拆对/拆拖拉机要付代价,做成短门有收益 --- */
  breakPairW: 5,             // 拆掉一个对子的代价
  breakTractorW: 0,          // 拆掉拖拉机里的一对,额外代价
  voidGainW: 6,              // 打空一门副牌的收益(需要有主牌才用得上)
  /* --- 亮主评估 v2 --- */
  declV2: true,
  declTrumpLenW: 1.0,        // 折算主牌总张数(含各门级数牌和王)
  declHiW: 1.2,              // 本门 A / K 的加权
  declJokerW: 0.5,
  declNoDealerBar: 0,        // 无庄局(亮到就坐庄)额外抬高门槛
  declSideAceW: 0,           // 副门光牌也算牌力
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
  let hiddenTotal = 0;
  for (let i = 0; i < 85; i++) if (unseen[i] > 0) hiddenTotal += unseen[i];
  return { trump: trump, unseen: unseen, voids: voids, teamPts: teamPts, nTricks: nTricks, hiddenTotal: hiddenTotal };
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


/* 亮主评估 v2:按「折算后的主牌总张数 + 质量」挑花色,并区分有庄/无庄 */
function onDealV2(cfg, view) {
  const rank = view.trumpRank;
  const hand = view.hand;
  const n = hand.length;
  const cur = view.curDecl;
  if (n === 0) return null;

  const cnt = { S: 0, H: 0, D: 0, C: 0 };
  const rankCnt = { S: 0, H: 0, D: 0, C: 0 };
  const hi = { S: 0, H: 0, D: 0, C: 0 };
  let jokers = 0, sj = 0, bj = 0, sideAce = 0;
  for (let i = 0; i < n; i++) {
    const c = hand[i];
    if (c.suit === 'X') { jokers++; if (c.rank === 15) sj++; else bj++; continue; }
    cnt[c.suit]++;
    if (c.rank === rank) rankCnt[c.suit]++;
    else if (c.rank === 14) { hi[c.suit] += 1; sideAce++; }
    else if (c.rank === 13) hi[c.suit] += 0.6;
  }
  const totalRank = rankCnt.S + rankCnt.H + rankCnt.D + rankCnt.C;
  const scale = 25 / n;

  if (cfg.reinforce && cur && cur.seat === view.seat && cur.strength === 1 && !view.rebelHappened) {
    if (cur.suit && rankCnt[cur.suit] >= 2) return { suit: cur.suit, strength: 2 };
  }
  if (cfg.jokerRebel && (bj >= 2 || sj >= 2)) {
    const st = bj >= 2 ? 4 : 3;
    if (!cur || (cur.seat !== view.seat && st > cur.strength)) {
      if (totalRank * 2 + jokers * 2 >= 8) return { suit: null, strength: st };
    }
  }
  if (n < cfg.declEarlyCards) return null;

  let bestSuit = null, bestScore = -1e9;
  for (let i = 0; i < 4; i++) {
    const s = ALLSUITS[i];
    if (rankCnt[s] < 1) continue;
    /* s 做主之后我的主牌张数 = 本门牌 + 其他三门的级数牌 + 王 */
    const trumpLen = (cnt[s] + (totalRank - rankCnt[s]) + jokers) * scale;
    let v = trumpLen * cfg.declTrumpLenW
      + hi[s] * scale * cfg.declHiW
      + jokers * scale * cfg.declJokerW
      + (rankCnt[s] >= 2 ? cfg.declPairBonus : 0);
    if (cfg.declSideAceW) {
      let sa = 0;
      for (let j = 0; j < 4; j++) if (ALLSUITS[j] !== s) sa += hi[ALLSUITS[j]];
      v += sa * scale * cfg.declSideAceW;
    }
    if (v > bestScore) { bestScore = v; bestSuit = s; }
  }
  if (!bestSuit) return null;

  const strength = rankCnt[bestSuit] >= 2 ? 2 : 1;
  if (cur) {
    if (cur.seat === view.seat) return null;
    if (strength <= cur.strength) return null;
  }
  let need = cfg.declProjNeed;
  if (cfg.declLateGrab && n >= 20 && !cur) need -= 1.5;
  if (n >= 24 && !cur) need -= 1.0;
  if (strength === 2) need -= 0.8;
  if (!view.dealerKnown) need += cfg.declNoDealerBar;
  return bestScore >= need ? { suit: bestSuit, strength: strength } : null;
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
  const PS = ptsScale(a, view, cfg);

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



/* ---------------- discV2:扣底 ---------------- */

/* 扣掉这张牌损失了多少「将来能赢的分」 */
function lostPotential(a, c, trump, suitLen) {
  const es = E.effSuit(c, trump);
  if (es === 'T') return 30 + E.ordIdx(c, trump);          // 主牌基本不扣
  const b = beatersLeft(a, c, trump);
  let v = b === 0 ? 14 : (b <= 2 ? 8 : (b <= 5 ? 3 : 1));
  /* 长门里的中张更可能变成赢张 */
  if (suitLen >= 5) v += 1.5;
  return v;
}

function discardV2(cfg, view) {
  const trump = view.trump;
  const hand = view.hand;
  const a = analyze(view);
  const groups = M.bySuit(hand, trump);
  const nTrump = groups.T.length;
  const sideSuits = [];
  for (let i = 0; i < 4; i++) {
    const s = ALLSUITS[i];
    if (groups[s].length > 0) sideSuits.push(s);
  }
  const voidGain = nTrump < cfg.discVoidTrumpGate ? 0
    : cfg.discVoidBase * Math.min(1, (nTrump - cfg.discVoidTrumpGate + 1) / 5);

  /* 每张非主牌的「扣掉代价」 */
  const cost = new Map();
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    const es = E.effSuit(c, trump);
    const len = es === 'T' ? nTrump : groups[es].length;
    let v = lostPotential(a, c, trump, len) * cfg.discLostW;
    /* 分牌:扣掉的代价 = 抠底期望损失;留着的代价 = 被吃走的概率 */
    const p = E.cardPoints(c);
    if (p > 0) v += p * cfg.discPtCost - p * cfg.discKeepPtSafe;
    cost.set(c.id, v);
  }

  const ranked = hand.slice().sort(function (x, y) { return cost.get(x.id) - cost.get(y.id); });

  function fill(pre, preIds) {
    const out = pre.slice();
    for (let i = 0; i < ranked.length && out.length < 8; i++) {
      if (preIds.has(ranked[i].id)) continue;
      out.push(ranked[i]);
    }
    return out;
  }
  function evalSet(set) {
    let sc = 0;
    const ids = new Set();
    for (let i = 0; i < set.length; i++) { sc -= cost.get(set[i].id); ids.add(set[i].id); }
    /* 数一下扣完之后哪几门空了 */
    for (let i = 0; i < sideSuits.length; i++) {
      const s = sideSuits[i];
      let left = 0;
      for (let j = 0; j < groups[s].length; j++) if (!ids.has(groups[s][j].id)) left++;
      if (left === 0) sc += voidGain;
      else if (left === 1) sc += voidGain * 0.25;      // 单张也算半个短门
    }
    return sc;
  }

  let best = null, bestSc = -1e9;
  const nS = sideSuits.length;
  for (let mask = 0; mask < (1 << nS); mask++) {
    const pre = [];
    const preIds = new Set();
    let okMask = true;
    for (let i = 0; i < nS; i++) {
      if (!(mask & (1 << i))) continue;
      const cs = groups[sideSuits[i]];
      if (pre.length + cs.length > 8) { okMask = false; break; }
      for (let j = 0; j < cs.length; j++) { pre.push(cs[j]); preIds.add(cs[j].id); }
    }
    if (!okMask) continue;
    const set = fill(pre, preIds);
    if (set.length !== 8) continue;
    const sc = evalSet(set);
    if (sc > bestSc) { bestSc = sc; best = set; }
  }
  return best || ranked.slice(0, 8);
}

/* ---------------- evalV2:概率工具 ---------------- */

/* 从 hidden 张暗牌里随机抽 h 张,k 张目标牌一张都没抽到的概率 */
function pNone(k, h, hidden) {
  if (k <= 0 || h <= 0 || hidden <= 0) return 1;
  if (h >= hidden) return k > 0 ? 0 : 1;
  let p = 1;
  for (let i = 0; i < k; i++) {
    const num = hidden - h - i;
    if (num <= 0) return 0;
    p *= num / (hidden - i);
  }
  return p;
}
/* 某一档的两张都在他手上的概率 */
function pPairInHand(h, hidden) {
  if (h < 2 || hidden < 2) return 0;
  return (h * (h - 1)) / (hidden * (hidden - 1));
}

/* 某一家压住结构 cl 的概率 */
function pOppBeats(a, cl, hSize, hidden, seat, trump, cfg) {
  const es = cl.suit;
  let p = 0;
  if (cl.type === 'single') {
    p = 1 - pNone(beatersLeft(a, cl.cards[0], trump), hSize, hidden);
  } else if (cl.type === 'pair') {
    const slots = pairBeatersLeft(a, cl.top, es, trump);
    const pp = pPairInHand(hSize, hidden);
    p = 1 - Math.pow(1 - pp, slots);
  } else if (cl.type === 'tractor') {
    const slots = pairBeatersLeft(a, cl.top, es, trump);
    const pp = pPairInHand(hSize, hidden);
    const per = Math.pow(pp, cl.len);
    const chains = Math.max(0, slots - cl.len + 1);
    p = 1 - Math.pow(1 - per, chains);
  } else {
    /* 甩牌:任一组件被压就算被压 */
    let q = 1;
    for (let i = 0; i < cl.comps.length; i++) {
      const c = cl.comps[i];
      const sub = { type: c.type, suit: es, top: c.top, cards: c.cards, len: c.len };
      q *= (1 - pOppBeats(a, sub, hSize, hidden, seat, trump, cfg));
    }
    p = 1 - q;
  }
  if (es !== 'T') {
    const nSuit = unseenInSuit(a, es, trump);
    const pVoid = a.voids[seat][es] ? 1 : pNone(nSuit, hSize, hidden);
    const nT = unseenInSuit(a, 'T', trump);
    const pHasT = 1 - pNone(nT, hSize, hidden);
    let pRuff = pVoid * pHasT;
    if (cl.type !== 'single') pRuff *= cfg.ruffPairFactor;
    p = 1 - (1 - p) * (1 - pRuff);
  }
  return p < 0 ? 0 : (p > 0.98 ? 0.98 : p);
}

function countTrump(hand, trump) {
  let n = 0;
  for (let i = 0; i < hand.length; i++) if (E.effSuit(hand[i], trump) === 'T') n++;
  return n;
}


/* 一分值多少「级」—— 用正态近似算终局总分落在关口上的密度。
 * F(total) 在 1/40/80/120/160/200 各跳 +1 级(闲家视角),跳幅一致。 */
function ptsScale(a, view, cfg) {
  if (!cfg.dynPts) return 1;
  const declTeam = view.declSeat % 2, defTeam = 1 - declTeam;
  const got = a.teamPts[0] + a.teamPts[1];
  const kp = (view.buriedKnown && view.buriedKnown.length)
    ? E.countPoints(view.buriedKnown) : cfg.kittyPrior;
  let inPlay = 200 - got - kp;
  if (inPlay < 0) inPlay = 0;
  const cur = a.teamPts[defTeam];
  const mu = cur + inPlay * 0.5 + kp * 2 * cfg.kittyTakeP;
  const sigma = Math.max(5, inPlay * cfg.spreadW + 3);
  const TH = [1, 40, 80, 120, 160, 200];
  let w = 0;
  for (let i = 0; i < TH.length; i++) {
    const z = (TH[i] - mu) / sigma;
    w += Math.exp(-0.5 * z * z) / (sigma * 2.5066282746);
  }
  let sc = w / 0.025;
  if (sc < cfg.scaleMin) sc = cfg.scaleMin;
  if (sc > cfg.scaleMax) sc = cfg.scaleMax;
  return sc;
}


/* 末墩的抠底摆动:对「我方」的价值(闲家赢末墩才有,倍数跟末墩张数走) */
function lastTrickSwing(cfg, view, L, pWin) {
  if (!cfg.lastTrickAware) return 0;
  if (view.hand.length !== L) return 0;              // 不是末墩
  const kp = (view.buriedKnown && view.buriedKnown.length)
    ? E.countPoints(view.buriedKnown) : cfg.kittyPrior;
  if (kp <= 0) return 0;
  const swing = kp * 2 * L * cfg.lastTrickW;
  const iAmDef = view.myTeam !== (view.declSeat % 2);
  return iAmDef ? pWin * swing : -(1 - pWin) * swing;
}


/* 出掉这一手之后,手牌结构受了多少损伤 */
function structCost(cfg, a, view, cd, trump) {
  if (!cfg.breakPairW && !cfg.voidGainW) return 0;
  const hand = view.hand;
  let cost = 0;
  if (cfg.breakPairW) {
    const inHand = new Map(), inPlay = new Map();
    for (let i = 0; i < hand.length; i++) {
      const k = hand[i].suit + '/' + hand[i].rank;
      inHand.set(k, (inHand.get(k) || 0) + 1);
    }
    for (let i = 0; i < cd.length; i++) {
      const k = cd[i].suit + '/' + cd[i].rank;
      inPlay.set(k, (inPlay.get(k) || 0) + 1);
    }
    inPlay.forEach(function (v, k) {
      if (v === 1 && inHand.get(k) >= 2) cost += cfg.breakPairW;
    });
    if (cfg.breakTractorW) {
      /* 出掉之后,本门最长拖拉机短了多少 */
      const es = E.effSuit(cd[0], trump);
      let same = true;
      for (let i = 1; i < cd.length; i++) if (E.effSuit(cd[i], trump) !== es) same = false;
      if (same) {
        const before = E.longestTractor(E.filterSuit(hand, es, trump), trump);
        if (before >= 2) {
          const ids = new Set();
          for (let i = 0; i < cd.length; i++) ids.add(cd[i].id);
          const left = [];
          for (let i = 0; i < hand.length; i++) {
            if (!ids.has(hand[i].id) && E.effSuit(hand[i], trump) === es) left.push(hand[i]);
          }
          const after = E.longestTractor(left, trump);
          if (after < before) cost += cfg.breakTractorW * (before - after);
        }
      }
    }
  }
  if (cfg.voidGainW) {
    let nTrump = 0;
    for (let i = 0; i < hand.length; i++) if (E.effSuit(hand[i], trump) === 'T') nTrump++;
    if (nTrump >= 3) {
      const cnt = {};
      for (let i = 0; i < hand.length; i++) {
        const es = E.effSuit(hand[i], trump);
        if (es !== 'T') cnt[es] = (cnt[es] || 0) + 1;
      }
      const rem = {};
      for (let i = 0; i < cd.length; i++) {
        const es = E.effSuit(cd[i], trump);
        if (es !== 'T') rem[es] = (rem[es] || 0) + 1;
      }
      for (const k in rem) if (cnt[k] === rem[k]) cost -= cfg.voidGainW;
    }
  }
  return cost;
}

/* ---------------- evalV2:领出 ---------------- */

function leadV2(cfg, view) {
  const trump = view.trump;
  const hand = view.hand;
  const a = analyze(view);
  const H = hand.length;
  const hidden = a.hiddenTotal;
  const opps = [(view.seat + 1) % 4, (view.seat + 3) % 4];
  const isDecl = view.myTeam === (view.declSeat % 2);
  const myTrumps = countTrump(hand, trump);
  const trumpLeft = unseenInSuit(a, 'T', trump);

  const PS = ptsScale(a, view, cfg);
  let cands = M.genLeadCandidates(hand, trump);
  const thr = M.genThrowCandidates(hand, trump, 30);
  for (let i = 0; i < thr.length; i++) cands.push(thr[i]);

  let best = null, bestScore = -1e9;
  const seen = new Set();
  for (let i = 0; i < cands.length; i++) {
    const cd = cands[i];
    const key = cd.map(function (c) { return c.id; }).sort(function (x, y) { return x - y; }).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const cl = E.classify(cd, trump);
    if (!cl) continue;
    const L = cd.length;

    /* 甩牌:只甩每一组都压不住的 */
    if (cl.type === 'throw') {
      if (cfg.safeThrowOnly) {
        let allSure = true;
        for (let j = 0; j < cl.comps.length; j++) {
          const c = cl.comps[j];
          const sure = c.type === 'single'
            ? beatersLeft(a, c.cards[0], trump) === 0
            : pairBeatersLeft(a, c.top, cl.suit, trump) === 0;
          if (!sure) { allSure = false; break; }
        }
        if (!allSure) continue;
      }
    }

    let pWin = 1;
    for (let j = 0; j < 2; j++) pWin *= (1 - pOppBeats(a, cl, H, hidden, opps[j], trump, cfg));

    const myPts = E.countPoints(cd);
    const evWin = myPts + L * cfg.leadWinPts;
    const evLose = myPts + L * cfg.leadLosePts;
    let sc = (pWin * evWin - (1 - pWin) * evLose) * PS;
    sc += pWin * cfg.tempoW;
    sc += lastTrickSwing(cfg, view, L, pWin);

    let spent = 0;
    for (let j = 0; j < L; j++) spent += cardValue(a, cd[j], trump);
    sc -= (1 - pWin) * spent * cfg.lossW;
    sc -= spent * cfg.overkillW;
    sc -= structCost(cfg, a, view, cd, trump);

    if (cl.suit === 'T') {
      if (isDecl && trumpLeft > 0 && myTrumps >= 6) {
        sc += cfg.drawTrumpW * Math.min(1, myTrumps / 10) * Math.min(1, trumpLeft / 8);
      }
    }
    if (sc > bestScore) { bestScore = sc; best = cd; }
  }
  if (!best) best = M.forceLegalLead(hand, trump);
  return best;
}

/* ---------------- evalV2:跟牌 ---------------- */

function followV2(cfg, view, plays) {
  const trump = view.trump;
  const hand = view.hand;
  const lead0 = E.classify(plays[0].cards, trump);
  if (!lead0) return M.forceLegalFollow(hand, { cards: plays[0].cards, suit: 'T', type: 'single' }, trump, null);
  const a = analyze(view);
  const H = hand.length;
  const hidden = a.hiddenTotal;
  const L = lead0.cards.length;
  const cands = M.genFollowCandidates(hand, lead0, trump, null, 60);

  /* 我之后还有谁没出 */
  const laterSeats = [];
  for (let i = plays.length + 1; i <= 3; i++) laterSeats.push((plays[0].seat + i) % 4);
  const laterOpp = [], laterMate = [];
  for (let i = 0; i < laterSeats.length; i++) {
    if (laterSeats[i] % 2 === view.myTeam) laterMate.push(laterSeats[i]); else laterOpp.push(laterSeats[i]);
  }
  const ptsOnTable = E.countPoints(plays[0].cards) +
    (plays[1] ? E.countPoints(plays[1].cards) : 0) +
    (plays[2] ? E.countPoints(plays[2].cards) : 0);
  const PS = ptsScale(a, view, cfg);

  let best = null, bestScore = -1e9;
  for (let i = 0; i < cands.length; i++) {
    const cd = cands[i];
    const test = plays.concat([{ seat: view.seat, cards: cd }]);
    const r = E.resolveTrick(test, trump);
    const myPts = E.countPoints(cd);
    const winCl = E.classify(test[r.winIdx].cards, trump);
    const mineWins = (r.winner % 2) === view.myTeam;

    /* 我方现在领先 → 还能不能守住;对方领先 → 队友还能不能翻回来 */
    let pTeam;
    if (mineWins) {
      pTeam = 1;
      for (let j = 0; j < laterOpp.length; j++) {
        pTeam *= (1 - pOppBeats(a, winCl, H, hidden, laterOpp[j], trump, cfg));
      }
    } else {
      pTeam = 0;
      if (laterMate.length) {
        let pm = pOppBeats(a, winCl, H, hidden, laterMate[0], trump, cfg);
        /* 队友翻回来之后还要顶住后面的对手 */
        for (let j = 0; j < laterOpp.length; j++) {
          pm *= (1 - pOppBeats(a, winCl, H, hidden, laterOpp[j], trump, cfg)) * 0.9;
        }
        pTeam = pm;
      }
    }

    const expLater = laterSeats.length * L * cfg.ptsPerCardLater;
    const total = ptsOnTable + myPts + expLater;
    let sc = (2 * pTeam - 1) * total * PS;
    sc += pTeam * cfg.tempoW * 0.5;
    sc += lastTrickSwing(cfg, view, L, pTeam);

    let spent = 0;
    for (let j = 0; j < cd.length; j++) spent += cardValue(a, cd[j], trump);
    sc -= (1 - pTeam) * spent * cfg.lossW;
    sc -= spent * cfg.overkillW;
    sc -= structCost(cfg, a, view, cd, trump);

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
    onDeal: function (view) { try { return cfg.declV2 ? onDealV2(cfg, view) : onDeal(cfg, view); } catch (e) { return null; } },
    onRebel: function (view) { try { return onRebel(cfg, view); } catch (e) { return false; } },
    discard: function (view) {
      try {
        const d = cfg.discV2 ? discardV2(cfg, view) : discard(cfg, view);
        if (d && d.length === 8) return d;
      } catch (e) { }
      const h = view.hand.slice().sort(function (x, y) { return M.junkScore(x, view.trump) - M.junkScore(y, view.trump); });
      return h.slice(0, 8);
    },
    lead: function (view) {
      try {
        const l = cfg.evalV2 ? leadV2(cfg, view) : lead(cfg, view);
        if (l && l.length && E.classify(l, view.trump)) return l;
      } catch (e) { }
      return M.forceLegalLead(view.hand, view.trump);
    },
    follow: function (view, plays) {
      const lead0 = E.classify(plays[0].cards, view.trump);
      try {
        const f = cfg.evalV2 ? followV2(cfg, view, plays) : follow(cfg, view, plays);
        if (f && lead0 && E.isLegalFollow(view.hand, lead0, f, view.trump, null)) return f;
      } catch (e) { }
      return M.forceLegalFollow(view.hand, lead0, view.trump, null);
    },
  };
}

module.exports = { makeAI, DEFAULTS, analyze, beatersLeft, cardValue };
