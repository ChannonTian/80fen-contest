/* strategy2.js —— deepseek-v4-pro 第二赛季策略层。
 * 架构(综合官方陪练 DESIGN.md 与第一季复盘):
 *   记忆/推断 → 构造式候选 → 概率模型(闭式 urn) → EV 打分(阶梯效用) → 收官蒙特卡洛
 * 所有改动挂 TUNE 开关,一次只动一个,配对 matchnr 验收。
 */
'use strict';
const E = require('./engine.js');
const SMP = require('./sampler.js');
let WT = null;
try { WT = require('./wtable2.js'); } catch (e) { WT = null; }

const TUNE = {
  /* ===== 全局 ===== */
  STAIR_UTIL: true,     // 阶梯效用(scoreRound 精确台阶)替代 pointWeight 高斯近似
  LEVEL_SCALE: 40,      // 1 级 ≈ 多少分(效用与机会成本的换算)
  /* ===== 记忆/推断 ===== */
  SOFT_READS: true,     // 出牌方式演绎(cheap/dump 下界 → maxHoldIn)
  READS_DUMP: false,    // fDump 演绎开关(实验;false=旧行为)
  HOLD_RANGE: true,     // 持有区间下界
  VOID_COND: true,      // 断门条件密度(voidCondMax=2.2)
  OPP_SPEND: true,      // 对手「肯不肯花」模型(oppSpendCeil)
  /* ===== 亮主 ===== */
  BID: true,
  REBEL_ALWAYS: true,
  /* ===== 扣底 ===== */
  DISC_GREEDY: true,
  /* ===== 领出 ===== */
  LEAD_BOSS: 34, LEAD_SIZE: 8, LEAD_TRUMP_PEN: 26,
  DRAW_UNIT: 6, DRAW_CAP: 30, LEAD_WEAK_TRUMP: 14,
  TIAO_WANG: true, FEED_RUFF: true, THROW_SUBSET: true,
  /* ===== 跟牌 ===== */
  RUFF_OPP: true, RUFF_PARTNER: true, RUFF_GUARD: true,
  BLOCK_WIN: true, CASH_WIN_PTS: true, TAKE_OVER: false,
  /* ===== 收官蒙特卡洛 ===== */
  EG: true, EG_FOLLOW: true, EG_MAX_CARDS: 6, EG_SAMPLES: 40, EG_MIN: 20,
  EG_RETRIES: 24, EG_MAX_CANDS: 6, EG_MARGIN: 0.03, EG_PTS_EPS: 0.008,
  EG_KITTY_PRIOR: true,   // 差异化:世界采样按埋底策略先验加权
  EG_SOFT_SAMPLE: true,  // 差异化:软推断加权采样(Kermit 式)
  EG_OWN_MEM: true,       // 差异化:rollout 用各家自己的最小记牌
  /* ===== 权重(跟牌 EV) ===== */
  TEMPO_W: 0.35, OPP_TEMPO: 6, TEMPO_DECAY: 0.8, TEMPO_CAP: 40,
  CAPTURE_BONUS: 0,     // 吃墩候选的牌权/控制加成(贪心对照实验;0=关)
  GREEDY_CAPTURE: false, // 有吃法时只在吃法里选(贪心优先),无吃法才用全排序;实测纯贪心最优
  FOLLOW_GREEDY: true,   // 跟牌默认贪心:按候选生成顺序选(最省吃法优先),不打分排序。实测胜纯打分 +2.33±0.64 级/场(t=3.62)
  DUMP_SAFE_P: 0,       // 队友贴分确定性门槛(pSurvive(队友那手) ≥ 此值才贴;0=无条件贴,贪心默认)
  GUARD_FIRST: true,    // 毙得够高(oppSpendCeil 版)排在最小吃法前(贪心生成顺序)
  RUFF_VOID_BEHIND_SKIP: false, // 后手有已知断门对手时,贪心路径跳过毙牌候选(官方 cf-ruff:该场景不毙 +1.32~2.11/次)
  CASH_WIN_PTS2: false,   // 末家稳赢时,用同结构的分牌兑现(官方 cashPointW,v0.5.8 最大单条 +1.89 分/局)
  BID_EASE: 0,           // 亮主门槛放宽量(自对弈 +0.91 但 vs claude 组合中性 → 回退)
  W_UTIL: false,         // 整场胜率效用(官方 DESIGN §7 记录在案未实现):EG 目标加 ΔW(levels) 项
  W_SCALE: 20,           // 1 个胜率单位 ≈ 多少级数单位
  BURY_PT_MULT: 1.0,     // 埋分风险放大系数(>1 少埋分;claude 埋 3.4 分/局,我 9.1)
  LEAD_GREEDY: false,    // 领出贪心对照:boss多张>boss单张>最小副牌>最小主(实验开关)
  DUMP_PARTNER: 0.85, DUMP_OPP: 0.85, HAND_SHARE: 4,
  P_PARTNER_TAKES: 0.18, P_NO_PARTNER: 0.02,  // 0.32 是官方在其 EV 结构下标定的权重;阶梯效用下取实测救回率 0.18
  RUFF_STRUCT: [0.85, 0.45, 0.25], SIDE_RESERVE_DAMP: 0.6,
  END_KITTY_W: 5.0, KITTY_BIAS: 0.8,
  /* 结构代价 */
  BREAK_PAIR_W: 5, VOID_GAIN_W: 6,
  PAIR_BONUS: 8,       // 领出对子/拖拉机的牌型加成(实测 8 > 4:+1.35 级/场)
};

const SUITS = ['S', 'H', 'D', 'C'];
const SCORE_LADDER = [0, 40, 80, 120, 160, 200];

/* ================= 记忆与推断 ================= */

/* 一张牌的编码:suitIdx*17+rank */
const SIDX = { S: 0, H: 1, D: 2, C: 3, X: 4 };
function ccode(c) { return SIDX[c.suit] * 17 + c.rank; }

function globalIdx(c, trump) {
  const es = E.effSuit(c, trump);
  return es === 'T' ? 100 + E.ordIdx(c, trump) : E.ordIdx(c, trump);
}
function controlPremium(c, trump) {
  const es = E.effSuit(c, trump);
  if (es === 'T') {
    if (c.rank === 16) return 14;
    if (c.rank === 15) return 10;
    if (c.rank === trump.rank) return c.suit === trump.suit ? 6 : 4;
    return 0;
  }
  if (c.rank === 14) return 30;
  if (c.rank === 13) return 12;
  if (c.rank === 12) return 4;
  return 0;
}
function cheapKey(c, trump) { return globalIdx(c, trump) + (E.cardPoints(c) ? 8 : 0) + controlPremium(c, trump); }
function dumpKey(c, trump) { return -E.cardPoints(c) * 100 + globalIdx(c, trump); }

function buildTrack(view, cfg) {
  const trump = view.trump;
  const me = view.seat;
  const seen = new Int8Array(85);
  const addSeen = (cards) => { for (let i = 0; i < cards.length; i++) seen[ccode(cards[i])]++; };
  addSeen(view.hand);
  for (let i = 0; i < view.history.length; i++) addSeen(view.history[i].cards);
  if (view.buriedKnown && view.buriedKnown.length) addSeen(view.buriedKnown);

  /* 硬缺门:每墩重放 */
  const voids = [{}, {}, {}, {}];
  const reads = { fCheap: [0, 0, 0, 0], fDump: [0, 0, 0, 0] };
  let defPts = 0, tricksDone = 0;
  const hist = view.history;
  for (let t = 0; t + 4 <= hist.length; t += 4) {
    const lead = E.classify(hist[t].cards, trump);
    if (!lead) continue;
    for (let i = 1; i < 4; i++) {
      const p = hist[t + i];
      let inSuit = 0;
      for (let j = 0; j < p.cards.length; j++) if (E.effSuit(p.cards[j], trump) === lead.suit) inSuit++;
      if (inSuit < p.cards.length) voids[p.seat][lead.suit] = true;
    }
    const r = E.resolveTrick(hist.slice(t, t + 4), trump);
    if (r.winner % 2 !== (view.declSeat % 2)) defPts += r.points;
    tricksDone++;
    /* 软演绎:只在领出单张时采信 */
    if (cfg.SOFT_READS && lead.type === 'single') {
      const best = r.winningPlay;
      for (let i = 1; i < 4; i++) {
        const p = hist[t + i];
        const cl = E.classify(p.cards, trump);
        if (!cl || cl.type !== 'single') continue;
        let beat = false;
        if (cl.suit === lead.suit) { if (cl.top > lead.top) beat = true; }
        else if (cl.suit === 'T') beat = true;
        if (beat) continue;                     // 有压制意图的牌不采信
        const seat = p.seat;
        const winningTeam = (r.winner % 2) === (seat % 2);
        /* 官方口径:他那队不是暂大(这里用最终赢家近似)且打的是明显的便宜牌才采信:
         * 副牌单张、无分、非主 —— 高牌/分牌可能是贴分意图,不构成下界 */
        if (!winningTeam) {
          const c0 = p.cards[0];
          if (lead.suit !== 'T' && E.effSuit(c0, trump) === lead.suit &&
              E.cardPoints(c0) === 0 && c0.rank !== 14 && c0.rank !== 13) {
            const k = cheapKey(c0, trump);
            if (k > reads.fCheap[seat]) reads.fCheap[seat] = k;
          }
        } else if (cfg.READS_DUMP) {
          /* 他那队赢墩:非压制且非主牌 → 他的最优是贴最大分,dumpKey 构成下界 */
          const c0 = p.cards[0];
          if (lead.suit !== 'T' && E.effSuit(c0, trump) === lead.suit) {
            const k = dumpKey(c0, trump);
            if (k > reads.fDump[seat]) reads.fDump[seat] = k;
          }
        }
      }
    }
  }

  /* 未见牌 */
  const unseen = new Int8Array(85);
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) unseen[s * 17 + r] = 2;
  unseen[4 * 17 + 15] = 2; unseen[4 * 17 + 16] = 2;
  for (let i = 0; i < 85; i++) unseen[i] -= seen[i];

  /* 各家手牌数 */
  const hsize = [25, 25, 25, 25];
  for (let i = 0; i < hist.length; i++) hsize[hist[i].seat] -= hist[i].cards.length;

  /* 门级 unseen 表:esKey -> {n, unseenByRank, pairRanks} */
  const suitUnseen = (es) => {
    const out = { n: 0, cards: [] };
    for (let s = 0; s < 5; s++) {
      const suit = s === 4 ? 'X' : SUITS[s];
      const lo = s === 4 ? 15 : 2, hi = s === 4 ? 16 : 14;
      for (let r = lo; r <= hi; r++) {
        const probe = { suit: suit, rank: r };
        if (E.effSuit(probe, trump) !== es) continue;
        const cnt = unseen[s * 17 + r];
        if (cnt > 0) {
          out.n += cnt;
          for (let q = 0; q < cnt; q++) out.cards.push({ suit: suit, rank: r, ord: E.ordIdx(probe, trump) });
        }
      }
    }
    out.cards.sort((a, b) => b.ord - a.ord);
    return out;
  };
  const suitCache = { T: null, S: null, H: null, D: null, C: null };
  const getSuit = (es) => { if (!suitCache[es]) suitCache[es] = suitUnseen(es); return suitCache[es]; };

  const unseenTotal = (() => { let n = 0; for (let i = 0; i < 85; i++) n += unseen[i]; return n; })();

  /* maxHoldIn:他这门最多还能有几张(软演绎上界) */
  const maxHoldIn = (seat, es) => {
    if (!cfg.SOFT_READS) return Infinity;
    if (voids[seat][es]) return 0;
    const su = getSuit(es);
    let n = 0;
    for (let i = 0; i < su.cards.length; i++) {
      const c = su.cards[i];
      const probe = { suit: c.suit, rank: c.rank };
      const ck = cheapKey(probe, trump), dk = dumpKey(probe, trump);
      if (ck >= reads.fCheap[seat] && dk >= reads.fDump[seat]) n++;
    }
    return n;
  };

  /* pVoidOf:他在 es 门断门的概率 */
  const pVoidOf = (seat, es) => {
    if (voids[seat][es]) return 1;
    if (es === 'T') return 0;
    const su = getSuit(es);
    if (su.n === 0) return 1;
    const share = Math.max(0.02, Math.min(0.6, hsize[seat] / Math.max(1, unseenTotal)));
    const m = maxHoldIn(seat, es);
    if (m === 0) return 1;
    if (m === Infinity) return Math.pow(1 - share, su.n);
    return Math.min(0.97, Math.pow(1 - share, m));
  };

  /* 持有区间下界:lo = 手牌数 − 其他门上界和 */
  const holdLo = (seat, es) => {
    if (!cfg.HOLD_RANGE) return 0;
    if (voids[seat][es]) return 0;
    let other = 0;
    for (const k in { T: 1, S: 1, H: 1, D: 1, C: 1 }) {
      if (k === es) continue;
      const m = maxHoldIn(seat, k);
      other += m === Infinity ? getSuit(k).n : m;
    }
    return Math.max(0, hsize[seat] - other);
  };

  /* 门内在外分数(含手牌外的) */
  const unseenPtsIn = (es) => {
    const su = getSuit(es);
    let p = 0;
    for (let i = 0; i < su.cards.length; i++) p += E.cardPoints(su.cards[i]);
    return p;
  };

  /* 闲家倒推底分 */
  const kittyPtsEst = () => {
    if (view.buriedKnown && view.buriedKnown.length) return E.countPoints(view.buriedKnown);
    let sidePts = 0, sideCnt = 0;
    for (let s = 0; s < 4; s++) {
      for (let r = 2; r <= 14; r++) {
        const probe = { suit: SUITS[s], rank: r };
        if (E.effSuit(probe, trump) === 'T') continue;
        const cnt = unseen[s * 17 + r];
        sidePts += E.cardPoints(probe) * cnt;
        sideCnt += cnt;
      }
    }
    return sidePts * Math.min(1, 8 / Math.max(1, sideCnt)) * cfg.KITTY_BIAS;
  };

  const track = {
    trump, me, seen, unseen, voids, reads, defPts, tricksDone, hsize, unseenTotal,
    getSuit, maxHoldIn, pVoidOf, holdLo, unseenPtsIn, kittyPtsEst,
    declTeam: view.declSeat % 2,
    isDecl: view.myTeam === (view.declSeat % 2),
    handLen: view.hand.length,
  };
  return track;
}

