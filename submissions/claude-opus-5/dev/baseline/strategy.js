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
  /* 注:这个开关实测是**死的** —— 15 / 25 / 40 / 60 四个值行为差异都是 0%。
   * 33 张里至少有 18 张非主牌,非主废牌的 buryScore 恒高于任何主牌,
   * 所以「不扣主」是被牌数结构逼出来的,不是这个权重在起作用。 */
  buryTrumpPenalty: 40,
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
  /* --- cardValue 的形状(决定「该丢哪张」,每次决策都用) --- */
  cvSure: 12, cvNear: 7, cvFar: 4, cvFarSlope: 0.3,
  cvTrumpBase: 3, cvTrumpOrd: 0.35, cvOrd: 0.15, cvPts: 0.25,
  /* --- follow 的期望后手分:区分后面是队友还是对手 --- */
  followSplitEV: false,
  partnerDumpRate: 3.0, oppAvoidRate: 1.0, oppDumpRate: 3.0, mateAvoidRate: 1.0,
  /* --- 领出:队友可能把被压掉的一墩救回来 --- */
  partnerRescueW: 0,
  /* --- 领出:打长套,把小牌做成赢张 --- */
  longSuitW: 0,
  /* --- 庄家/闲家用不同的权重 --- */
  declLossW: 0, defLossW: 0,          // 0 = 沿用 lossW
  declTempoW: 0, defTempoW: 0,        // 0 = 沿用 tempoW
  mateLaterFactor: 0.9,               // 队友翻回来之后还要顶住后面对手的折扣
  /* --- 动态先手价值:手上没赢张的时候,拿到领出权反而是负担 --- */
  dynTempo: true,
  dynTempoFloor: 0,       // 出完之后一张赢张都没有时,先手价值的倍率
  dynTempoFull: 2,           // 有几张赢张就算「先手值钱」
  /* --- 分牌的时间价值:留到最后的分牌基本上都会被逼出来送给对方,
   *     所以越到后面,把分垫掉的代价越小 --- */
  ptsUrgency: 0,
  ptsUrgencyLead: 0,
  /* --- 抽主只有在「这一墩还赢得下来」时才算数;甩牌同理(甩牌校验只看本门,
   *     不看谁能毙,所以「安全甩牌」照样可能被主牌敲掉) --- */
  drawTrumpNeedsWin: false,
  drawTrumpPerCard: 0,       // 抽主奖励按张数放大(一次抽走对手更多主牌)
  throwNeedsWin: false,
  /* --- cardValue 的「光牌」价值要打毙牌折扣:副门 A 在大家都断门之后不值钱 --- */
  cvRuffAware: 0.8,
  /* --- 残局采样走子:对静态分最高的几个候选,采样若干个一致的世界走到底再比 --- */
  rollout: true,
  rolloutMaxCards: 4,        // 手牌 ≤ 这个数才开(跟牌)。5 更强 +0.011,但要多花 10µs,见 PROGRESS
  rolloutMaxCardsLead: 0,    // 领出单独的深度(0 = 跟 rolloutMaxCards 一样)
  rolloutK: 6,              // 采样几个世界
  rolloutM: 4,               // 只精算静态分最高的几个候选
  rolloutKittyPrior: 4,
  /* --- 中前期领出的截断前瞻:手牌还多的时候走不到底,就只往前推固定几墩,
   *     再用「剩下的牌值多少」当终局评价。代价与手牌张数无关。 --- */
  /* 量下来是**负的**(修好 followV2 之后 −0.047 级/局,6.3σ)。保留代码作为记录,
   * 默认关。曾经量到 +0.06 —— 那是 followV2 当时在抛异常、两边一起退化的假象。 */
  midLook: false,
  midTricks: 1,              // 往前推几墩
  midK: 3,                   // 采样几个世界
  midM: 3,                   // 精算静态分最高的几个候选
  midTermW: 1.0,             // 终局手牌强度差的权重
  midMinCards: 6,            // 手牌少于这个数就交给残局 rollout
  midMaxCards: 99,           // 手牌多于这个数就不前瞻(牌太多时既贵又不准)
  rolloutMargin: 0,          // 静态分差距大于这个数就不必精算(0 = 总是精算)
  rolloutSmartLead: true,    // 走子时的领出用「这个世界里压不压得住」来判断
  rolloutSmartFollow: false, // 走子时跟牌也看后手能不能压回来
  rolloutRichLead: false,    // 走子的领出候选补上「每门最小的一张」
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
  /* §D 的 checkThrow 只看别家**手上**有没有更大的,底牌里的不算。
   * 但我的 beatersLeft 把底牌也算成暗牌 —— 作为闲家我因此偏保守。
   * 甩牌失败只是被迫出最小的一组、不罚分,所以容一两张「可能在底牌里」的压制牌
   * 也许是划算的。 */
  throwMaxBeaters: 0,
  noThrow: false,            // 完全不甩牌
  maxSafeThrow: false,       // 额外生成「本门所有光牌组件」的最大安全甩牌
  throwBonus: 60,            // 甩牌额外加权
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
  discOrdW: 0,               // 同为废牌时按大小细分(旧版扣底靠的就是这个)
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
  declNoDealerBar: -5,       // 无庄局(亮到就坐庄)额外抬高门槛
  declMyTeamDealerBar: 0,    // 已定庄且庄家是我方时的门槛调整
  declOppDealerBar: 0,       // 已定庄且庄家是对方时的门槛调整
  ntGate: 99,                // 王对造反成无主的门槛
  noOverridePartner: false,  // 不把队友亮的主改掉(量到 -2.0σ,默认关)
  /* 注:「替队友把单张补成对」在两副牌下是不可能的 —— 队友亮的那张级数牌
   * 只有两张,他手上占了一张,我最多再有一张,凑不出对。规则里「只有亮主者
   * 本人能加固」这一条,在同花色 1→2 这件事上其实是被牌数逼出来的。 */
  declSideAceW: 0,           // 副门光牌也算牌力
  declHyper: false,          // 用超几何期望折算,而不是线性外推
  /* --- 候选集宽度 --- */
  followCap: 100, fillCap: 30,
  /* --- 对手手牌建模:按已知断门缩小候选池 --- */
  voidAwarePool: true,
  /* --- 对手手牌分布模型:精确手牌张数 + IPF 拟合各家各门的期望张数 --- */
  handModel: false,
  ipfIters: 12,
  /* --- 蒙特卡洛定牌:按「各家剩几张 + 已知断门」采样若干个一致的世界,
   *     在每个世界里精确判定「压不压得住」,取频率当概率。 --- */
  mcModel: false,
  mcSamples: 16,
  ruffFix: false,            // 「有大牌」与「断门可毙」互斥,不该用 noisy-OR
  /* --- 仅供开发期探针:给出真实手牌,把概率模型换成精确判定。
   *     提交时 oracle 恒为 false,这条路径永不执行。 --- */
  oracle: false, oracleHands: null, __probe: null, oracleMaxCards: 99, oracleMinCards: 0,
  __cache: null,
};

/* ---------------- 局面分析 ---------------- */

/* 局面分析。每次决策都要用,所以做两件事:
 *  1) 断门/得分按「完整墩」增量累计,不重扫整个 history
 *  2) 把「某门里比某个序号大的暗牌有几张」预先做成 O(1) 查表
 * 缓存挂在 AI 实例上(cache 参数),history 变短即认为换了一局。 */