/* ================= 概率模型(闭式 urn) ================= */

/* 单张:pNone(k 张目标牌,抽 h 张全没中) */
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

/* unseenBeats:该门在外 {higher:压得住 cl 的张数, total:总张数, pairRanks:更高成对点数个数} */
function unseenBeats(track, cl, trump, ceil) {
  const es = cl.suit;
  const su = track.getSuit(es);
  let higher = 0, total = su.n, pairRanks = 0;
  const pairCnt = {};
  for (let i = 0; i < su.cards.length; i++) {
    const c = su.cards[i];
    const k = c.suit + ':' + c.rank;
    pairCnt[k] = (pairCnt[k] || 0) + 1;
    if (c.ord <= cl.top) continue;
    if (ceil !== undefined && c.ord > ceil) continue;
    higher++;
    if (pairCnt[k] === 2) pairRanks++;
  }
  return { higher, total, pairRanks };
}

/* 该家压得住 cl 的概率(k = 他在该门的期望张数) */
function pBeaterIn(track, cl, k, ceil) {
  const b = unseenBeats(track, cl, track.trump, ceil);
  if (b.higher <= 0) return 0;
  if (cl.type === 'single') {
    return 1 - Math.pow(1 - b.higher / b.total, k);
  }
  const q = k >= 2 ? (k * (k - 1)) / (b.total * (b.total - 1)) : 0;
  if (cl.type === 'pair') {
    return 1 - Math.pow(1 - q, b.pairRanks);
  }
  if (cl.type === 'tractor') {
    const per = 1 - Math.pow(1 - q, b.pairRanks);
    return Math.pow(per, cl.len) * 0.6;
  }
  /* throw:任一组件被压 */
  let p = 0, qq = 1;
  for (const c of cl.comps) {
    const sub = { type: c.type, suit: cl.suit, top: c.top, len: c.len, cards: c.cards };
    qq *= (1 - pBeaterIn(track, sub, k, ceil));
  }
  p = 1 - qq;
  return p;
}

/* 某家在该门的期望持有张数(含断门条件密度 + 持有区间) */
function kOf(track, seat, es, ceil) {
  const su = track.getSuit(es);
  const shareDenom = Math.max(2, Math.min(8, track.unseenTotal / Math.max(1, track.handLen)));
  let k = Math.max(1, su.n / shareDenom);
  if (TUNE.VOID_COND && track.voids[seat] && Object.keys(track.voids[seat]).length) {
    const nVoid = Object.keys(track.voids[seat]).length;
    const total = track.unseenTotal || 1;
    const mult = Math.min(2.2, total / Math.max(1, total - nVoid));
    k = Math.min(su.n, k * mult);
  }
  if (TUNE.HOLD_RANGE) {
    const lo = track.holdLo(seat, es);
    const hi = track.maxHoldIn(seat, es);
    if (hi !== Infinity && k > hi) k = hi;
    if (k < lo) k = lo;
  }
  return Math.max(1, Math.min(k, su.n));
}

/* 对手肯为这一墩花到哪一档(oppSpendCeil) */
function oppSpendCeil(track, view, ptsTable, isEnd) {
  if (!TUNE.OPP_SPEND) return undefined;
  const trump = track.trump;
  const kp = track.kittyPtsEst();
  const gain = ptsTable * 1 + 4;
  const su = track.getSuit('T');
  const total = su.n;
  let ceil = -1;
  for (let i = 0; i < su.cards.length; i++) {
    const c = su.cards[i];
    const higher = i; // 降序:前面 i 张更大
    const hold = 2.5 + 14 * (1 - higher / Math.max(1, total));
    const phaseK = track.handLen >= 17 ? 1 : track.handLen >= 8 ? 0.7 : Math.max(0.15, Math.min(1.1, 0.15 + kp * 0.045));
    let cost = hold * phaseK;
    if (isEnd && higher === 0) cost += kp * 2 * 3 * 5.0 * 0.2;
    if (cost <= gain) { ceil = c.ord; break; }
  }
  return ceil === -1 ? undefined : ceil;
}

/* pSurvive:我这一手摆上台面后,活过这些座位到最后。
 * leadSuit = 本墩领出门;cl.suit==='T' && leadSuit!=='T' 即毙牌:
 * 对手要盖过我的毙牌,他也得先断领出门(否则只能跟牌) —— 毙牌生存率的关键前提 */
function pSurvive(track, view, cl, seats, ptsTable, leadSuit) {
  const trump = track.trump;
  let p = 1;
  const isRuff = cl.suit === 'T' && leadSuit && leadSuit !== 'T';
  for (let i = 0; i < seats.length; i++) {
    const seat = seats[i];
    const es = cl.suit;
    let ceil;
    if (TUNE.OPP_SPEND && ptsTable > 0) ceil = oppSpendCeil(track, view, ptsTable, false);
    let pHas = pBeaterIn(track, cl, kOf(track, seat, es, ceil), ceil);
    if (pHas > 0.97) pHas = 0.97;
    let pBeat;
    if (isRuff) {
      /* 毙牌:对手先要断领出门,才谈得上用更大的主盖 */
      const pVoidLead = track.pVoidOf(seat, leadSuit);
      pBeat = pVoidLead * pHas * (ptsTable > 0 ? 0.9 : 0.5);
    } else if (es === 'T') {
      pBeat = pHas;
    } else {
      const pVoid = track.pVoidOf(seat, es);
      const trAvail = track.getSuit('T').n > 0;
      const pRuffBase = (ptsTable > 0 ? 0.8 : 0.35) * (trAvail ? 0.85 : 0);
      if (track.voids[seat][es]) {
        pBeat = pRuffBase;
      } else {
        pBeat = (1 - pVoid) * pHas + pVoid * pRuffBase;
      }
    }
    if (pBeat > 0.97) pBeat = 0.97;
    p *= 1 - pBeat;
  }
  return Math.max(0.02, Math.min(0.99, p));
}

/* ================= 阶梯效用 ================= */

/* 闲家总分 total 下,我队得到的「级数收益」。
 * 我队=闲家:上台 1+floor((total-80)/40);我队=庄家:0(输)或 3/2/1(守住) */
function myLevelGain(total, isDecl) {
  if (isDecl) {
    if (total < 80) return total === 0 ? 3 : total < 40 ? 2 : 1;
    return 0;
  }
  return total >= 80 ? 1 + Math.floor((total - 80) / 40) : 0;
}

/* 阶梯效用:闲家当前分 curDef、剩余可分 live、底分投影 kp 下,这一墩的期望效用差(我方视角) */
/* 阶梯效用差分:winTp/loseTp = 本墩最终落定后,闲家总分里加上多少分(我方赢/输)。
 * 物理口径:庄家队赢墩 → 分被保住不记入;闲家赢墩 → 记入。
 * 我方视角 U(def_final) 的差分,台阶精确(0/40/80/120/160/200)。 */
function stairEV(track, view, p, winTp, loseTp) {
  if (!TUNE.STAIR_UTIL) return null;
  const isDecl = track.isDecl;
  const def = track.defPts;
  const tw = Math.min(200, def + (isDecl ? 0 : winTp));
  const tl = Math.min(200, def + (isDecl ? loseTp : 0));
  /* 台阶 + 台阶级内连续梯度(0.008 级/分,与官方 EG 的 egPointsEps 同构):
   * 不跨线时台阶差为 0,但每 1 分仍有 0.008 级 ≈ 0.32 分的边际价值 */
  const uOf = (t) => {
    const myPts = isDecl ? 200 - t : t;
    return myLevelGain(t, isDecl) + TUNE.EG_PTS_EPS * myPts;
  };
  return (p * uOf(tw) + (1 - p) * uOf(tl) - uOf(def)) * TUNE.LEVEL_SCALE;
}

/* ================= 未来价值 ================= */

function trumpHold(track, c) {
  const trump = track.trump;
  const o = E.ordIdx(c, trump);
  const su = track.getSuit('T');
  let higher = 0;
  for (let i = 0; i < su.cards.length; i++) if (su.cards[i].ord > o) higher++;
  return 2.5 + 14 * (1 - higher / Math.max(1, su.n));
}


/* 护底单元:手上最可能撑到最后一墩的钢板单元 */
function reserveHoldOf(track, view, unit) {
  const trump = track.trump;
  const es = E.effSuit(unit.cards[0], trump);
  if (es === 'T') {
    const su = track.getSuit('T');
    const top = Math.max(...unit.cards.map(c => E.ordIdx(c, trump)));
    let higher = 0;
    for (const c of su.cards) if (c.ord > top) higher++;
    return 0.95 * (1 - higher / Math.max(1, su.n));
  }
  /* 副牌:两个对手断门概率,毙牌结构折扣 */
  const oppVoidP = Math.max(track.pVoidOf((view.seat + 1) % 4, es), track.pVoidOf((view.seat + 3) % 4, es));
  const q = unit.cards.length >= 3 ? TUNE.RUFF_STRUCT[2] : unit.cards.length === 2 ? TUNE.RUFF_STRUCT[1] : TUNE.RUFF_STRUCT[0];
  return Math.pow(1 - oppVoidP * q, 2) * TUNE.SIDE_RESERVE_DAMP;
}

function reserveUnit(track, view) {
  const trump = track.trump;
  const bySuit = { T: [], S: [], H: [], D: [], C: [] };
  for (const c of view.hand) bySuit[E.effSuit(c, trump)].push(c);
  let best = null, bv = -1;
  for (const es in bySuit) {
    const comps = E.decompose(bySuit[es], trump);
    for (const comp of comps) {
      /* 只认钢板 */
      const cl = E.classify(comp.cards, trump);
      if (!isBossPlay(track, cl)) continue;
      const h = reserveHoldOf(track, view, comp);
      if (h > bv) { bv = h; best = comp; }
    }
  }
  return best;
}

function phaseK(track, view) {
  const n = view.hand.length;
  if (n >= 17) return 1;
  if (n >= 8) return 0.7;
  const kp = track.kittyPtsEst();
  return Math.max(0.15, Math.min(1.1, 0.15 + kp * 0.045));
}

function futureValue(track, view, cards) {
  const trump = track.trump;
  let v = 0;
  /* 护底 flat 项:收官视野内,底分 × 动态倍数 × 视野折扣,只发给护底单元 */
  const kp = track.kittyPtsEst();
  if (kp > 0) {
    const hz = Math.max(5, Math.min(12, 5 + kp * 0.25));
    const len = view.hand.length;
    if (len <= hz) {
      const ru = reserveUnit(track, view);
      if (ru) {
        const ids = new Set(cards.map(c => c.id));
        const touch = ru.cards.some(c => ids.has(c.id));
        if (touch) {
          const near = Math.pow(Math.max(0, 1 - (len - 1) / hz), 0.5);
          const km = 2 * Math.max(1, Math.min(3, ru.cards.length));
          /* 边际:护底单元 vs 次好单元 */
          const bySuit2 = { T: [], S: [], H: [], D: [], C: [] };
          for (const c of view.hand) bySuit2[E.effSuit(c, trump)].push(c);
          let second = 0;
          for (const es in bySuit2) {
            const comps = E.decompose(bySuit2[es], trump);
            for (const comp of comps) {
              const cl = E.classify(comp.cards, trump);
              if (!isBossPlay(track, cl)) continue;
              if (comp.cards.some(c => ids.has(c.id))) continue;
              const h = reserveHoldOf(track, view, comp);
              if (h > second) second = h;
            }
          }
          const marg = Math.max(0, reserveHoldOf(track, view, ru) - second);
          v += kp * km * near * TUNE.END_KITTY_W * marg;
        }
      }
    }
  }
  /* 王对溢价 */
  let bj = 0, sj = 0;
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].rank === 16) bj++; else if (cards[i].rank === 15) sj++;
  }
  if (bj >= 2) v += 7 + (track.isDecl ? 5 : 0);
  if (sj >= 2) v += 7 * 0.7;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const es = E.effSuit(c, trump);
    if (es === 'T') {
      v += trumpHold(track, c);
    } else {
      const o = E.ordIdx(c, trump);
      const su = track.getSuit(es);
      let higher = 0;
      for (let j = 0; j < su.cards.length; j++) if (su.cards[j].ord > o) higher++;
      const rem = track.unseenPtsIn(es);
      if (c.rank === 14) v += 6 + 0.26 * rem;
      else if (c.rank === 13) {
        v += 2 + 0.10 * rem;
        /* 同门还握 A 再 +8(简化:手上还有该门 A) */
        for (let j = 0; j < view.hand.length; j++) {
          const h = view.hand[j];
          if (h.id !== c.id && E.effSuit(h, trump) === es && h.rank === 14) { v += 8; break; }
        }
      }
      if (higher === 1 && o >= 8) v += 16; // near-boss 期权(简化:领出侧才给)
    }
  }
  /* 跟牌侧分牌是负债 */
  return v * phaseK(track, view);
}

/* ================= 构造式候选 ================= */

/* 本门里满足跟牌义务的「最小跟」 */
function minFollow(track, hand, leadCl, avoidPoints) {
  const trump = track.trump;
  const n = leadCl.cards.length;
  const inSuit = hand.filter(c => E.effSuit(c, trump) === leadCl.suit);
  const rest = hand.filter(c => E.effSuit(c, trump) !== leadCl.suit);
  if (inSuit.length <= n) {
    const out = inSuit.slice();
    const restSorted = rest.slice().sort((a, b) =>
      (E.cardPoints(a) && avoidPoints ? 1 : 0) - (E.cardPoints(b) && avoidPoints ? 1 : 0) ||
      globalIdx(a, trump) - globalIdx(b, trump));
    while (out.length < n) out.push(restSorted.shift());
    return out;
  }
  /* 满足对子义务 */
  const need = E.pairsInLead(leadCl);
  const must = Math.min(need, E.countPairsIn(inSuit));
  const comps = E.decompose(inSuit, trump);
  let chosen = [];
  if (E.RULES.strictTractorFollow && leadCl.type === 'tractor') {
    const full = comps.find(c => c.type === 'tractor' && c.len >= leadCl.len);
    if (full) chosen = full.cards.slice(0, leadCl.len * 2);
    else if (E.RULES.partialTractorFollow) {
      const part = comps.filter(c => c.type === 'tractor').sort((a, b) => b.len - a.len)[0];
      if (part) chosen = part.cards.slice(0, Math.min(part.cards.length, n));
    }
  }
  const used = new Set(chosen.map(c => c.id));
  const pairUnits = [];
  for (const c of comps) {
    if (c.type === 'pair') pairUnits.push(c.cards);
    if (c.type === 'tractor') for (let i = 0; i < c.len; i++) pairUnits.push(c.cards.slice(i * 2, i * 2 + 2));
  }
  let have = Math.floor(chosen.length / 2);
  for (const u of pairUnits) {
    if (have >= must || chosen.length + 2 > n) break;
    if (u.some(c => used.has(c.id))) continue;
    u.forEach(c => used.add(c.id));
    chosen.push(...u); have++;
  }
  /* 其余用便宜的牌填 */
  const cheap = inSuit.filter(c => !used.has(c.id)).sort((a, b) =>
    (E.cardPoints(a) && avoidPoints ? 1 : 0) - (E.cardPoints(b) && avoidPoints ? 1 : 0) ||
    cheapKey(a, trump) - cheapKey(b, trump));
  while (chosen.length < n && cheap.length) chosen.push(cheap.shift());
  return chosen;
}

/* 最小赢牌:本门压过 curCl,断门用主牌毙(单张/对/拖拉机结构匹配) */
function minWin(track, hand, leadCl, curCl, isLast) {
  const trump = track.trump;
  const sig = (cl) => cl.type + ':' + (cl.len || 1);
  const leadSig = sig(leadCl);
  const inSuit = hand.filter(c => E.effSuit(c, trump) === leadCl.suit);
  if (inSuit.length >= leadCl.cards.length) {
    /* 本门压过 */
    if (leadCl.suit === curCl.suit || curCl.suit === leadCl.suit) {
      const comps = E.decompose(inSuit, trump);
      let best = null;
      for (const c of comps) {
        if (sig(c) !== leadSig) continue;
        if (c.top <= curCl.top) continue;
        if (!best || c.top < best.top) best = c;
      }
      return best ? best.cards.slice() : null;
    }
    return null;
  }
  /* 断门:主牌毙。结构须匹配(throw 用同组件结构) */
  const trumps = hand.filter(c => E.effSuit(c, trump) === 'T');
  if (!trumps.length) return null;
  if (leadCl.type === 'single') {
    const minTop = curCl.suit === 'T' ? curCl.top : -1;
    let best = null;
    for (const c of trumps) {
      const o = E.ordIdx(c, trump);
      if (o > minTop && (!best || o < E.ordIdx(best, trump))) best = c;
    }
    return best ? [best] : null;
  }
  if (leadCl.type === 'throw') {
    /* ruffThrow:按甩牌的组件结构(几个对/几个单)用主牌凑,先满足最难凑的 */
    const need = { pair: 0, tractor: 0, single: 0 };
    for (const c of leadCl.comps) {
      if (c.type === 'pair') need.pair++;
      else if (c.type === 'tractor') need.tractor++;
      else need.single++;
    }
    const tComps = E.decompose(trumps, trump);
    /* 所需最大对子档:当前最大若是主牌,凑出的结构 top 须更大 */
    const minTop = curCl.suit === 'T' ? curCl.top : -1;
    /* 尝试组合:对子优先满足,单张补齐(简化:只做 pair/tractor + 单张,且要求所有组件 top > minTop) */
    const pairUnits = [];
    const singles = [];
    for (const c of tComps) {
      if (c.type === 'single') singles.push(c.cards[0]);
      else if (c.type === 'pair') pairUnits.push(c.cards);
      else if (c.type === 'tractor') {
        for (let i = 0; i < c.len; i++) pairUnits.push(c.cards.slice(i * 2, i * 2 + 2));
      }
    }
    pairUnits.sort((a, b) => E.ordIdx(a[0], trump) - E.ordIdx(b[0], trump));
    const needPairs = need.pair + need.tractor;
    if (pairUnits.length < needPairs) return null;
    const pick = [];
    let ok = true;
    for (let i = 0; i < needPairs; i++) {
      const u = pairUnits[i];
      if (E.ordIdx(u[0], trump) <= minTop) { ok = false; break; }
      pick.push(u[0], u[1]);
    }
    if (!ok) return null;
    /* 单张:从剩余主牌里取 top 最小且 > minTop 的 */
    const used = new Set(pick.map(c => c.id));
    for (let i = 0; i < need.single; i++) {
      const cand = trumps.filter(c => !used.has(c.id) && E.ordIdx(c, trump) > minTop)
        .sort((a, b) => E.ordIdx(a, trump) - E.ordIdx(b, trump))[0];
      if (!cand) { ok = false; break; }
      pick.push(cand); used.add(cand.id);
    }
    if (!ok) return null;
    /* 结构校验 + 压得过当前最大 */
    const cl = E.classify(pick, trump);
    if (!cl) return null;
    if (E.structSig(cl.type === 'throw' ? cl.comps : [cl]) !== E.structSig(leadCl.comps)) return null;
    if (cl.top <= (curCl.suit === 'T' ? curCl.top : -1) && curCl.suit === 'T') return null;
    return pick;
  }
  const comps = E.decompose(trumps, trump);
  let best = null;
  for (const c of comps) {
    if (c.type === 'single') continue;
    const needLen = leadCl.type === 'tractor' ? leadCl.len : 1;
    if (c.type === 'tractor' && c.len < needLen) continue;
    if (c.type === 'pair' && needLen > 1) continue;
    if (c.top <= (curCl.suit === 'T' ? curCl.top : -1)) continue;
    /* 长度匹配:只取需要的对子数 */
    const pairs = c.type === 'pair' ? [c.cards] : (() => {
      const out = [];
      for (let i = 0; i + 1 < c.cards.length; i += 2) out.push([c.cards[i], c.cards[i + 1]]);
      return out;
    })();
    if (pairs.length < needLen) continue;
    const cards = [];
    for (let i = 0; i < needLen; i++) cards.push(pairs[i][0], pairs[i][1]);
    const top = E.classify(cards, trump).top;
    if (!best || top < best.top) best = { cards, top };
  }
  return best ? best.cards : null;
}