function analyze(view, cache) {
  const trump = view.trump || { suit: null, rank: view.trumpRank };
  const hist = view.history;

  let C = cache;
  if (!C || C.histLen > hist.length || C.rank !== trump.rank || C.tsuit !== trump.suit || C.seat !== view.seat) {
    C = { histLen: 0, nTricks: 0, voids: [{}, {}, {}, {}], teamPts: [0, 0],
          histSeen: new Int8Array(85), hsizePlayed: [0, 0, 0, 0],
          rank: trump.rank, tsuit: trump.suit, seat: view.seat };
    if (cache) { cache.reset = true; }
  }
  /* 增量吃掉新出现的手 */
  for (let i = C.histLen; i < hist.length; i++) {
    const cs = hist[i].cards;
    for (let j = 0; j < cs.length; j++) C.histSeen[keyOf(cs[j])]++;
    C.hsizePlayed[hist[i].seat] += cs.length;
  }
  C.histLen = hist.length;
  /* 增量结算新完成的墩 */
  const done = Math.floor(hist.length / 4);
  for (let t = C.nTricks; t < done; t++) {
    const plays = [hist[t * 4], hist[t * 4 + 1], hist[t * 4 + 2], hist[t * 4 + 3]];
    const lead = E.classify(plays[0].cards, trump);
    if (lead) {
      for (let i = 1; i < 4; i++) {
        const p = plays[i];
        let inSuit = 0;
        for (let j = 0; j < p.cards.length; j++) if (E.effSuit(p.cards[j], trump) === lead.suit) inSuit++;
        if (inSuit < p.cards.length) C.voids[p.seat][lead.suit] = true;
      }
      const r = E.resolveTrick(plays, trump);
      C.teamPts[r.winner % 2] += r.points;
    }
  }
  C.nTricks = done;

  /* 暗牌 = 全副 − 我的手牌 − 已出的 − 我知道的底牌 */
  const unseen = new Int8Array(85);
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) unseen[s * 17 + r] = 2;
  unseen[4 * 17 + 15] = 2; unseen[4 * 17 + 16] = 2;
  for (let i = 0; i < 85; i++) if (C.histSeen[i]) unseen[i] -= C.histSeen[i];
  const hand = view.hand;
  for (let i = 0; i < hand.length; i++) unseen[keyOf(hand[i])]--;
  const bk = view.buriedKnown;
  for (let i = 0; i < bk.length; i++) unseen[keyOf(bk[i])]--;

  /* O(1) 查表:above[门][序号] = 该门里序号更大的暗牌张数 */
  const KEYS = ['T', 'S', 'H', 'D', 'C'];
  const above = {}, pairAbove = {}, suitTot = {};
  for (let i = 0; i < 5; i++) { above[KEYS[i]] = new Int16Array(17); pairAbove[KEYS[i]] = new Int16Array(17); suitTot[KEYS[i]] = 0; }
  let hiddenTotal = 0;
  const nSuit = { T: 0, S: 0, H: 0, D: 0, C: 0 };
  for (let si = 0; si < 5; si++) {
    const suit = si === 4 ? 'X' : ALLSUITS[si];
    const lo = si === 4 ? 15 : 2, hi = si === 4 ? 16 : 14;
    for (let r = lo; r <= hi; r++) {
      const c = unseen[si * 17 + r];
      if (c <= 0) continue;
      hiddenTotal += c;
      const probe = { suit: suit, rank: r, id: -1 };
      const es = E.effSuit(probe, trump);
      const o = E.ordIdx(probe, trump);
      above[es][o] += c;
      if (c >= 2) pairAbove[es][o] += 1;
      suitTot[es] += c;
      nSuit[es] += c;
    }
  }
  for (let i = 0; i < 5; i++) {
    const A1 = above[KEYS[i]], A2 = pairAbove[KEYS[i]];
    for (let o = 15; o >= 0; o--) { A1[o] += A1[o + 1]; A2[o] += A2[o + 1]; }
    /* A1[o] 现在是「序号 >= o」,要的是「> o」*/
  }
  const hsize = [25, 25, 25, 25];
  for (let i = 0; i < 4; i++) hsize[i] -= C.hsizePlayed[i];

  return {
    trump: trump, unseen: unseen, voids: C.voids, teamPts: C.teamPts, nTricks: C.nTricks,
    hiddenTotal: hiddenTotal, hsize: hsize, nSuit: nSuit, seat: view.seat,
    kittyUnknown: (bk && bk.length) ? 0 : (view.kittySize || 8),
    w: null, above: above, pairAbove: pairAbove, suitTot: suitTot, cache: C,
  };
}

/* 同门里还没露面、比它大的牌有几张 */
function beatersLeft(a, card, trump) {
  const t = a.above[E.effSuit(card, trump)];
  const oi = E.ordIdx(card, trump);
  return oi >= 15 ? 0 : t[oi + 1];
}

/* 还剩几个能压过 top 的对子 */
function pairBeatersLeft(a, top, es, trump) {
  const t = a.pairAbove[es];
  if (!t) return 0;
  return top >= 15 ? 0 : t[top + 1];
}

function unseenInSuit(a, es, trump) {
  return a.suitTot[es] || 0;
}

/* 留牌价值:越高越舍不得出 */
/* 这一门还「活着」的程度:外面这门的牌越少,越可能被人断门毙掉 */
function suitAlive(a, es, trump) {
  if (es === 'T') return 1;
  if (!a.aliveCache) a.aliveCache = {};
  if (a.aliveCache[es] !== undefined) return a.aliveCache[es];
  const nS = unseenInSuit(a, es, trump);
  /* 三家平分:每家期望 nS/3.4 张,一张都没有的概率越高,这门越危险 */
  const perHand = nS / 3.4;
  const v = 1 - Math.exp(-perHand * 0.9);
  a.aliveCache[es] = v;
  return v;
}