/* ================= 亮主 ================= */

/* ================= 亮主 ================= */

function projectLen(seen, v, total) {
  if (v === 0) return total * 25 / 108;
  return seen + (25 - v) * (total - seen) / (108 - v);
}

function onDeal2(view, cfg) {
  if (!cfg.BID) return null;
  const lv = view.trumpRank;
  const hand = view.hand;
  const v = hand.length;
  const cur = view.curDecl;

  /* 加固 */
  if (cur && cur.seat === view.seat && cur.strength === 1 && !view.rebelHappened && cur.suit) {
    let n = 0;
    for (let i = 0; i < hand.length; i++) if (hand[i].suit === cur.suit && hand[i].rank === lv) n++;
    if (n >= 2) return { suit: cur.suit, strength: 2 };
  }
  if (cur && cur.seat === view.seat) return null;

  /* 王对无主:只在无庄抢庄或手牌极适合时 */
  let bj = 0, sj = 0, rankCards = 0;
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].rank === 16) bj++; else if (hand[i].rank === 15) sj++;
    if (hand[i].rank === lv && hand[i].suit !== 'X') rankCards++;
  }
  const jokerOpt = bj >= 2 ? { suit: null, strength: 4 } : sj >= 2 ? { suit: null, strength: 3 } : null;
  if (jokerOpt && (!cur || E.canOverride(cur, jokerOpt, view.seat))) {
    /* 无主局:主牌 12 张里的牌力占比 + 副牌质量 */
    const w = (bj >= 2 ? 2 : 0) + (sj >= 2 ? 1.5 : 0) + rankCards * 0.4 + (bj >= 2 && sj >= 2 ? 0 : 0);
    const share = w / 6.7;
    /* 副牌质量:A1 K0.6 对0.8 */
    const groups = {};
    let sideLen = 0, sideQ = 0;
    for (let i = 0; i < hand.length; i++) {
      const c = hand[i];
      if (c.suit === 'X' || c.rank === lv) continue;
      sideLen++;
      groups[c.suit + ':' + c.rank] = (groups[c.suit + ':' + c.rank] || 0) + 1;
      if (c.rank === 14) sideQ += 1;
      else if (c.rank === 13) sideQ += 0.6;
    }
    for (const k in groups) if (groups[k] >= 2) sideQ += 0.8;
    const sq = sideLen ? Math.max(-1, Math.min(1, sideQ / (sideLen * 0.42) - 1)) : -1;
    const rel = view.dealerKnown ? 0.5 : 0.15;
    let fit = 0.6 * share * 2 - 0.6 + 0.6 * sq - rel;
    if (view.myTeam !== (view.dealer >= 0 ? view.dealer % 2 : -1)) fit += 0.25;
    else if (view.dealerKnown) fit -= 0.15;
    let s2 = (lv === 5 || lv === 10 || lv === 13 ? 25 * 1.35 : 0) + fit * 60;
    if (!view.dealerKnown) s2 += 58;
    if (view.dealer >= 0 && view.dealerKnown) {
      if (view.dealer === view.seat) s2 += 10;
      else if (view.dealer % 2 === view.myTeam) s2 -= 14;
      else s2 += 6;
    }
    if (cur) {
      if (cur.seat % 2 === view.myTeam) s2 -= 30;
      else s2 += 30 * (0.4 + 0.6 * v / 25);
    }
    s2 -= 12;
    const th = (view.dealerKnown ? 34 - 22 * v / 25 : 10 - 10 * v / 25) + (cur ? 12 : 0) - cfg.BID_EASE;
    if (s2 >= th) return jokerOpt;
  }

  /* 各花色级牌 */
  const cnt = { S: 0, H: 0, D: 0, C: 0 };
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (c.suit === 'X' || c.rank !== lv) continue;
    cnt[c.suit]++;
  }
  let bestSuit = null, bestScore = -1e9, bestStrength = 1;
  for (let i = 0; i < 4; i++) {
    const s = SUITS[i];
    const rankN = cnt[s];
    if (!rankN) continue;
    let suitN = 0;
    for (let j = 0; j < hand.length; j++) if (hand[j].suit === s) suitN++;
    const L = projectLen(suitN - rankN, v, 26) + projectLen(rankN, v, 6 + (s === s ? 0 : 0)) ;
    /* 简化:该花色主牌 = 本门散牌 + 该门级牌,外推 */
    const fit = Math.max(-1, Math.min(1, (L + rankN - 9) / 5));
    let sc = 60 * fit;
    if (lv === 5 || lv === 10 || lv === 13) sc += 25;
    if (!view.dealerKnown) sc += 85;
    if (view.dealer >= 0 && view.dealerKnown) {
      if (view.dealer === view.seat) sc += 10;
      else if (view.dealer % 2 === view.myTeam) { if (fit < 0.6) sc -= 14; }
      else sc += 6;
    }
    if (cur) {
      if (cur.seat % 2 === view.myTeam) sc -= 30;
      else sc += 30 * (0.4 + 0.6 * v / 25);
    }
    if (view.dealer >= 0 && view.dealerKnown && (view.dealer % 2 !== view.myTeam) &&
        view.gates && view.gates.includes(view.levels[view.dealer % 2])) sc += 18;
    const strength = rankN >= 2 ? 2 : 1;
    sc -= 12 * (strength === 2 ? 0.4 : 0.2);
    if (strength > bestStrength || sc > bestScore) { bestScore = sc; bestSuit = s; bestStrength = strength; }
  }
  if (!bestSuit) return null;
  const opt = { suit: bestSuit, strength: bestStrength };
  if (cur && !E.canOverride(cur, opt, view.seat)) return null;
  const th = (view.dealerKnown ? 34 - 22 * v / 25 : 10 - 10 * v / 25) + (cur ? 12 : 0) - cfg.BID_EASE;
  return bestScore >= th ? opt : null;
}

function onRebel2(view, cfg) { return cfg.REBEL_ALWAYS; }

/* ================= 扣底 ================= */

function easeEnds(t) { return 0.5 - Math.asin(1 - 2 * t) / Math.PI; }

function pWinLastTrick(hand, trump) {
  let nT = 0, bj = 0, sj = 0;
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (E.effSuit(c, trump) === 'T') nT++;
    if (c.rank === 16) bj++; else if (c.rank === 15) sj++;
  }
  let p = easeEnds(Math.max(0, Math.min(1, nT / (18))));
  if (bj >= 2) p += 0.22; else if (bj >= 1) p += 0.10;
  if (sj >= 2) p += 0.10; else if (sj >= 1) p += 0.04;
  return Math.max(0.05, Math.min(0.95, p));
}

function discard2(view, cfg) {
  const trump = view.trump;
  const hand = view.hand.slice();
  const track = buildTrack(view, cfg);
  const buried = [];
  while (buried.length < 8 && hand.length) {
    const remain = 8 - buried.length;
    const groups = {};
    for (let i = 0; i < hand.length; i++) {
      const es = E.effSuit(hand[i], trump);
      (groups[es] = groups[es] || []).push(hand[i]);
    }
    const nT = (groups.T || []).length;
    const nSide = 4 - ((groups.S ? 0 : 1) + (groups.H ? 0 : 1) + (groups.D ? 0 : 1) + (groups.C ? 0 : 1));
    const voidDiscount = easeEnds(Math.max(0, Math.min(1, nT / 12)));
    const share = {};
    for (const es in groups) {
      if (es === 'T') continue;
      const len = groups[es].length;
      if (len <= remain) share[es] = 68 * voidDiscount / len;
      else share[es] = 0;
    }
    const pLast = pWinLastTrick(hand, trump);
    const bench = Math.max(1, (25 - nT) / 3);
    let best = null, bestScore = -1e9;
    for (let i = 0; i < hand.length; i++) {
      const c = hand[i];
      const es = E.effSuit(c, trump);
      let sc = share[es] || 0;
      const o = E.ordIdx(c, trump);
      if (es === 'T') {
        sc -= 400 + o * 6;
      } else {
        let face = o * 2.2;
        const g = groups[es];
        let same = 0;
        for (let j = 0; j < g.length; j++) if (g[j].suit === c.suit && g[j].rank === c.rank) same++;
        if (same >= 2) face += 18;
        if (c.rank === 14) face += 200;
        else if (c.rank === 13) {
          face += 14;
          let hasA = false;
          for (let j = 0; j < g.length; j++) if (g[j].rank === 14) { hasA = true; break; }
          if (hasA) face += 10;
        }
        sc -= face;
        const pts = E.cardPoints(c);
        if (pts > 0) {
          const len = g.length;
          const pHold = Math.max(0.15, Math.min(0.65, 0.50 - 0.035 * (len - bench)));
          const riskHold = pts * pHold;
          const riskBury = pts * (2 * (1 - pLast)) * cfg.BURY_PT_MULT;
          sc += riskHold - riskBury;
        }
      }
      if (!best || sc > bestScore) { bestScore = sc; best = c; }
    }
    buried.push(best);
    hand.splice(hand.indexOf(best), 1);
  }
  return buried;
}

/* ================= 跟牌 ================= */

function trickWinnerSoFar(plays, trump) {
  let best = E.classify(plays[0].cards, trump);
  let seat = plays[0].seat;
  const sig = (cl) => cl.type + ':' + (cl.len || 1);
  const leadSig = best ? sig(best) : '?';
  for (let i = 1; i < plays.length; i++) {
    const cl = E.classify(plays[i].cards, trump);
    if (!cl || sig(cl) !== leadSig) continue;
    if (cl.suit === best.suit) { if (cl.top > best.top) { best = cl; seat = plays[i].seat; } }
    else if (cl.suit === 'T') { best = cl; seat = plays[i].seat; }
  }
  return { cl: best, seat };
}

function follow2(view, plays, cfg) {
  const trump = view.trump;
  const hand = view.hand;
  const me = view.seat;
  const leadCl = E.classify(plays[0].cards, trump);
  if (!leadCl) return minFollow({ trump, ...buildTrack(view, cfg) }, hand, leadCl, false);
  const track = buildTrack(view, cfg);
  const cur = trickWinnerSoFar(plays, trump);
  const partner = (me + 2) % 4;
  const partnerWinning = cur.seat % 2 === me % 2 && cur.seat !== me;
  const isLast = plays.length === 3;
  const ptsTable = plays.reduce((s, p) => s + E.countPoints(p.cards), 0);
  const remaining = [];
  for (let i = plays.length; i < 4; i++) remaining.push((plays[0].seat + i) % 4);
  const remainingOpp = remaining.filter(s => s % 2 !== me % 2);
  const remainingMate = remaining.filter(s => s % 2 === me % 2);

  const cands = [];
  const push = (cards, cat, beatsCur, penalty) => {
    if (!cards || cards.length !== leadCl.cards.length) return;
    if (!E.isLegalFollow(hand, leadCl, cards, trump)) return;
    const cl = E.classify(cards, trump);
    /* pTeamWin */
    let p;
    if (beatsCur) {
      p = isLast ? 1 : pSurvive(track, view, cl, remainingOpp, ptsTable, leadCl.suit);
    } else if (partnerWinning) {
      p = pSurvive(track, view, cur.cl, remainingOpp, ptsTable, leadCl.suit);
    } else {
      p = remainingMate.length ? TUNE.P_PARTNER_TAKES : TUNE.P_NO_PARTNER;
      if (isLast) p = TUNE.P_NO_PARTNER;
    }
    const myPts = E.countPoints(cards);
    const share = track.unseenPtsIn(leadCl.suit) / 3;
    let laterWin = 0, laterLose = 0;
    for (const s of remainingMate) laterWin += Math.min(10, share * TUNE.DUMP_PARTNER);
    for (const s of remainingOpp) {
      laterWin += Math.min(3, share * 0.25);
      laterLose += Math.min(10, share * TUNE.DUMP_OPP * (track.voids[s] && track.voids[s][leadCl.suit] ? 1.3 : 1));
    }
    if (remainingMate.length) laterLose += Math.min(3, share * 0.15);
    let ev;
    const se = stairEV(track, view, p, ptsTable + myPts + laterWin, ptsTable + myPts + laterLose);
    if (se !== null) {
      ev = se;
    } else {
      const gain = ptsTable + myPts + laterWin;
      const loss = ptsTable + myPts + laterLose;
      ev = p * gain - (1 - p) * loss;
    }
    const CAT = cat === 'ruff' ? 1.06 : 1.0;
    let sc = CAT * ev;
    if (beatsCur && cfg.CAPTURE_BONUS) sc += cfg.CAPTURE_BONUS;
    /* tempo */
    sc += (p * tempoValue(track, view, cards) - (1 - p) * TUNE.OPP_TEMPO) * TUNE.TEMPO_W;
    sc -= futureValue(track, view, cards);
    /* 结构代价 */
    sc -= structCost(track, view, cards);
    if (penalty) sc -= penalty;
    cands.push({ cards, cat, sc, beats: !!beatsCur });
  };


  /* --- 候选 --- */
  const certain = isLast && !partnerWinning;
  const curIsOpp = !partnerWinning;
  if (curIsOpp) {
    const win = minWin(track, hand, leadCl, cur.cl, certain);
    if (win) {
      const isRuff = E.effSuit(win[0], trump) === 'T' && leadCl.suit !== 'T';
      const cl = E.classify(win, trump);
      let penalty = 0;
      if (isRuff && ptsTable >= 5 && track.getSuit('T').n > 0 && TUNE.RUFF_OPP) penalty = -25;
      let guardPick = null;
      if (isRuff && TUNE.RUFF_GUARD && ptsTable >= 10 && remainingOpp.some(s => track.voids[s] && track.voids[s][leadCl.suit])) {
        /* 毙得够高:后手有断门对手,用他压不动的档 */
        const ceil = oppSpendCeil(track, view, ptsTable, false);
        guardPick = minWinAbove(track, hand, leadCl, cur.cl, ceil);
      }
      if (isRuff && remainingOpp.some(s => track.voids[s] && track.voids[s][leadCl.suit])) {
        penalty += 20; // ruffVoidBehind
      }
      const voidBehind = isRuff && remainingOpp.some(s2 => track.voids[s2] && track.voids[s2][leadCl.suit]);
      const skipRuff = cfg.RUFF_VOID_BEHIND_SKIP && voidBehind;
      if (cfg.CASH_WIN_PTS2 && certain && leadCl.type === 'single' && win && E.countPoints(win) === 0) {
        /* 末家稳赢:手上同结构、压得过、且带分的牌,趁机兑现 */
        const inSuit2 = hand.filter(c => E.effSuit(c, trump) === leadCl.suit);
        let cash = null;
        if (isRuff) {
          const trumps2 = hand.filter(c => E.effSuit(c, trump) === 'T');
          for (const c of trumps2) {
            if (E.cardPoints(c) > 0 && E.ordIdx(c, trump) > cl.top &&
                (!cash || E.ordIdx(c, trump) < E.ordIdx(cash, trump))) cash = c;
          }
        } else if (cur.cl.suit === leadCl.suit) {
          for (const c of inSuit2) {
            if (E.cardPoints(c) > 0 && E.ordIdx(c, trump) > cur.cl.top &&
                (!cash || E.ordIdx(c, trump) < E.ordIdx(cash, trump))) cash = c;
          }
        }
        if (cash) push([cash], 'over', true, 0);
      }
      if (cfg.GUARD_FIRST && guardPick && E.classify(guardPick, trump).top > cl.top && !skipRuff) push(guardPick, 'ruff', true, -25);
      if (!skipRuff) push(win, isRuff ? 'ruff' : 'over', true, penalty);
      if (!cfg.GUARD_FIRST && guardPick && E.classify(guardPick, trump).top > cl.top && !skipRuff) push(guardPick, 'ruff', true, -25);
    }
    /* blockWin:盖住末家分牌 */
    if (TUNE.BLOCK_WIN && !isLast && remainingOpp.length && leadCl.type === 'single' && cur.cl.suit === leadCl.suit) {
      const bw = blockWin(track, hand, leadCl, cur.cl);
      if (bw) push(bw, 'over', true, 0);
    }
  } else {
    /* 队友暂大 */
    if (!isLast && ptsTable >= 5 && leadCl.suit !== 'T' && hand.some(c => E.effSuit(c, trump) !== leadCl.suit && E.effSuit(c, trump) === 'T')) {
      const win = minWin(track, hand, leadCl, cur.cl, false);
      if (win && TUNE.RUFF_PARTNER) push(win, 'ruff', true, -25);
    }
  }

  /* 贴分 */
  if (partnerWinning || (curIsOpp && false)) {
    let dumpOk = true;
    if (cfg.DUMP_SAFE_P > 0) {
      const pPartner = isLast ? 1 : pSurvive(track, view, cur.cl, remainingOpp, ptsTable, leadCl.suit);
      if (pPartner < cfg.DUMP_SAFE_P) dumpOk = false;
    }
    if (dumpOk) {
      const dump = buildFollowStrat(track, hand, leadCl, 'dump');
      if (dump) push(dump, 'dump', false, 0);
    }
  }
  /* 跟小 */
  {
    const cheap = buildFollowStrat(track, hand, leadCl, 'cheap');
    if (cheap) push(cheap, 'cheap', false, 0);
  }
  /* 垫牌 */
  {
    const discard = buildFollowStrat(track, hand, leadCl, 'discard');
    if (discard) push(discard, 'discard', false, 0);
  }

  if (!cands.length) {
    const mf = minFollow(track, hand, leadCl, false);
    if (E.isLegalFollow(hand, leadCl, mf, trump)) return mf;
  }
  let pickCands = cands;
  if (!cfg.FOLLOW_GREEDY) {
    cands.sort((a, b) => b.sc - a.sc);
  }
  if (cfg.GREEDY_CAPTURE) {
    const caps = cands.filter(c => c.beats);
    if (caps.length) pickCands = caps;
  }
  /* 收官蒙特卡洛融合(跟牌侧):搜索只有在明确更好时才接管(官方 egMargin 口径) */
  let pick = pickCands.length ? pickCands[0].cards : null;
  if (cfg.EG && cfg.EG_FOLLOW && pickCands.length >= 2 && pickCands.length <= cfg.EG_MAX_CANDS && hand.length <= cfg.EG_MAX_CARDS) {
    const eg = endgameSearch(view, plays, pickCands.map(c => c.cards), cfg, track);
    if (eg) {
      const top = eg[0];
      const curU = egCurU(eg, pickCands[0].cards);
      if (top.u - curU > cfg.EG_MARGIN) { pick = top.cards; }
    }
  }
  /* 自检:选中候选必须合法(候选生成有边缘 bug 时也绝不违规) */
  let chosen = null;
  if (pick && E.isLegalFollow(hand, leadCl, pick, trump)) chosen = pick;
  for (let i = 0; i < cands.length && !chosen; i++) {
    if (E.isLegalFollow(hand, leadCl, cands[i].cards, trump)) { chosen = cands[i].cards; break; }
  }
  if (chosen) return chosen;
  const mf = minFollow(track, hand, leadCl, false);
  if (E.isLegalFollow(hand, leadCl, mf, trump)) return mf;
  /* 最后防线:暴力扫合法子集 */
  for (let t = 0; t < 300; t++) {
    const pick = [];
    const perm = E.shuffle(hand.slice(), E.rng((view.history.length * 31 + t * 7 + view.seat) >>> 0));
    for (let i = 0; i < leadCl.cards.length; i++) pick.push(perm[i]);
    if (E.isLegalFollow(hand, leadCl, pick, trump)) return pick;
  }
  return hand.slice(0, leadCl.cards.length);
}

/* 毙得够高:用超过 ceil 档的主牌毙 */
function minWinAbove(track, hand, leadCl, curCl, ceil) {
  const trump = track.trump;
  if (leadCl.type !== 'single') return null;
  const trumps = hand.filter(c => E.effSuit(c, trump) === 'T');
  if (!trumps.length) return null;
  const minTop = Math.max(curCl.suit === 'T' ? curCl.top : -1, ceil === undefined ? -1 : ceil);
  let best = null;
  for (const c of trumps) {
    const o = E.ordIdx(c, trump);
    if (o > minTop && (!best || o < E.ordIdx(best, trump))) best = c;
  }
  return best ? [best] : null;
}

/* blockWin:本门压过在外最大分牌的便宜牌 */
function blockWin(track, hand, leadCl, curCl) {
  const trump = track.trump;
  if (leadCl.type !== 'single' || curCl.suit !== leadCl.suit) return null;
  const su = track.getSuit(leadCl.suit);
  let topPt = -1;
  for (const c of su.cards) if (E.cardPoints(c) > 0 && c.ord > topPt) topPt = c.ord;
  if (topPt <= curCl.top) return null;
  const inSuit = hand.filter(c => E.effSuit(c, trump) === leadCl.suit);
  let best = null;
  for (const c of inSuit) {
    const o = E.ordIdx(c, trump);
    if (o > topPt && (!best || o < E.ordIdx(best, trump))) best = c;
  }
  return best ? [best] : null;
}