function cardValue(a, c, trump, cfg) {
  const es = E.effSuit(c, trump);
  const oi = E.ordIdx(c, trump);
  const b = beatersLeft(a, c, trump);
  const k = cfg || DEFAULTS;
  let v = b === 0 ? k.cvSure : (b <= 2 ? k.cvNear : Math.max(0, k.cvFar - b * k.cvFarSlope));
  if (k.cvRuffAware && es !== 'T' && b <= 2) {
    const al = suitAlive(a, es, trump);
    v *= (1 - k.cvRuffAware) + k.cvRuffAware * al;
  }
  if (es === 'T') v += k.cvTrumpBase + oi * k.cvTrumpOrd;
  else v += oi * k.cvOrd;
  v += E.cardPoints(c) * k.cvPts;
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
  /* 线性外推 c×25/n 在 n 小的时候严重高估(n=5、c=3 会算成 15,实际期望只有 7.5)。
   * 正确的是超几何期望:已有 c 张,剩下的 25−n 张里,该类牌还剩 (T−c)/(108−n)。 */
  const remDraw = 25 - n, unseenAll = 108 - n;
  const proj = function (have, total) {
    if (unseenAll <= 0) return have;
    const p = have + remDraw * (total - have) / unseenAll;
    return p < have ? have : p;
  };

  if (cfg.reinforce && cur && cur.seat === view.seat && cur.strength === 1 && !view.rebelHappened) {
    if (cur.suit && rankCnt[cur.suit] >= 2) return { suit: cur.suit, strength: 2 };
  }
  if (cfg.jokerRebel && (bj >= 2 || sj >= 2)) {
    const st = bj >= 2 ? 4 : 3;
    if (!cur || (cur.seat !== view.seat && st > cur.strength)) {
      if (totalRank * 2 + jokers * 2 >= cfg.ntGate) return { suit: null, strength: st };
    }
  }
  if (n < cfg.declEarlyCards) return null;

  /* 不把队友亮的主改成别的花色 */
  if (cfg.noOverridePartner && cur && cur.seat !== view.seat &&
      (cur.seat % 2) === (view.seat % 2)) return null;

  let bestSuit = null, bestScore = -1e9;
  for (let i = 0; i < 4; i++) {
    const s = ALLSUITS[i];
    if (rankCnt[s] < 1) continue;
    /* s 做主之后我的主牌张数 = 本门牌 + 其他三门的级数牌 + 王 */
    const trumpLen = cfg.declHyper
      ? proj(cnt[s], 26) + proj(totalRank - rankCnt[s], 6) + proj(jokers, 4)
      : (cnt[s] + (totalRank - rankCnt[s]) + jokers) * scale;
    const hiP = cfg.declHyper ? proj(hi[s], 3.2) : hi[s] * scale;
    const jokP = cfg.declHyper ? proj(jokers, 4) : jokers * scale;
    let v = trumpLen * cfg.declTrumpLenW
      + hiP * cfg.declHiW
      + jokP * cfg.declJokerW
      + (rankCnt[s] >= 2 ? cfg.declPairBonus : 0);
    if (cfg.declSideAceW) {
      let sa = 0;
      for (let j = 0; j < 4; j++) if (ALLSUITS[j] !== s) sa += hi[ALLSUITS[j]];
      v += (cfg.declHyper ? proj(sa, 9.6) : sa * scale) * cfg.declSideAceW;
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
  else if (view.dealer >= 0) {
    need += (view.dealer % 2 === view.seat % 2) ? cfg.declMyTeamDealerBar : cfg.declOppDealerBar;
  }
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
  const a = analyze(view, cfg.__cache); cfg.__cache = a.cache;
  const groups = M.bySuit(hand, trump);
  const need = 8;

  /* 每张牌的「愿意扣掉」分:越大越想扣 */
  function buryScore(c, suitLen) {
    const es = E.effSuit(c, trump);
    let s = 20 - E.ordIdx(c, trump) * 1.2;
    if (es === 'T') s -= cfg.buryTrumpPenalty;                // 主牌尽量不扣
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
  const a = analyze(view, cfg.__cache); cfg.__cache = a.cache;
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
  const a = analyze(view, cfg.__cache); cfg.__cache = a.cache;
  const cands = M.genFollowCandidates(hand, lead0, trump, null, cfg.followCap, cfg.fillCap);

  const cur = E.resolveTrick(plays, trump);
  const winnerSeat = cur.winner;
  const partnerWinning = (winnerSeat % 2) === view.myTeam && plays.length > 1;
  const isLast = plays.length === 3;
  const ptsOnTable = E.countPoints(plays[0].cards) +
    (plays[1] ? E.countPoints(plays[1].cards) : 0) +
    (plays[2] ? E.countPoints(plays[2].cards) : 0);
  const PS = ptsScale(a, view, cfg);
  const HSUM = handSummary(view, trump);
  /* 先把已出的几手定型,循环里只 classify 我自己的候选 */
  const leadSig = E.sigOf(lead0);
  let preBest = lead0, preWinIdx = 0, prePts = E.countPoints(plays[0].cards);
  for (let i = 1; i < plays.length; i++) {
    prePts += E.countPoints(plays[i].cards);
    const cl = E.classify(plays[i].cards, trump);
    if (!cl || E.sigOf(cl) !== leadSig) continue;
    if (cl.suit === preBest.suit) { if (cl.top > preBest.top) { preBest = cl; preWinIdx = i; } }
    else if (cl.suit === 'T') { preBest = cl; preWinIdx = i; }
  }
  const isDecl2 = view.myTeam === (view.declSeat % 2);
  const LOSSW = (isDecl2 ? cfg.declLossW : cfg.defLossW) || cfg.lossW;
  const TEMPOW = (isDecl2 ? cfg.declTempoW : cfg.defTempoW) || cfg.tempoW;

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
function lostPotential2(a, c, trump, suitLen, cfg) {
  return lostPotential(a, c, trump, suitLen) + cfg.discOrdW * E.ordIdx(c, trump);
}

function discardV2(cfg, view) {
  const trump = view.trump;
  const hand = view.hand;
  const a = analyze(view, cfg.__cache); cfg.__cache = a.cache;
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
    let v = lostPotential2(a, c, trump, len, cfg) * cfg.discLostW;
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



/* ---------------- 蒙特卡洛定牌 ---------------- */

/* 确定性伪随机:种子由局面本身派生,同一局面永远采到同一批世界 */
function mkRng(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 一家在某一门里的「压制力」摘要 */
function beatSummary(cards, trump) {
  const out = { n: cards.length, maxOrd: -1, maxPair: -1, tr: null };
  if (!cards.length) return out;
  for (let i = 0; i < cards.length; i++) {
    const o = E.ordIdx(cards[i], trump);
    if (o > out.maxOrd) out.maxOrd = o;
  }
  const comps = E.decompose(cards, trump);
  const tr = [];
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    if (c.type === 'pair') { if (c.top > out.maxPair) out.maxPair = c.top; }
    else if (c.type === 'tractor') {
      if (c.top > out.maxPair) out.maxPair = c.top;
      for (let L = 2; L <= c.len; L++) if (!(tr[L] >= 0) || c.top > tr[L]) tr[L] = c.top;
    }
  }
  out.tr = tr;
  return out;
}

const MCK = ['T', 'S', 'H', 'D', 'C'];

function buildWorlds(a, view, cfg) {
  if (a.worlds) return a.worlds;
  const trump = a.trump;
  const me = view.seat;

  /* 暗牌池 */
  const pool = [];
  let hseed = view.history.length * 7919 + me * 131 + view.hand.length * 31;
  for (let i = 0; i < view.hand.length; i++) hseed = (hseed * 33 + view.hand[i].id) | 0;
  for (let sIdx = 0; sIdx < 5; sIdx++) {
    const suit = sIdx === 4 ? 'X' : ALLSUITS[sIdx];
    const lo = sIdx === 4 ? 15 : 2, hi = sIdx === 4 ? 16 : 14;
    for (let r = lo; r <= hi; r++) {
      const c = a.unseen[sIdx * 17 + r];
      for (let q = 0; q < c; q++) pool.push({ suit: suit, rank: r, id: -1 - pool.length });
    }
  }
  /* 持有者:三个其他座位 + 底牌 */
  const seats = [];
  for (let p = 0; p < 4; p++) if (p !== me) seats.push(p);
  const caps0 = [];
  for (let i = 0; i < seats.length; i++) caps0.push(Math.max(0, a.hsize[seats[i]]));
  caps0.push(Math.max(0, a.kittyUnknown));
  const H = caps0.length;

  /* 每张牌能落到哪些持有者手上(底牌无断门约束) */
  const allow = [];
  for (let i = 0; i < pool.length; i++) {
    const es = E.effSuit(pool[i], trump);
    const list = [];
    for (let h = 0; h < H; h++) {
      if (h < seats.length && a.voids[seats[h]][es]) continue;
      list.push(h);
    }
    allow.push(list.length ? list : [H - 1]);
  }
  /* 约束紧的先分配 */
  const order = [];
  for (let i = 0; i < pool.length; i++) order.push(i);
  order.sort(function (x, y) { return allow[x].length - allow[y].length; });

  const rng = mkRng(hseed);
  const K = cfg.mcSamples;
  const worlds = [];
  for (let k = 0; k < K; k++) {
    const caps = caps0.slice();
    const buckets = [];
    for (let h = 0; h < H; h++) buckets.push([]);
    /* 同约束等级内部打乱 */
    for (let i = order.length - 1; i > 0; i--) {
      if (allow[order[i]].length !== allow[order[i - 1]].length) continue;
      const j = i - Math.floor(rng() * 2);
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    for (let oi = 0; oi < order.length; oi++) {
      const ci = order[oi];
      const list = allow[ci];
      let tot = 0;
      for (let i = 0; i < list.length; i++) tot += caps[list[i]];
      let pick = -1;
      if (tot > 0) {
        let r = rng() * tot;
        for (let i = 0; i < list.length; i++) { r -= caps[list[i]]; if (r <= 0) { pick = list[i]; break; } }
        if (pick < 0) pick = list[list.length - 1];
      } else {
        for (let h = 0; h < H; h++) if (caps[h] > 0) { pick = h; break; }
        if (pick < 0) pick = H - 1;
      }
      caps[pick]--;
      buckets[pick].push(pool[ci]);
    }
    /* 每家每门的压制力摘要 */
    const tab = {};
    for (let i = 0; i < seats.length; i++) {
      const bySuit = { T: [], S: [], H: [], D: [], C: [] };
      const b = buckets[i];
      for (let j = 0; j < b.length; j++) bySuit[E.effSuit(b[j], trump)].push(b[j]);
      const t = {};
      for (let j = 0; j < 5; j++) t[MCK[j]] = beatSummary(bySuit[MCK[j]], trump);
      tab[seats[i]] = t;
    }
    worlds.push(tab);
  }
  a.worlds = worlds;
  return worlds;
}

/* 在一个世界里,这一家压不压得住 cl */
function worldBeats(tab, cl) {
  const es = cl.suit;
  const s = tab[es];
  if (!s) return false;
  if (s.n > 0) {
    if (cl.type === 'single') return s.maxOrd > cl.top;
    if (cl.type === 'pair') return s.maxPair > cl.top;
    if (cl.type === 'tractor') { const v = s.tr[cl.len]; return v !== undefined && v > cl.top; }
    for (let i = 0; i < cl.comps.length; i++) {
      const c = cl.comps[i];
      if (worldBeats(tab, { type: c.type, suit: es, top: c.top, len: c.len, comps: null })) return true;
    }
    return false;
  }
  /* 本门断了 → 能不能用主牌毙 */
  if (es === 'T') return false;
  const t = tab['T'];
  if (!t || t.n === 0) return false;
  if (cl.type === 'single') return true;
  if (cl.type === 'pair') return t.maxPair >= 0;
  if (cl.type === 'tractor') return t.tr[cl.len] !== undefined;
  let need = 0;
  for (let i = 0; i < cl.comps.length; i++) need = Math.max(need, cl.comps[i].type === 'tractor' ? cl.comps[i].len : 0);
  return need ? t.tr[need] !== undefined : true;
}

function pOppBeatsMC(a, view, cl, seat, cfg) {
  const worlds = buildWorlds(a, view, cfg);
  let n = 0;
  for (let i = 0; i < worlds.length; i++) if (worldBeats(worlds[i][seat], cl)) n++;
  const p = n / worlds.length;
  return p < 0.02 ? 0.02 : (p > 0.98 ? 0.98 : p);
}

/* IPF:在「每家剩几张」和「每门还剩几张」两组边际下,拟合各家各门的期望张数。
 * 已知断门的格子锁 0。w[seat][suit] = 某一张该门暗牌落在这家手上的概率。 */
const SUITKEYS = ['T', 'S', 'H', 'D', 'C'];
function buildHandModel(a, cfg) {
  if (a.w) return a.w;
  const me = a.seat;
  const rows = [];                                     // 0..2 = 三个对手/队友,3 = 底牌
  for (let p = 0; p < 4; p++) if (p !== me) rows.push({ seat: p, total: Math.max(0, a.hsize[p]) });
  rows.push({ seat: -1, total: a.kittyUnknown });
  const R = rows.length;
  const x = [];
  for (let i = 0; i < R; i++) {
    const r = [];
    for (let j = 0; j < 5; j++) {
      const blocked = rows[i].seat >= 0 && a.voids[rows[i].seat][SUITKEYS[j]];
      r.push(blocked ? 0 : 1);
    }
    x.push(r);
  }
  const colT = [];
  for (let j = 0; j < 5; j++) colT.push(a.nSuit[SUITKEYS[j]]);
  for (let it = 0; it < cfg.ipfIters; it++) {
    for (let i = 0; i < R; i++) {
      let s0 = 0;
      for (let j = 0; j < 5; j++) s0 += x[i][j];
      const f = s0 > 1e-9 ? rows[i].total / s0 : 0;
      for (let j = 0; j < 5; j++) x[i][j] *= f;
    }
    for (let j = 0; j < 5; j++) {
      let s0 = 0;
      for (let i = 0; i < R; i++) s0 += x[i][j];
      const f = s0 > 1e-9 ? colT[j] / s0 : 0;
      for (let i = 0; i < R; i++) x[i][j] *= f;
    }
  }
  const w = [{}, {}, {}, {}];
  for (let i = 0; i < R; i++) {
    if (rows[i].seat < 0) continue;
    for (let j = 0; j < 5; j++) {
      const n = colT[j];
      let v = n > 0 ? x[i][j] / n : 0;
      if (v < 0) v = 0; if (v > 1) v = 1;
      w[rows[i].seat][SUITKEYS[j]] = v;
    }
  }
  a.w = w;
  return w;
}

/* 用 IPF 权重估「这一家压得住 cl」的概率 */
function pOppBeatsModel(a, cl, seat, trump, cfg) {
  const es = cl.suit;
  const w = buildHandModel(a, cfg)[seat][es] || 0;
  let p = 0;
  if (cl.type === 'single') {
    const k = beatersLeft(a, cl.cards[0], trump);
    p = 1 - Math.pow(1 - w, k);
  } else if (cl.type === 'pair' || cl.type === 'tractor') {
    const slots = pairBeatersLeft(a, cl.top, es, trump);
    const pp = w * w;
    if (cl.type === 'pair') p = 1 - Math.pow(1 - pp, slots);
    else {
      const per = Math.pow(pp, cl.len);
      const chains = Math.max(0, slots - cl.len + 1);
      p = 1 - Math.pow(1 - per, chains);
    }
  } else {
    let q = 1;
    for (let i = 0; i < cl.comps.length; i++) {
      const c = cl.comps[i];
      q *= (1 - pOppBeatsModel(a, { type: c.type, suit: es, top: c.top, cards: c.cards, len: c.len }, seat, trump, cfg));
    }
    p = 1 - q;
  }
  if (es !== 'T') {
    const nS = a.nSuit[es] || 0;
    const pVoid = a.voids[seat][es] ? 1 : Math.pow(1 - w, nS);
    const wt = buildHandModel(a, cfg)[seat]['T'] || 0;
    const nT = a.nSuit['T'] || 0;
    const pHasT = 1 - Math.pow(1 - wt, nT);
    let pRuff = pVoid * pHasT;
    if (cl.type !== 'single') pRuff *= cfg.ruffPairFactor;
    p = 1 - (1 - p) * (1 - pRuff);
  }
  return p < 0 ? 0 : (p > 0.98 ? 0.98 : p);
}

/* 这一家可能持有的暗牌总数(去掉他已知断掉的门) */
function poolFor(a, seat, trump, hidden) {
  let out = hidden;
  const keys = ['T', 'S', 'H', 'D', 'C'];
  for (let ki = 0; ki < keys.length; ki++) {
    if (!a.voids[seat][keys[ki]]) continue;
    out -= unseenInSuit(a, keys[ki], trump);
  }
  return out > 1 ? out : 1;
}

/* 某一家压住结构 cl 的概率 */
function oracleBeats(cfg, cl, seat, trump) {
  const h = cfg.oracleHands()[seat];
  const es = cl.suit;
  const sc = E.filterSuit(h, es, trump);
  if (sc.length > 0) {
    if (cl.type === 'throw') {
      for (let i = 0; i < cl.comps.length; i++) if (E.canBeatComp(sc, cl.comps[i], trump)) return true;
      return false;
    }
    return E.canBeatComp(sc, { type: cl.type, top: cl.top, len: cl.len, cards: cl.cards }, trump);
  }
  if (es === 'T') return false;
  const tc = E.filterSuit(h, 'T', trump);
  if (!tc.length) return false;
  if (cl.type === 'single') return true;
  if (cl.type === 'pair') return E.canBeatComp(tc, { type: 'pair', top: -1, cards: cl.cards }, trump);
  if (cl.type === 'tractor') return E.canBeatComp(tc, { type: 'tractor', top: -1, len: cl.len, cards: cl.cards }, trump);
  return true;
}

function pOppBeats(a, cl, hSize, hidden0, seat, trump, cfg) {
  const es = cl.suit;
  if (cfg.__probe && cfg.oracleHands) {
    const truth = oracleBeats(cfg, cl, seat, trump) ? 1 : 0;
    const pMC = pOppBeatsMC(a, cfg.__view, cl, seat, cfg);
    const hid = poolFor(a, seat, trump, hidden0);
    const pCF = pClosedForm(a, cl, hSize, hid, seat, trump, cfg);
    const pIPF = pOppBeatsModel(a, cl, seat, trump, cfg);
    cfg.__probe(truth, pCF, pMC, pIPF, cl, a, seat, trump, hSize);
  }
  if (cfg.oracle && cfg.oracleHands && hSize <= cfg.oracleMaxCards && hSize >= cfg.oracleMinCards) {
    const h = cfg.oracleHands()[seat];
    const sc = E.filterSuit(h, es, trump);
    let can = false;
    if (cl.type === 'throw') {
      for (let i = 0; i < cl.comps.length && !can; i++) can = E.canBeatComp(sc, cl.comps[i], trump);
    } else {
      can = E.canBeatComp(sc, { type: cl.type, top: cl.top, len: cl.len, cards: cl.cards }, trump);
    }
    if (!can && es !== 'T' && sc.length === 0) {
      const tc = E.filterSuit(h, 'T', trump);
      if (tc.length) {
        can = cl.type === 'single' ? true
          : E.canBeatComp(tc, { type: cl.type, top: -1, len: cl.len, cards: cl.cards }, trump);
      }
    }
    return can ? 0.95 : 0.02;
  }
  if (cfg.mcModel && cfg.__view) return pOppBeatsMC(a, cfg.__view, cl, seat, cfg);
  if (cfg.handModel) return pOppBeatsModel(a, cl, seat, trump, cfg);
  const hidden = cfg.voidAwarePool ? poolFor(a, seat, trump, hidden0) : hidden0;
  return pClosedForm(a, cl, hSize, hidden, seat, trump, cfg);
}

function pClosedForm(a, cl, hSize, hidden, seat, trump, cfg) {
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
    const known = a.voids[seat][es];
    const pVoid = known ? 1 : pNone(nSuit, hSize, hidden);
    const nT = unseenInSuit(a, 'T', trump);
    /* 已经断了这门,他的暗牌池里就没有这门的牌了 —— 主牌密度更高 */
    const poolGV = cfg.ruffFix ? Math.max(1, hidden - (known ? 0 : nSuit)) : hidden;
    const pHasT = 1 - pNone(nT, hSize, poolGV);
    let pRuff = pVoid * pHasT;
    if (cl.type !== 'single') pRuff *= cfg.ruffPairFactor;
    /* 「本门有更大的牌」和「本门断了」是互斥事件,不能用 noisy-OR */
    p = cfg.ruffFix ? p + pRuff : 1 - (1 - p) * (1 - pRuff);
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



/* 出完 cd 之后,我手上还剩几个「打得出去的赢张」。
 * 一张不剩 = 拿到先手只能往对手枪口上撞。 */
function tempoFactor(cfg, a, view, cd, trump) {
  if (!cfg.dynTempo) return 1;
  const ids = new Set();
  for (let i = 0; i < cd.length; i++) ids.add(cd[i].id);
  const rest = [];
  for (let i = 0; i < view.hand.length; i++) if (!ids.has(view.hand[i].id)) rest.push(view.hand[i]);
  if (rest.length === 0) return 1;
  let nWin = 0;
  const g = M.bySuit(rest, trump);
  const keys = ['T', 'S', 'H', 'D', 'C'];
  for (let ki = 0; ki < keys.length && nWin < cfg.dynTempoFull; ki++) {
    const cs = g[keys[ki]];
    for (let i = 0; i < cs.length && nWin < cfg.dynTempoFull; i++) {
      if (beatersLeft(a, cs[i], trump) === 0) nWin++;
    }
  }
  if (nWin === 0) return cfg.dynTempoFloor;
  return Math.min(1, nWin / cfg.dynTempoFull);
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
/* 每次决策只算一次的手牌摘要 */
function handSummary(view, trump) {
  const hand = view.hand;
  const inHand = new Map();
  const suitCnt = {};
  let nTrump = 0;
  for (let i = 0; i < hand.length; i++) {
    const k = hand[i].suit + '/' + hand[i].rank;
    inHand.set(k, (inHand.get(k) || 0) + 1);
    const es = E.effSuit(hand[i], trump);
    if (es === 'T') nTrump++; else suitCnt[es] = (suitCnt[es] || 0) + 1;
  }
  return { inHand: inHand, suitCnt: suitCnt, nTrump: nTrump };
}

function structCost(cfg, a, view, cd, trump, hsum) {
  if (!cfg.breakPairW && !cfg.voidGainW) return 0;
  const hand = view.hand;
  let cost = 0;
  if (cfg.breakPairW) {
    const inHand = hsum ? hsum.inHand : handSummary(view, trump).inHand;
    const inPlay = new Map();
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
    const hs2 = hsum || handSummary(view, trump);
    const nTrump = hs2.nTrump;
    if (nTrump >= 3) {
      const cnt = hs2.suitCnt;
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


/* ---------------- 残局采样走子(rollout) ---------------- */

function rngFrom(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 采 K 个与「各家剩几张 + 已知断门」一致的世界(我的手牌是真的,其余是采样的) */
function sampleWorlds(a, view, cfg, kOverride) {
  const trump = a.trump, me = view.seat;
  const pool = [];
  let fake = 1000;
  for (let si = 0; si < 5; si++) {
    const suit = si === 4 ? 'X' : ALLSUITS[si];
    const lo = si === 4 ? 15 : 2, hi = si === 4 ? 16 : 14;
    for (let r = lo; r <= hi; r++) {
      for (let q = 0; q < a.unseen[si * 17 + r]; q++) pool.push({ suit: suit, rank: r, id: fake++ });
    }
  }
  const seats = [];
  for (let p = 0; p < 4; p++) if (p !== me) seats.push(p);
  const caps0 = [];
  for (let i = 0; i < seats.length; i++) caps0.push(Math.max(0, a.hsize[seats[i]]));
  caps0.push(Math.max(0, a.kittyUnknown));
  const H = caps0.length;
  const allow = [];
  for (let i = 0; i < pool.length; i++) {
    const es = E.effSuit(pool[i], trump);
    const l = [];
    for (let h = 0; h < H; h++) { if (h < seats.length && a.voids[seats[h]][es]) continue; l.push(h); }
    allow.push(l.length ? l : [H - 1]);
  }
  const order = [];
  for (let i = 0; i < pool.length; i++) order.push(i);
  order.sort(function (x, y) { return allow[x].length - allow[y].length; });
  let seed = view.history.length * 7919 + me * 131 + view.hand.length * 31;
  for (let i = 0; i < view.hand.length; i++) seed = (seed * 33 + view.hand[i].id) | 0;
  const rng = rngFrom(seed);
  const out = [];
  const K = kOverride || cfg.rolloutK;
  for (let k = 0; k < K; k++) {
    const caps = caps0.slice();
    const buckets = [];
    for (let h = 0; h < H; h++) buckets.push([]);
    for (let i = order.length - 1; i > 0; i--) {
      if (allow[order[i]].length !== allow[order[i - 1]].length) continue;
      const j = rng() < 0.5 ? i - 1 : i;
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    for (let oi = 0; oi < order.length; oi++) {
      const ci = order[oi], l = allow[ci];
      let tot = 0;
      for (let i = 0; i < l.length; i++) tot += caps[l[i]];
      let pick = -1;
      if (tot > 0) {
        let r = rng() * tot;
        for (let i = 0; i < l.length; i++) { r -= caps[l[i]]; if (r <= 0) { pick = l[i]; break; } }
        if (pick < 0) pick = l[l.length - 1];
      } else {
        for (let h = 0; h < H; h++) if (caps[h] > 0) { pick = h; break; }
        if (pick < 0) pick = H - 1;
      }
      caps[pick]--;
      buckets[pick].push(pool[ci]);
    }
    const hands = [null, null, null, null];
    hands[me] = view.hand;
    for (let i = 0; i < seats.length; i++) hands[seats[i]] = buckets[i];
    out.push(hands);
  }
  return out;
}

function dropIds(hand, idset) {
  const out = [];
  for (let i = 0; i < hand.length; i++) if (!idset.has(hand[i].id)) out.push(hand[i]);
  return out;
}

/* 走子策略:能赢且值钱就赢,队友赢就送分,否则出最废的 */
function quickMove(hands, seat, trump, plays, leadCl, smart, rich) {
  if (!leadCl) {
    const opts = M.quickLeadOptions(hands[seat], trump, rich);
    let best = null, bv = -1e9;
    for (let i = 0; i < opts.length; i++) {
      const cd = opts[i];
      const cl = E.classify(cd, trump);
      if (!cl) continue;
      let v;
      if (smart) {
        let beaten = false;
        for (let k = 1; k < 4 && !beaten; k++) {
          const p = (seat + k) % 4;
          if ((p % 2) === (seat % 2)) continue;
          const sc = E.filterSuit(hands[p], cl.suit, trump);
          if (sc.length) {
            if (E.canBeatComp(sc, cl, trump)) beaten = true;
          } else if (cl.suit !== 'T') {
            const tc = E.filterSuit(hands[p], 'T', trump);
            if (tc.length && (cl.type === 'single' ||
                E.canBeatComp(tc, { type: cl.type, top: -1, len: cl.len, cards: cl.cards }, trump))) beaten = true;
          }
        }
        v = (beaten ? -6 : 12) + cd.length * 2 - E.countPoints(cd) * (beaten ? 1.5 : 0) - cl.top * 0.25;
      } else {
        v = cl.top + cd.length * 2 - E.countPoints(cd) * 0.8 - (cl.suit === 'T' ? 3 : 0);
      }
      if (v > bv) { bv = v; best = cd; }
    }
    return best || M.forceLegalLead(hands[seat], trump);
  }
  const opts = M.quickFollowOptions(hands[seat], leadCl, trump);
  let pts = 0;
  for (let i = 0; i < plays.length; i++) pts += E.countPoints(plays[i].cards);
  const nLater = 3 - plays.length;
  const lsig = E.sigOf(leadCl);
  let pBest = leadCl, pWin = plays[0].seat;
  for (let i = 1; i < plays.length; i++) {
    const cl = E.classify(plays[i].cards, trump);
    if (!cl || E.sigOf(cl) !== lsig) continue;
    if (cl.suit === pBest.suit) { if (cl.top > pBest.top) { pBest = cl; pWin = plays[i].seat; } }
    else if (cl.suit === 'T') { pBest = cl; pWin = plays[i].seat; }
  }
  let best = null, bv = -1e9;
  for (let i = 0; i < opts.length; i++) {
    const cd = opts[i];
    const mc = E.classify(cd, trump);
    let take = false;
    if (mc && E.sigOf(mc) === lsig) {
      if (mc.suit === pBest.suit) take = mc.top > pBest.top;
      else if (mc.suit === 'T') take = true;
    }
    let mine = ((take ? seat : pWin) % 2) === (seat % 2);
    /* 我(或队友)现在领先,但后面还有对手没出 —— 在这个世界里查一下压不压得回来 */
    if (smart === 2 && mine && nLater > 0) {
      const curCl = take ? mc : pBest;
      for (let k2 = 1; k2 <= nLater && mine; k2++) {
        const p = (seat + k2) % 4;
        if ((p % 2) === (seat % 2)) continue;
        const sc = E.filterSuit(hands[p], curCl.suit, trump);
        if (sc.length) {
          if (E.canBeatComp(sc, curCl, trump)) mine = false;
        } else if (curCl.suit !== 'T') {
          const tc = E.filterSuit(hands[p], 'T', trump);
          if (tc.length && (curCl.type === 'single' ||
              E.canBeatComp(tc, { type: curCl.type, top: -1, len: curCl.len, cards: curCl.cards }, trump))) mine = false;
        }
      }
    }
    let v = mine ? 40 + (pts + E.countPoints(cd)) * 2 : -E.countPoints(cd) * 3;
    for (let j = 0; j < cd.length; j++) {
      v -= E.ordIdx(cd[j], trump) * 0.3 + (E.effSuit(cd[j], trump) === 'T' ? 2 : 0);
    }
    if (v > bv) { bv = v; best = cd; }
  }
  return best || M.forceLegalFollow(hands[seat], leadCl, trump, null);
}

/* 从当前局面走到这一局结束,返回「对我方的净分」 */
function playoutValue(hands0, trump, plays0, leader, myTeam, kittyPts, declTeam, smart, rich) {
  const H = [hands0[0].slice(), hands0[1].slice(), hands0[2].slice(), hands0[3].slice()];
  const teamPts = [0, 0];
  let cur = plays0.slice();
  let lead = E.classify(cur[0].cards, trump);
  let ldr = leader;
  let lastWinner = -1, lastSize = 1, guard = 0;
  for (; guard < 30; guard++) {
    while (cur.length < 4) {
      const seat = (ldr + cur.length) % 4;
      const cd = quickMove(H, seat, trump, cur, lead, smart, rich);
      const ids = new Set();
      for (let i = 0; i < cd.length; i++) ids.add(cd[i].id);
      H[seat] = dropIds(H[seat], ids);
      cur.push({ seat: seat, cards: cd });
    }
    const r = E.resolveTrick(cur, trump);
    teamPts[r.winner % 2] += r.points;
    lastWinner = r.winner; lastSize = lead.cards.length;
    ldr = r.winner;
    if (H[ldr].length === 0) break;
    const lc = quickMove(H, ldr, trump, [], null, smart, rich);
    const ids2 = new Set();
    for (let i = 0; i < lc.length; i++) ids2.add(lc[i].id);
    H[ldr] = dropIds(H[ldr], ids2);
    lead = E.classify(lc, trump);
    cur = [{ seat: ldr, cards: lc }];
  }
  const defTeam = 1 - declTeam;
  let def = teamPts[defTeam];
  if ((lastWinner % 2) === defTeam) def += kittyPts * 2 * lastSize;
  return (myTeam === defTeam) ? def : -def;
}


/* 一方手上还剩多少「打得出去的东西」—— 截断前瞻的终局评价 */
function handStrength(hand, a, trump, cfg) {
  let v = 0;
  for (let i = 0; i < hand.length; i++) v += cardValue(a, hand[i], trump, cfg);
  return v;
}

/* 每个世界的初始队伍强度只算一次:终局强度 = 初始强度 − 这几墩打出去的牌的价值。
 * 和「走完之后重新把四家手牌加一遍」完全等价,但代价从 O(全部手牌) 降到 O(打出的牌)。 */
function worldTeamStrength(hands, a, trump, cfg) {
  const s = [0, 0];
  for (let p = 0; p < 4; p++) s[p % 2] += handStrength(hands[p], a, trump, cfg);
  return s;
}

/* 截断走子:只推 maxTricks 墩,然后用两边剩牌的强度差收尾。
 * 返回「对我方的价值」,单位和分数同量级。 */
function truncPlayout(hands0, trump, plays0, leader, myTeam, maxTricks, a, cfg, baseStrength) {
  const H = [hands0[0].slice(), hands0[1].slice(), hands0[2].slice(), hands0[3].slice()];
  const teamPts = [0, 0];
  const spent = [0, 0];
  let cur = plays0.slice();
  /* plays0 里我已经出的那一手也要计进去 */
  for (let i = 0; i < cur.length; i++) {
    for (let j = 0; j < cur[i].cards.length; j++) spent[cur[i].seat % 2] += cardValue(a, cur[i].cards[j], trump, cfg);
  }
  let lead = E.classify(cur[0].cards, trump);
  let ldr = leader;
  let done = 0;
  while (done < maxTricks) {
    while (cur.length < 4) {
      const seat = (ldr + cur.length) % 4;
      const cd = quickMove(H, seat, trump, cur, lead, cfg.rolloutSmartLead ? 1 : 0, false);
      const ids = new Set();
      for (let i = 0; i < cd.length; i++) {
        ids.add(cd[i].id);
        spent[seat % 2] += cardValue(a, cd[i], trump, cfg);
      }
      H[seat] = dropIds(H[seat], ids);
      cur.push({ seat: seat, cards: cd });
    }
    const r = E.resolveTrick(cur, trump);
    teamPts[r.winner % 2] += r.points;
    ldr = r.winner;
    done++;
    if (H[ldr].length === 0) break;
    if (done >= maxTricks) break;
    const lc = quickMove(H, ldr, trump, [], null, cfg.rolloutSmartLead ? 1 : 0, false);
    const ids2 = new Set();
    for (let i = 0; i < lc.length; i++) {
      ids2.add(lc[i].id);
      spent[ldr % 2] += cardValue(a, lc[i], trump, cfg);
    }
    H[ldr] = dropIds(H[ldr], ids2);
    lead = E.classify(lc, trump);
    cur = [{ seat: ldr, cards: lc }];
  }
  const mine = baseStrength[myTeam] - spent[myTeam];
  const theirs = baseStrength[1 - myTeam] - spent[1 - myTeam];
  return (teamPts[myTeam] - teamPts[1 - myTeam]) + cfg.midTermW * (mine - theirs);
}

/* 中前期领出:对静态分最高的几个候选做截断前瞻 */
function midLookPick(cfg, a, view, scored) {
  if (scored.length < 2) return null;
  scored.sort(function (x, y) { return y.sc - x.sc; });
  const m = Math.min(cfg.midM, scored.length);
  if (m < 2) return null;
  const worlds = sampleWorlds(a, view, cfg, cfg.midK);
  const trump = a.trump;
  /* 每个世界的初始队伍强度只算一次,所有候选共用 */
  const base = [];
  for (let w = 0; w < worlds.length; w++) base.push(worldTeamStrength(worlds[w], a, trump, cfg));
  let best = scored[0].cd, bv = -1e9;
  for (let i = 0; i < m; i++) {
    const cd = scored[i].cd;
    const ids = new Set();
    for (let j = 0; j < cd.length; j++) ids.add(cd[j].id);
    let tot = 0;
    for (let w = 0; w < worlds.length; w++) {
      const hands = worlds[w].slice();
      hands[view.seat] = dropIds(hands[view.seat], ids);
      tot += truncPlayout(hands, trump, [{ seat: view.seat, cards: cd }], view.seat,
        view.myTeam, cfg.midTricks, a, cfg, base[w]);
    }
    if (tot > bv) { bv = tot; best = cd; }
  }
  return best;
}

/* 对静态分最高的几个候选做采样走子,返回胜出的那一个 */
function rolloutPick(cfg, a, view, scored, plays, leadCl) {
  if (scored.length < 2) return scored.length ? scored[0].cd : null;
  scored.sort(function (x, y) { return y.sc - x.sc; });
  let m = Math.min(cfg.rolloutM, scored.length);
  if (cfg.rolloutMargin > 0) {
    const top = scored[0].sc;
    let n = 1;
    while (n < m && top - scored[n].sc <= cfg.rolloutMargin) n++;
    if (n < 2) return scored[0].cd;          // 静态分遥遥领先,不必精算
    m = n;
  }
  const worlds = sampleWorlds(a, view, cfg);
  const trump = a.trump;
  const declTeam = view.declSeat % 2;
  const kp = (view.buriedKnown && view.buriedKnown.length)
    ? E.countPoints(view.buriedKnown) : cfg.rolloutKittyPrior;
  let best = scored[0].cd, bv = -1e9;
  for (let i = 0; i < m; i++) {
    const cd = scored[i].cd;
    const ids = new Set();
    for (let j = 0; j < cd.length; j++) ids.add(cd[j].id);
    let tot = 0;
    for (let w = 0; w < worlds.length; w++) {
      const hands = worlds[w].slice();
      hands[view.seat] = dropIds(hands[view.seat], ids);
      const pl = plays ? plays.concat([{ seat: view.seat, cards: cd }]) : [{ seat: view.seat, cards: cd }];
      const ldr = plays ? plays[0].seat : view.seat;
      tot += playoutValue(hands, trump, pl, ldr, view.myTeam, kp, declTeam,
        cfg.rolloutSmartFollow ? 2 : (cfg.rolloutSmartLead ? 1 : 0), cfg.rolloutRichLead);
    }
    if (tot > bv) { bv = tot; best = cd; }
  }
  return best;
}

/* ---------------- evalV2:领出 ---------------- */

function leadV2(cfg, view) {
  const trump = view.trump;
  const hand = view.hand;
  if (cfg.mcModel || cfg.__probe) cfg.__view = view;
  const a = analyze(view, cfg.__cache); cfg.__cache = a.cache;
  const H = hand.length;
  const hidden = a.hiddenTotal;
  const opps = [(view.seat + 1) % 4, (view.seat + 3) % 4];
  const isDecl = view.myTeam === (view.declSeat % 2);
  const LOSSW = (isDecl ? cfg.declLossW : cfg.defLossW) || cfg.lossW;
  const TEMPOW = (isDecl ? cfg.declTempoW : cfg.defTempoW) || cfg.tempoW;
  const myTrumps = countTrump(hand, trump);
  const trumpLeft = unseenInSuit(a, 'T', trump);

  const PS = ptsScale(a, view, cfg);
  const HSUM = handSummary(view, trump);
  let cands = M.genLeadCandidates(hand, trump);
  const thr = M.genThrowCandidates(hand, trump, 30);
  for (let i = 0; i < thr.length; i++) cands.push(thr[i]);
  if (cfg.maxSafeThrow) {
    const gs = M.bySuit(hand, trump);
    const keys = ['T', 'S', 'H', 'D', 'C'];
    for (let ki = 0; ki < keys.length; ki++) {
      const cs = gs[keys[ki]];
      if (cs.length < 3) continue;
      const comps = E.decompose(cs, trump);
      if (comps.length < 2) continue;
      const pick = [];
      let nc = 0;
      for (let i = 0; i < comps.length; i++) {
        const c = comps[i];
        const sure = c.type === 'single'
          ? beatersLeft(a, c.cards[0], trump) === 0
          : pairBeatersLeft(a, c.top, keys[ki], trump) === 0;
        if (sure) { nc++; for (let j = 0; j < c.cards.length; j++) pick.push(c.cards[j]); }
      }
      if (nc >= 2) cands.push(pick);
    }
  }

  let best = null, bestScore = -1e9;
  const useRoll = cfg.rollout && hand.length <= (cfg.rolloutMaxCardsLead || cfg.rolloutMaxCards);
  const useMid = !useRoll && cfg.midLook && hand.length >= cfg.midMinCards && hand.length <= cfg.midMaxCards;
  const scored = useRoll ? [] : null;
  const scoredMid = useMid ? [] : null;
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
      if (cfg.noThrow) continue;
      if (cfg.safeThrowOnly) {
        let allSure = true;
        for (let j = 0; j < cl.comps.length; j++) {
          const c = cl.comps[j];
          const nb = c.type === 'single'
            ? beatersLeft(a, c.cards[0], trump)
            : pairBeatersLeft(a, c.top, cl.suit, trump);
          if (nb > cfg.throwMaxBeaters) { allSure = false; break; }
        }
        if (!allSure) continue;
      }
    }

    let pWin = 1;
    for (let j = 0; j < 2; j++) pWin *= (1 - pOppBeats(a, cl, H, hidden, opps[j], trump, cfg));
    if (cfg.partnerRescueW) {
      const pr = pOppBeats(a, cl, H, hidden, (view.seat + 2) % 4, trump, cfg);
      pWin = pWin + (1 - pWin) * pr * cfg.partnerRescueW;
      if (pWin > 0.98) pWin = 0.98;
    }

    const myPts = E.countPoints(cd);
    const evWin = myPts + L * cfg.leadWinPts;
    const evLose = myPts + L * cfg.leadLosePts;
    let sc = (pWin * evWin - (1 - pWin) * evLose) * PS;
    sc += pWin * TEMPOW * tempoFactor(cfg, a, view, cd, trump);
    sc += lastTrickSwing(cfg, view, L, pWin);

    let spent = 0;
    for (let j = 0; j < L; j++) spent += cardValue(a, cd[j], trump, cfg);
    sc -= (1 - pWin) * spent * LOSSW;
    sc -= spent * cfg.overkillW;
    sc -= structCost(cfg, a, view, cd, trump, HSUM);
    if (cfg.ptsUrgencyLead && myPts > 0) {
      const urg = 1 - hand.length / 25;
      sc += (1 - pWin) * myPts * cfg.ptsUrgencyLead * urg;
    }

    if (cl.type === 'throw') sc += cfg.throwBonus * (cfg.throwNeedsWin ? pWin : 1);
    if (cfg.longSuitW && cl.suit !== 'T') {
      /* 本门我有 m 张、外面还有 u 张:外面出完之后我的小牌都变成赢张 */
      let m = 0;
      for (let j = 0; j < hand.length; j++) if (E.effSuit(hand[j], trump) === cl.suit) m++;
      const u = unseenInSuit(a, cl.suit, trump);
      const est = m - u / 2;
      if (est > 0) sc += cfg.longSuitW * Math.min(est, 4);
    }
    if (cl.suit === 'T') {
      if (isDecl && trumpLeft > 0 && myTrumps >= 6) {
        let b = cfg.drawTrumpW * Math.min(1, myTrumps / 10) * Math.min(1, trumpLeft / 8);
        if (cfg.drawTrumpNeedsWin) b *= pWin;
        if (cfg.drawTrumpPerCard) b *= (1 + cfg.drawTrumpPerCard * (L - 1));
        sc += b;
      }
    }
    if (useRoll) scored.push({ cd: cd, sc: sc });
    if (useMid) scoredMid.push({ cd: cd, sc: sc });
    if (sc > bestScore) { bestScore = sc; best = cd; }
  }
  if (useRoll && scored.length > 1) {
    const r = rolloutPick(cfg, a, view, scored, null, null);
    if (r) return r;
  }
  if (useMid && scoredMid.length > 1) {
    const r = midLookPick(cfg, a, view, scoredMid);
    if (r) return r;
  }
  if (!best) best = M.forceLegalLead(hand, trump);
  return best;
}

/* ---------------- evalV2:跟牌 ---------------- */

function followV2(cfg, view, plays) {
  const trump = view.trump;
  const hand = view.hand;
  if (cfg.mcModel || cfg.__probe) cfg.__view = view;
  const lead0 = E.classify(plays[0].cards, trump);
  if (!lead0) return M.forceLegalFollow(hand, { cards: plays[0].cards, suit: 'T', type: 'single' }, trump, null);
  const a = analyze(view, cfg.__cache); cfg.__cache = a.cache;
  const H = hand.length;
  const hidden = a.hiddenTotal;
  const L = lead0.cards.length;
  const cands = M.genFollowCandidates(hand, lead0, trump, null, cfg.followCap, cfg.fillCap);

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
  const HSUM = handSummary(view, trump);
  /* 先把已出的几手定型,循环里只 classify 我自己的候选 */
  const leadSig = E.sigOf(lead0);
  let preBest = lead0, preWinIdx = 0, prePts = E.countPoints(plays[0].cards);
  for (let i = 1; i < plays.length; i++) {
    prePts += E.countPoints(plays[i].cards);
    const cl = E.classify(plays[i].cards, trump);
    if (!cl || E.sigOf(cl) !== leadSig) continue;
    if (cl.suit === preBest.suit) { if (cl.top > preBest.top) { preBest = cl; preWinIdx = i; } }
    else if (cl.suit === 'T') { preBest = cl; preWinIdx = i; }
  }
  const isDecl2 = view.myTeam === (view.declSeat % 2);
  const LOSSW = (isDecl2 ? cfg.declLossW : cfg.defLossW) || cfg.lossW;
  const TEMPOW = (isDecl2 ? cfg.declTempoW : cfg.defTempoW) || cfg.tempoW;

  let best = null, bestScore = -1e9;
  const useRoll = cfg.rollout && hand.length <= cfg.rolloutMaxCards && cands.length > 1;
  const scored = useRoll ? [] : null;
  for (let i = 0; i < cands.length; i++) {
    const cd = cands[i];
    const myCl = E.classify(cd, trump);
    let iTake = false;
    if (myCl && E.sigOf(myCl) === leadSig) {
      if (myCl.suit === preBest.suit) iTake = myCl.top > preBest.top;
      else if (myCl.suit === 'T') iTake = true;
    }
    const winCl = iTake ? myCl : preBest;
    const winner = iTake ? view.seat : plays[preWinIdx].seat;
    const myPts = E.countPoints(cd);
    const mineWins = (winner % 2) === view.myTeam;

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
          pm *= (1 - pOppBeats(a, winCl, H, hidden, laterOpp[j], trump, cfg)) * cfg.mateLaterFactor;
        }
        pTeam = pm;
      }
    }

    let sc;
    if (cfg.followSplitEV) {
      let winLater = 0, loseLater = 0;
      for (let j = 0; j < laterSeats.length; j++) {
        const isMate = laterSeats[j] % 2 === view.myTeam;
        winLater += L * (isMate ? cfg.partnerDumpRate : cfg.oppAvoidRate);
        loseLater += L * (isMate ? cfg.mateAvoidRate : cfg.oppDumpRate);
      }
      const base = ptsOnTable + myPts;
      sc = (pTeam * (base + winLater) - (1 - pTeam) * (base + loseLater)) * PS;
    } else {
      const expLater = laterSeats.length * L * cfg.ptsPerCardLater;
      const total = ptsOnTable + myPts + expLater;
      sc = (2 * pTeam - 1) * total * PS;
    }
    sc += pTeam * TEMPOW * 0.5 * tempoFactor(cfg, a, view, cd, trump);
    sc += lastTrickSwing(cfg, view, L, pTeam);

    let spent = 0;
    for (let j = 0; j < cd.length; j++) spent += cardValue(a, cd[j], trump, cfg);
    sc -= (1 - pTeam) * spent * LOSSW;
    sc -= spent * cfg.overkillW;
    sc -= structCost(cfg, a, view, cd, trump, HSUM);
    if (cfg.ptsUrgency && myPts > 0) {
      const urg = 1 - hand.length / 25;
      sc += (1 - pTeam) * myPts * cfg.ptsUrgency * urg;
    }

    if (useRoll) scored.push({ cd: cd, sc: sc });
    if (sc > bestScore) { bestScore = sc; best = cd; }
  }
  if (useRoll && scored.length > 1) {
    const r = rolloutPick(cfg, a, view, scored, plays, lead0);
    if (r && E.isLegalFollow(hand, lead0, r, trump, null)) return r;
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
  /* 兜底计数器。五个方法都用 try/catch 包着,任何异常都会被静默换成
   * 「最笨的合法着法」—— 局照打、零违规,但棋力会被打回原形。
   * 这里把兜底次数记下来,开发期一眼就能看见,不然这种 bug 会藏很久
   * (自对弈 A/B 对「两边一起变差」是结构性失明的)。 */
  const fb = { deal: 0, rebel: 0, discard: 0, lead: 0, follow: 0 };
  return {
    name: config && config.name ? config.name : 'claude-opus-5',
    cfg: cfg,
    fallbacks: fb,
    onDeal: function (view) { try { return cfg.declV2 ? onDealV2(cfg, view) : onDeal(cfg, view); } catch (e) { fb.deal++; return null; } },
    onRebel: function (view) { try { return onRebel(cfg, view); } catch (e) { fb.rebel++; return false; } },
    discard: function (view) {
      try {
        const d = cfg.discV2 ? discardV2(cfg, view) : discard(cfg, view);
        if (d && d.length === 8) return d;
      } catch (e) { }
      fb.discard++;
      const h = view.hand.slice().sort(function (x, y) { return M.junkScore(x, view.trump) - M.junkScore(y, view.trump); });
      return h.slice(0, 8);
    },
    lead: function (view) {
      try {
        const l = cfg.evalV2 ? leadV2(cfg, view) : lead(cfg, view);
        if (l && l.length && E.classify(l, view.trump)) return l;
      } catch (e) { }
      fb.lead++;
      return M.forceLegalLead(view.hand, view.trump);
    },
    follow: function (view, plays) {
      const lead0 = E.classify(plays[0].cards, view.trump);
      try {
        const f = cfg.evalV2 ? followV2(cfg, view, plays) : follow(cfg, view, plays);
        if (f && lead0 && E.isLegalFollow(view.hand, lead0, f, view.trump, null)) return f;
      } catch (e) { }
      fb.follow++;
      return M.forceLegalFollow(view.hand, lead0, view.trump, null);
    },
  };
}

module.exports = { makeAI, DEFAULTS, analyze, beatersLeft, cardValue };