/* 贴分/跟小/垫牌的排序填充 */
function buildFollowStrat(track, hand, leadCl, strat) {
  const trump = track.trump;
  const n = leadCl.cards.length;
  const inSuit = hand.filter(c => E.effSuit(c, trump) === leadCl.suit);
  const rest = hand.filter(c => E.effSuit(c, trump) !== leadCl.suit);
  const sortKey = (a, b) => {
    if (strat === 'dump') return dumpKey(a, trump) - dumpKey(b, trump);
    if (strat === 'cheap') return cheapKey(a, trump) - cheapKey(b, trump);
    /* discard:垫短门造缺、不拆对、不垫分、不垫主 */
    const sa = rest.filter(c => E.effSuit(c, trump) === E.effSuit(a, trump)).length;
    const sb = rest.filter(c => E.effSuit(c, trump) === E.effSuit(b, trump)).length;
    if (sa !== sb) return sa - sb;
    if (E.cardPoints(a) !== E.cardPoints(b)) return E.cardPoints(a) - E.cardPoints(b);
    return globalIdx(a, trump) - globalIdx(b, trump);
  };
  if (inSuit.length <= n) {
    const out = inSuit.slice();
    const rs = rest.slice().sort(sortKey);
    while (out.length < n && rs.length) out.push(rs.shift());
    return out;
  }
  /* 义务 + 按策略填充 */
  const need = E.pairsInLead(leadCl);
  const must = Math.min(need, E.countPairsIn(inSuit));
  const comps = E.decompose(inSuit, trump);
  let chosen = [];
  if (E.RULES.strictTractorFollow && leadCl.type === 'tractor') {
    const full = comps.find(c => c.type === 'tractor' && c.len >= leadCl.len);
    if (full) chosen = full.cards.slice(0, leadCl.len * 2);
    else if (E.RULES.partialTractorFollow) {
      const part = comps.filter(c => c.type === 'tractor').sort((a, b) => b.len - a.len)[0];
      if (part) chosen = part.cards.slice(0, Math.min(part.cards.length, n));
    }
  }
  const used = new Set(chosen.map(c => c.id));
  const pairUnits = [];
  for (const c of comps) {
    if (c.type === 'pair') pairUnits.push(c.cards);
    if (c.type === 'tractor') for (let i = 0; i < c.len; i++) pairUnits.push(c.cards.slice(i * 2, i * 2 + 2));
  }
  let have = Math.floor(chosen.length / 2);
  for (const u of pairUnits) {
    if (have >= must || chosen.length + 2 > n) break;
    if (u.some(c => used.has(c.id))) continue;
    u.forEach(c => used.add(c.id));
    chosen.push(...u); have++;
  }
  const rest2 = inSuit.filter(c => !used.has(c.id)).sort(sortKey);
  while (chosen.length < n && rest2.length) chosen.push(rest2.shift());
  return chosen;
}

/* 牌权价值:打完后剩余可兑现单元,按价值降序贴现 */
function tempoValue(track, view, cards) {
  const trump = track.trump;
  const ids = new Set(cards.map(c => c.id));
  const rest = view.hand.filter(c => !ids.has(c.id));
  const units = [];
  const bySuit = { T: [], S: [], H: [], D: [], C: [] };
  for (const c of rest) bySuit[E.effSuit(c, trump)].push(c);
  for (const es in bySuit) {
    const su = track.getSuit(es);
    const comps = E.decompose(bySuit[es], trump);
    for (const comp of comps) {
      /* 钢板单元(简化:门内在外无更大) */
      let boss = true;
      for (let i = 0; i < comp.cards.length; i++) {
        const o = E.ordIdx(comp.cards[i], trump);
        if (su.cards.some(c => c.ord > o)) { boss = false; break; }
      }
      if (!boss) continue;
      const rem = track.unseenPtsIn(es);
      let val = Math.min(10, rem * 0.33) * Math.min(1, comp.cards.length * 0.6) + comp.cards.length * 1.2;
      if (comp.cards.length > 1) val *= 1 + 0.18 * (comp.cards.length - 1);
      units.push(val);
    }
  }
  units.sort((a, b) => b - a);
  let v = 0;
  for (let i = 0; i < units.length; i++) v += units[i] * Math.pow(TUNE.TEMPO_DECAY, i);
  return Math.min(TUNE.TEMPO_CAP, v);
}

/* 拆对/断门结构代价 */
function structCost(track, view, cards) {
  const trump = track.trump;
  let cost = 0;
  if (TUNE.BREAK_PAIR_W) {
    const cnt = {};
    for (const c of view.hand) {
      const k = c.suit + ':' + c.rank;
      cnt[k] = (cnt[k] || 0) + 1;
    }
    const inCd = {};
    for (const c of cards) inCd[c.suit + ':' + c.rank] = (inCd[c.suit + ':' + c.rank] || 0) + 1;
    for (const k in inCd) {
      if (inCd[k] === 1 && cnt[k] >= 2) cost += TUNE.BREAK_PAIR_W;
    }
  }
  return cost;
}

/* ================= 领出 ================= */

function isBossPlay(track, cl) {
  const su = track.getSuit(cl.suit);
  for (let i = 0; i < cl.cards.length; i++) {
    const o = E.ordIdx(cl.cards[i], track.trump);
    if (su.cards.some(c => c.ord > o)) return false;
  }
  return true;
}

function leadPointsEV(track, view, cl, cards) {
  const es = cl.suit;
  const rem = track.unseenPtsIn(es);
  const partner = (view.seat + 2) % 4;
  const pPartnerVoid = track.pVoidOf(partner, es);
  const fromPartner = rem * 0.33 * (1 - pPartnerVoid) * Math.min(1, cards.length * 0.8);
  const fromOpp = rem * 0.33 * 0.35 * Math.min(1, cards.length * 0.8);
  return (es === 'T' ? 0.45 : 1) * (fromPartner + fromOpp);
}

function leadLossPoints(track, view, cl) {
  const share = track.unseenPtsIn(cl.suit) / 3;
  const v = Math.min(10, share * TUNE.DUMP_OPP) + Math.min(3, share * 0.15);
  return (cl.suit === 'T' ? 0.45 : 1) * v;
}

function drawTrumpValue(track, view) {
  const su = track.getSuit('T');
  const nTrump = view.hand.filter(c => E.effSuit(c, track.trump) === 'T').length;
  const share = Math.min(1, 2 * view.hand.length / Math.max(1, track.unseenTotal));
  const oppTrump = su.n * share;
  return Math.max(-TUNE.DRAW_CAP, Math.min(TUNE.DRAW_CAP, TUNE.DRAW_UNIT * (nTrump - oppTrump)));
}

/* 调王:小主换牌权(队友接) */
function tiaoWangValue(track, view, cl, cards) {
  if (!TUNE.TIAO_WANG) return 0;
  if (cl.suit !== 'T' || cl.type !== 'single' || cards.length !== 1) return 0;
  const c = cards[0];
  if (c.rank === 15 || c.rank === 16) return 0;
  const su = track.getSuit('T');
  const higher = su.cards.filter(x => x.ord > cl.top).length;
  if (higher === 0) return 0;
  const partner = (view.seat + 2) % 4;
  const partnerLo = track.holdLo(partner, 'T');
  const oppShare = (view.seat + 1) % 4;
  const share = 0.5;
  const handoff = partnerLo >= 1 ? share * TUNE.OPP_TEMPO : 0.4 * share * TUNE.OPP_TEMPO;
  return handoff;
}

function feedRuffValue(track, view, cl, cards) {
  if (!TUNE.FEED_RUFF) return 0;
  if (cl.suit === 'T' || E.countPoints(cards) > 0) return 0;
  const partner = (view.seat + 2) % 4;
  const pv = track.pVoidOf(partner, cl.suit);
  if (pv < 0.35) return 0;
  if (track.getSuit('T').n === 0) return 0;
  const oppVoidP = Math.max(track.pVoidOf((view.seat + 1) % 4, cl.suit), track.pVoidOf((view.seat + 3) % 4, cl.suit));
  const rem = track.unseenPtsIn(cl.suit);
  const gain = Math.min(12, rem * 0.33) + TUNE.OPP_TEMPO;
  return pv * (1 - oppVoidP) * gain;
}

/* leadWinP:pTeam = 我活下来 + 队友救回 */
function leadWinP(track, view, cl, ptsTable) {
  const opps = [(view.seat + 1) % 4, (view.seat + 3) % 4];
  const mine = pSurvive(track, view, cl, opps, ptsTable, cl.suit);
  /* 队友救援(简化) */
  const partner = (view.seat + 2) % 4;
  const su = track.getSuit(cl.suit);
  let higher = 0;
  for (const c of su.cards) if (c.ord > cl.top) higher++;
  const k = Math.max(1, su.n / 4);
  const pMateBeat = higher > 0 ? 1 - Math.pow(1 - higher / su.n, k) : 0;
  const pMate = pMateBeat * 0.7;
  return Math.max(0.02, Math.min(0.99, mine + (1 - mine) * pMate));
}

function lead2(view, cfg) {
  const trump = view.trump;
  const hand = view.hand;
  const track = buildTrack(view, cfg);
  const cands = [];
  const bySuit = { T: [], S: [], H: [], D: [], C: [] };
  for (const c of hand) bySuit[E.effSuit(c, trump)].push(c);
  for (const es in bySuit) {
    const comps = E.decompose(bySuit[es], trump);
    for (const comp of comps) cands.push({ cards: comp.cards.slice(), note: comp.type });
  }
  /* 甩牌候选(对齐 claude 的 throwBonus 打法,他们 13% 的领出是甩牌,我只有 1.4%):
   * 含主门;门长 ≤8;整门甩 + 安全组件子集甩(每个组件都无人能压即可) */
  for (const es of ['S', 'H', 'D', 'C']) {
    const cs = bySuit[es];
    if (!cs || cs.length < 2 || cs.length > 8) continue;
    const comps = E.decompose(cs, trump);
    if (comps.length < 2) continue;
    const safeComps = comps.filter(c => {
      const cl2 = E.classify(c.cards, trump);
      return isBossPlay(track, cl2);
    });
    if (safeComps.length < 2) continue;
    /* 整门全安全 → 整门甩 */
    if (safeComps.length === comps.length) {
      const all = [];
      for (const comp of comps) all.push(...comp.cards);
      if (E.classify(all, trump) && E.classify(all, trump).type === 'throw') cands.push({ cards: all, note: 'throw' });
    } else if (TUNE.THROW_SUBSET) {
      /* 只甩安全组件 */
      const sub = [];
      for (const c of safeComps) sub.push(...c.cards);
      if (E.classify(sub, trump) && E.classify(sub, trump).type === 'throw') cands.push({ cards: sub, note: 'throwSub' });
    }
  }

  const scored = [];
  const ptsTable = (() => {
    let p = 0;
    for (const c of hand) p += E.cardPoints(c);
    return p > 0 ? 5 : 0; // 虚拟台面分,触发对手「肯花」
  })();
  for (const cd of cands) {
    const cl = E.classify(cd.cards, trump);
    if (!cl) continue;
    const pts = E.countPoints(cd.cards);
    const L = cd.cards.length;
    const boss = isBossPlay(track, cl);
    const es = cl.suit;
    const oppVoidP = es === 'T' ? 0 : Math.max(track.pVoidOf((view.seat + 1) % 4, es), track.pVoidOf((view.seat + 3) % 4, es));
    const ruffable = oppVoidP > 0.25;
    const fut = futureValue(track, view, cd.cards);
    const phase = hand.length >= 17 ? 'open' : hand.length >= 8 ? 'mid' : 'end';
    let sc, pWin;
    if (cl.type === 'throw') {
      if (boss && !ruffable) {
        sc = 68 + L * 3 + leadPointsEV(track, view, cl, cd.cards) * 1.4 - fut * 0.35;
        pWin = 0.95;
      } else {
        sc = 5 - pts * 4;
        pWin = 0.3;
      }
    } else if (boss) {
      sc = TUNE.LEAD_BOSS + L * TUNE.LEAD_SIZE + leadPointsEV(track, view, cl, cd.cards) * 1.4 - fut * (es === 'T' ? 1 : 0.35);
      if (es === 'T') {
        sc -= phase === 'end' ? 4 : cfg.LEAD_TRUMP_PEN;
        const dt = drawTrumpValue(track, view);
        if (cd.cards.some(c => c.rank >= 15)) sc += Math.min(0, dt);
        else sc += Math.max(0, dt);
        /* 庄家方主厚时,吊主清场是正收益(claude drawTrumpBonus=12) */
        const myTrumps = view.hand.filter(c => E.effSuit(c, trump) === 'T').length;
        const trumpLeft = track.getSuit('T').n;
        if (track.isDecl && trumpLeft > 0 && myTrumps >= 6) sc += 12 * Math.min(1, myTrumps / 10) * Math.min(1, trumpLeft / 8);
      }
      if (es !== 'T' && ruffable) sc -= (35 + (pts ? 10 : 0)) * oppVoidP;
      pWin = es === 'T' ? 0.97 : 0.95 * (1 - oppVoidP);
    } else {
      /* 非钢板:统一 EV */
      const p = leadWinP(track, view, cl, ptsTable);
      const gain = pts + leadPointsEV(track, view, cl, cd.cards);
      const loss = pts + leadLossPoints(track, view, cl);
      const se = stairEV(track, view, p, gain, loss);
      if (se !== null) sc = se;
      else sc = (p * gain - (1 - p) * loss);
      if (cl.type === 'tractor') sc += cfg.PAIR_BONUS * (L - 1);
      else if (cl.type === 'pair') sc += cfg.PAIR_BONUS;
      if (es === 'T') {
        const dt = drawTrumpValue(track, view);
        if (cl.type === 'single') {
          sc += Math.min(0, dt) + p * Math.max(0, dt) - cfg.LEAD_WEAK_TRUMP * (1 - p) + tiaoWangValue(track, view, cl, cd.cards);
        } else {
          /* 对子/拖拉机:claude 口径 —— 不吞负 dt(那是对单张弱主领出的先验),
           * 庄家方主厚时给吊主正奖励 */
          sc += p * Math.max(0, dt);
          const myTrumps2 = view.hand.filter(c => E.effSuit(c, trump) === 'T').length;
          const trumpLeft2 = track.getSuit('T').n;
          if (track.isDecl && trumpLeft2 > 0 && myTrumps2 >= 6) sc += 12 * Math.min(1, myTrumps2 / 10) * Math.min(1, trumpLeft2 / 8);
        }
      } else {
        const fr = feedRuffValue(track, view, cl, cd.cards);
        sc += fr;
        /* 小牌探路罚分:副牌单张、无分、无送毙价值 → 领出去就是送牌权 */
        if (cl.type === 'single' && pts === 0 && fr <= 0) {
          const partnerVoid = track.pVoidOf((view.seat + 2) % 4, es);
          if (partnerVoid < 0.35) sc -= 12;
        }
      }
      sc -= fut;
      pWin = p;
    }
    /* 牌权 */
    sc += (pWin * tempoValue(track, view, cd.cards) - (1 - pWin) * TUNE.OPP_TEMPO) * 1.0;
    sc -= structCost(track, view, cd.cards);
    scored.push({ cards: cd.cards, sc, pWin, cl, note: cd.note });
  }
  scored.sort((a, b) => b.sc - a.sc);
  if (!scored.length) return [hand[0]];

  /* 领出贪心对照:按优先级选(不改打分,只在选择时用) */
  if (cfg.LEAD_GREEDY) {
    const boss = scored.filter(x => x.pWin > 0.85);
    const multi = boss.filter(x => x.cl.type !== 'single');
    const singleBoss = boss.filter(x => x.cl.type === 'single');
    const side = singleBoss.filter(x => x.cl.suit !== 'T');
    const trump = singleBoss.filter(x => x.cl.suit === 'T');
    const lowSide = scored.filter(x => x.cl.type === 'single' && x.cl.suit !== 'T')
      .sort((a, b) => (E.cardPoints(a.cards[0]) - E.cardPoints(b.cards[0])) || (a.cl.top - b.cl.top));
    const lowTrump = scored.filter(x => x.cl.type === 'single' && x.cl.suit === 'T')
      .sort((a, b) => (E.cardPoints(a.cards[0]) - E.cardPoints(b.cards[0])) || (a.cl.top - b.cl.top));
    const greedyPick = (multi[0] || side[0] || trump[0] || lowSide[0] || lowTrump[0] || scored[0]);
    scored.unshift(greedyPick);
  }

  /* 收官蒙特卡洛融合 */
  let pick = scored[0].cards;
  if (cfg.EG) {
    const eg = endgameSearch(view, null, scored.slice(0, cfg.EG_MAX_CANDS).map(x => x.cards), cfg, track);
    if (eg) {
      const top = eg[0];
      if (top.u - egCurU(eg, scored[0].cards) > cfg.EG_MARGIN) { pick = top.cards; }
    }
  }
  return pick;
}

/* ================= 收官蒙特卡洛 ================= */

function rngFrom(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 采样世界:各家张数 + 硬缺门 + maxHoldIn 上界 */
function sampleWorlds(track, view, K, cfg) {
  const trump = track.trump;
  const me = view.seat;
  const n = view.hand.length;
  const seats = [];
  for (let s = 0; s < 4; s++) if (s !== me) seats.push(s);
  /* 池:未见牌展开 */
  const pool = [];
  let fake = 1000;
  for (let si = 0; si < 5; si++) {
    const suit = si === 4 ? 'X' : SUITS[si];
    const lo = si === 4 ? 15 : 2, hi = si === 4 ? 16 : 14;
    for (let r = lo; r <= hi; r++) {
      const cnt = track.unseen[si * 17 + r];
      for (let q = 0; q < cnt; q++) pool.push({ suit: suit, rank: r, id: fake++ });
    }
  }
  /* 各家剩余容量:跟牌时已出过牌的家少一张 */
  const sizes = {};
  for (const s of seats) sizes[s] = track.hsize[s];
  const kittySize = (view.buriedKnown && view.buriedKnown.length) ? 0 : 8;
  if (pool.length !== seats.reduce((a, s) => a + sizes[s], 0) + kittySize) return [];
  const voids = track.voids;

  let seed = view.history.length * 7919 + me * 131 + n * 31;
  for (let i = 0; i < view.hand.length; i++) seed = (seed * 33 + view.hand[i].id) | 0;
  const rng = rngFrom(seed);
  const out = [];
  for (let k = 0; k < K; k++) {
    let world = null;
    for (let retry = 0; retry < TUNE.EG_RETRIES && !world; retry++) {
      const caps = { ...sizes };
      const buckets = {};
      for (const s of seats) buckets[s] = [];
      const kitty = [];
      /* 最受限先安排 */
      const order = pool.slice();
      const allow = order.map(c => {
        const es = E.effSuit(c, trump);
        const list = [];
        for (const s of seats) {
          if (voids[s] && voids[s][es]) continue;
          if (track.maxHoldIn(s, es) !== Infinity) {
            const cur = (buckets[s] || []).filter(x => E.effSuit(x, trump) === es).length;
            if (cur >= track.maxHoldIn(s, es)) continue;
          }
          list.push(s);
        }
        return list;
      });
      order.sort((a, b) => allow[order.indexOf(a)].length - allow[order.indexOf(b)].length);
      let ok = true;
      for (let i = 0; i < order.length && ok; i++) {
        const c = order[i];
        const es = E.effSuit(c, trump);
        const list = [];
        for (const s of seats) {
          if (caps[s] <= 0) continue;
          if (voids[s] && voids[s][es]) continue;
          const cur = buckets[s].filter(x => E.effSuit(x, trump) === es).length;
          if (track.maxHoldIn(s, es) !== Infinity && cur >= track.maxHoldIn(s, es)) continue;
          list.push(s);
        }
        if (!list.length) {
          if (kittySize > 0 && kitty.length < kittySize) { kitty.push(c); continue; }
          ok = false; break;
        }
        /* 剩余容量加权随机 */
        let tot = 0;
        for (const s of list) tot += caps[s];
        let r = rng() * tot;
        let pick = list[list.length - 1];
        for (const s of list) { r -= caps[s]; if (r <= 0) { pick = s; break; } }
        caps[pick]--;
        buckets[pick].push(c);
      }
      if (!ok) continue;
      /* 校验:每家恰好满 */
      let allFull = true;
      for (const s of seats) if (buckets[s].length !== sizes[s]) { allFull = false; break; }
      if (!allFull) continue;
      const hands = [null, null, null, null];
      hands[me] = view.hand;
      for (const s of seats) hands[s] = buckets[s];
      world = { hands, kitty };
    }
    if (world) out.push(world);
  }
  return out;
}

/* 便宜走子(rollout) */
function rollLead(hands, seat, trump, memSeen) {
  /* 世界感知领出:claude rolloutSmartLead 同款 ——
   * 在采样世界里用对手真实手牌判「压不压得住」,而不是用记牌概率。
   * 走子策略便宜但要对,这比单样本质量值钱(官方教训:rollout 里判钢板占了大半开销还失真)。 */
  const hand = hands[seat];
  const bySuit = { T: [], S: [], H: [], D: [], C: [] };
  for (const c of hand) bySuit[E.effSuit(c, trump)].push(c);
  let best = null, bv = -1e9;
  for (const es in bySuit) {
    const comps = E.decompose(bySuit[es], trump);
    for (const comp of comps) {
      const cl = E.classify(comp.cards, trump);
      /* 对手(非队友)谁压得住 */
      let beaten = false;
      for (let k = 1; k < 4 && !beaten; k++) {
        const p2 = (seat + k) % 4;
        if (p2 % 2 === seat % 2) continue;
        const sc = hands[p2].filter(c => E.effSuit(c, trump) === cl.suit);
        if (sc.length) {
          if (E.canBeatComp(sc, { type: cl.type, top: cl.top, len: cl.len, cards: cl.cards }, trump)) beaten = true;
        } else if (cl.suit !== 'T') {
          const tc = hands[p2].filter(c => E.effSuit(c, trump) === 'T');
          if (tc.length && (cl.type === 'single' ||
              E.canBeatComp(tc, { type: cl.type, top: -1, len: cl.len, cards: cl.cards }, trump))) beaten = true;
        }
      }
      const pts = E.countPoints(comp.cards);
      const v = (beaten ? -6 : 12) + comp.cards.length * 2 - pts * (beaten ? 1.5 : 0) - cl.top * 0.25;
      if (v > bv) { bv = v; best = comp.cards.slice(); }
    }
  }
  return best && best.length ? best : [hand[0]];
}

function isBossFromSeen(cards, trump, memSeen, own) {
  for (const c of cards) {
    const es = E.effSuit(c, trump);
    const o = E.ordIdx(c, trump);
    for (let si = 0; si < 5; si++) {
      const suit = si === 4 ? 'X' : SUITS[si];
      const lo = si === 4 ? 15 : 2, hi = si === 4 ? 16 : 14;
      for (let r = lo; r <= hi; r++) {
        const probe = { suit: suit, rank: r };
        if (E.effSuit(probe, trump) !== es) continue;
        if (E.ordIdx(probe, trump) <= o) continue;
        if (!memSeen) return false;
        if ((memSeen[si * 17 + r] || 0) + (own ? (own[si * 17 + r] || 0) : 0) < 2) return false;
      }
    }
  }
  return true;
}

function rollFollow(hand, leadCl, trump, plays, seat) {
  const cur = trickWinnerSoFar(plays, trump);
  const partnerWinning = cur.seat % 2 === seat % 2 && cur.seat !== seat;
  const isLast = plays.length === 3;
  const ptsTable = plays.reduce((s, p) => s + E.countPoints(p.cards), 0);
  if (!partnerWinning) {
    if (ptsTable > 0 || isLast) {
      const win = minWinT(null, hand, leadCl, cur.cl, isLast, trump);
      if (win) return win;
    }
    const cheap = minFollowSimple(hand, leadCl, trump, false);
    return cheap;
  }
  if (isLast) {
    /* 队友赢定:贴分 */
    return buildFollowStratT(hand, leadCl, trump, 'dump');
  }
  return buildFollowStratT(hand, leadCl, trump, 'cheap');
}

function minWinT(_, hand, leadCl, curCl, isLast, trump) {
  const track = { trump, getSuit: () => ({ n: 0, cards: [] }) };
  return minWin(track, hand, leadCl, curCl, isLast);
}

function minFollowSimple(hand, leadCl, trump, avoidPoints) {
  const n = leadCl.cards.length;
  const inSuit = hand.filter(c => E.effSuit(c, trump) === leadCl.suit);
  const rest = hand.filter(c => E.effSuit(c, trump) !== leadCl.suit);
  if (inSuit.length <= n) return inSuit.concat(rest.slice(0, n - inSuit.length));
  const need = E.pairsInLead(leadCl);
  const must = Math.min(need, E.countPairsIn(inSuit));
  const comps = E.decompose(inSuit, trump);
  let chosen = [];
  if (E.RULES.strictTractorFollow && leadCl.type === 'tractor') {
    const full = comps.find(c => c.type === 'tractor' && c.len >= leadCl.len);
    if (full) chosen = full.cards.slice(0, leadCl.len * 2);
    else if (E.RULES.partialTractorFollow) {
      const part = comps.filter(c => c.type === 'tractor').sort((a, b) => b.len - a.len)[0];
      if (part) chosen = part.cards.slice(0, Math.min(part.cards.length, n));
    }
  }
  const used = new Set(chosen.map(c => c.id));
  const pairUnits = [];
  for (const c of comps) {
    if (c.type === 'pair') pairUnits.push(c.cards);
    if (c.type === 'tractor') for (let i = 0; i < c.len; i++) pairUnits.push(c.cards.slice(i * 2, i * 2 + 2));
  }
  let have = Math.floor(chosen.length / 2);
  for (const u of pairUnits) {
    if (have >= must || chosen.length + 2 > n) break;
    if (u.some(c => used.has(c.id))) continue;
    u.forEach(c => used.add(c.id));
    chosen.push(...u); have++;
  }
  const rest2 = inSuit.filter(c => !used.has(c.id)).sort((a, b) => cheapKey(a, trump) - cheapKey(b, trump));
  while (chosen.length < n && rest2.length) chosen.push(rest2.shift());
  return chosen;
}

function buildFollowStratT(hand, leadCl, trump, strat) {
  const n = leadCl.cards.length;
  const inSuit = hand.filter(c => E.effSuit(c, trump) === leadCl.suit);
  const rest = hand.filter(c => E.effSuit(c, trump) !== leadCl.suit);
  if (inSuit.length <= n) {
    const out = inSuit.slice();
    const rs = rest.slice().sort((a, b) => (strat === 'dump' ? dumpKey(a, trump) - dumpKey(b, trump) : cheapKey(a, trump) - cheapKey(b, trump)));
    while (out.length < n && rs.length) out.push(rs.shift());
    return out;
  }
  return minFollowSimple(hand, leadCl, trump, false);
}

/* 走子到底(各家只用公共记牌判钢板 —— 不共享搜索者信息) */
function rollToEnd(hands, trump, plays0, leader, declTeam, kitty) {
  const teamPts = [0, 0];
  const mem = new Int8Array(85);
  for (let i = 0; i < plays0.length; i++) for (const c of plays0[i].cards) mem[ccode(c)]++;
  let cur = plays0.slice();
  let ldr = leader;
  let lastWinner = -1, lastSize = 1, guard = 0;
  while (guard++ < 30) {
    while (cur.length < 4) {
      const seat = (ldr + cur.length) % 4;
      const leadCl = E.classify(cur[0].cards, trump);
      const cd = rollFollow(hands[seat], leadCl, trump, cur, seat);
      for (const c of cd) {
        const i = hands[seat].findIndex(x => x.id === c.id);
        if (i >= 0) hands[seat].splice(i, 1);
      }
      for (const c of cd) mem[ccode(c)]++;
      cur.push({ seat, cards: cd });
    }
    const r = E.resolveTrick(cur, trump);
    if (r.winner % 2 !== declTeam) teamPts[1 - declTeam] += r.points;
    lastWinner = r.winner; lastSize = cur[0].cards.length;
    ldr = r.winner;
    if (!hands.some(h => h.length)) break;
    const lc = rollLead(hands, ldr, trump, mem);
    for (const c of lc) { mem[ccode(c)]++; const i = hands[ldr].findIndex(x => x.id === c.id);
      if (i >= 0) hands[ldr].splice(i, 1);
    }
    cur = [{ seat: ldr, cards: lc }];
  }
  const defPoints = teamPts[1 - declTeam];
  const sc = E.scoreRound({ defPoints, kitty, defWonLastTrick: lastWinner % 2 !== declTeam, lastLeadSize: lastSize });
  return { sc, defPoints, lastWinner, lastSize };
}

/* 级数效用(含 0.008 连续项) */
function levelUtility(sc, myTeam, declTeam, cfg) {
  let gain, lose, myPts;
  if (sc.defendersWin) {
    gain = declTeam === myTeam ? 0 : 1 + sc.defenderLevelsUp;
    lose = declTeam === myTeam ? 1 : 0;
    myPts = declTeam === myTeam ? 200 - sc.total : sc.total;
  } else {
    gain = declTeam === myTeam ? sc.declarerLevelsUp : 0;
    lose = 0;
    myPts = declTeam === myTeam ? 200 - sc.total : sc.total;
  }
  return gain - lose + cfg.EG_PTS_EPS * myPts;
}

function egCurU(eg, cards) {
  const ids = cards.map(c => c.id).join(',');
  for (const e of eg) if (e.ids === ids) return e.u;
  return -1e9;
}

function endgameSearch(view, plays, cands, cfg, track) {
  if (!cfg.EG) return null;
  const n = view.hand.length;
  if (n < 1 || n > cfg.EG_MAX_CARDS) return null;
  if (view.declSeat === undefined || view.declSeat < 0) return null;
  if (cands.length < 2 || cands.length > cfg.EG_MAX_CANDS) return null;
  const worlds = cfg.EG_SOFT_SAMPLE
    ? SMP.sampleWorldsSoft(track, view, cfg.EG_SAMPLES, cfg)
    : sampleWorlds(track, view, cfg.EG_SAMPLES, cfg);
  if (worlds.length < cfg.EG_MIN) return null;
  const trump = view.trump;
  const declTeam = view.declSeat % 2;
  const myTeam = view.myTeam;
  const me = view.seat;
  const kittyReal = (view.buriedKnown && view.buriedKnown.length) ? view.buriedKnown : null;
  const leader = plays ? plays[0].seat : me;
  const plays0 = plays || [];

  const out = [];
  for (const cd of cands) {
    let tot = 0;
    const myPlays = plays0.concat([{ seat: me, cards: cd }]);
    for (const w of worlds) {
      /* 我的手牌在所有世界里是同一份拷贝 */
      const hands = [w.hands[0].slice(), w.hands[1].slice(), w.hands[2].slice(), w.hands[3].slice()];
      const ids = new Set(cd.map(c => c.id));
      hands[me] = hands[me].filter(c => !ids.has(c.id));
      const kitty = kittyReal || w.kitty;
      const r = rollToEnd(hands, trump, myPlays, leader, declTeam, kitty);
      let u = levelUtility(r.sc, myTeam, declTeam, cfg);
      if (cfg.W_UTIL && WT) {
        try {
          const adv = E.advanceMatch(view.levels, view.declSeat, r.sc,
            (view.gates && view.gates.length) ? view.gates : null, view.played);
          const wb = WT.W(view.levels[0], view.levels[1], view.declSeat % 2);
          const wa = WT.W(adv.levels[0], adv.levels[1], adv.dealer % 2);
          u += (wa - wb) * cfg.W_SCALE;
        } catch (e2) { /* 忽略 */ }
      }
      tot += u;
    }
    out.push({ cards: cd, u: tot / worlds.length, ids: cd.map(c => c.id).join(',') });
  }
  out.sort((a, b) => b.u - a.u);
  return out;
}

/* ================= 工厂 ================= */

function create(overrides) {
  const cfg = Object.assign({}, TUNE, overrides || {});
  const fb = { deal: 0, rebel: 0, discard: 0, lead: 0, follow: 0 };
  return {
    name: 'deepseek-v4-pro-v2',
    fallbacks: fb,
    onDeal(view) {
      try { return onDeal2(view, cfg); } catch (e) { fb.deal++; return null; }
    },
    onRebel(view) {
      try { return onRebel2(view, cfg); } catch (e) { fb.rebel++; return false; }
    },
    discard(view) {
      try {
        const d = discard2(view, cfg);
        if (d && d.length === 8) return d;
      } catch (e) { fb.discard++; }
      return view.hand.slice(0, 8);
    },
    lead(view) {
      try {
        const l = lead2(view, cfg);
        if (l && l.length && E.classify(l, view.trump)) return l;
      } catch (e) { fb.lead++; }
      return [view.hand[0]];
    },
    follow(view, plays) {
      try {
        const f = follow2(view, plays, cfg);
        if (f && f.length && E.isLegalFollow(view.hand, E.classify(plays[0].cards, view.trump), f, view.trump)) return f;
      } catch (e) { fb.follow++; }
      return view.hand.slice(0, plays[0].cards.length);
    },
  };
}

module.exports = { TUNE, create, buildTrack, pNone, unseenBeats, pBeaterIn, kOf, pSurvive, myLevelGain, stairEV, trumpHold, phaseK, futureValue, minFollow, minWin, globalIdx, cheapKey, dumpKey, ccode, lead2, follow2, discard2, onDeal2 };
