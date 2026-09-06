'use strict';
/* kimi-k3 策略。CFG 开关制:每个改动一个开关,默认值为当前 baseline;
 * dev 下用 makeAI({flag:!default}) 做 A/B。所有决策只依赖 view(冻结),不跨调用留状态。 */

const E = require('./engine.js');

const CFG = {
  minWin: true,         // R1 留:+20.5±0.5 级(40 seeds)。能赢时用"最小赢牌"替代"最大牌"
  partnerPoints: true,  // R2 留:+13.4±1.2 级(40 seeds)。队友正赢时添分
  cheapDump: true,      // R4 留:+2.15±0.96 级(40 seeds)。输墩时优先垫非分牌
  leadV1: false,        // lead: 先副A,庄家方主强抽主 [R5 退:-6.2±1.1]
  leadAce: false,       // lead: 只先出副A
  leadTrumpPull: false, // lead: 只庄家方主强抽主 [R5b 量不出:+1.0±1.1]
  leadV2: true,         // R6 留:+8.6±1.2 级(40 seeds)。领副牌拖拉机/对子(对子要 top≥J)
  throwLead: true,      // R7 留:+9.35±1.05 级(40 seeds)。安全甩牌
  throwRisk1: false,    // lead: 甩牌里单张组件允许至多1张天敌
  pairLeadAny: true,    // R10 留:+5.4±1.2 级(40 seeds)。任意对子都领
  leadLowFromLong: false, // lead: 兜底改为长门最小牌 [R12 退:-0.35±1.33]
  declareLen: 5,        // onDeal: 单张亮主的门长阈值 [R13: 4/6 均量不出,维持5]
  ruffMinPts: 0,        // follow: [R14 退:-3.1±1.3 @10] 毙牌不值是个伪命题,能毙就毙
  safePoints: false,    // follow: [R15 退:-5.5±1.5] 添分不查保险
  declareSingle: true,  // onDeal: 单张亮主开关 [R16: 关掉量不出,-0.08±1.28]
  pairOverrideLen: 0,   // onDeal: [R17 退:几乎不改变行为,-0.08±0.30]
  leadTrumpComps: true,   // R19 留:+4.4±1.4 级(40 seeds)。主牌对子/拖拉机也领
  leadPartnerVoid: false, // lead: 领队友已知绝门的牌(给队友搭桥毙)
  avoidOppVoid: false,    // lead: 兜底单张避开对手已知绝门
  leadKnownWinners: false, // lead: [R18 退:+0.5±1.07 量不出]
  overRuffCare: false,  // follow: 毙牌后可能被超毙且墩里分少 → 不毙
  dumpToVoid: false,    // follow: 垫牌优先最短副门
  trumpLast: true,      // R24 留:+2.65±1.1 级(40 seeds)。断门垫牌尽量不动主
  dumpToVoid: false,    // follow: [R23 退:-1.1±1.1]
  overRuffCare: false,  // follow: [R22 退:-0.8±0.5]
  partnerPointsLow: false, // follow: [R25 退:-6.1±1.25] 添分就要往大里添
  declareJokerND: false, // onDeal: [R27 退:几乎不触发,0±0.1]
  declareLenND: 0,      // onDeal: [R26 退:+0.15±1.04]
  minWinNoBreak: false, // follow: [R28 退:-0.08±0.75]
  endgameLeadT: false,  // lead: [R29 退:-0.58±0.77 @40] 残局领最大主守底量不出
  discardV2: true,      // R30 留:+6.7±0.74 级(150 seeds 确认)。最短副门整门优先扣
  discardV3: false,     // 扣底:[R32 退:-2.15±1.48] discardV2 留 A 破坏绝门,负
  discardV4: false,     // 扣底:[R33 退:+0.05±0.51 @150] 同长按门内总分,量不出
  leadTrumpOnlyDecl: false, // lead: [R34 退:+0.48±0.65 @150] 主组件仅庄家方领,量不出
  leadShortLate: false, // lead: [R35 退:-0.18±1.37] 残局领最短副门造绝门,噪声偏负
  pairDeclareLen: 0,    // onDeal: [R36 退:+0.007±0.238 @150] 新亮级数对要求门长,量不出
  tractorLenFirst: false, // lead: [R37 退:行为不同率 3%,拖拉机选择太稀有,量不到]
  pairDeclareBest: false, // onDeal: [R38 退:行为不同率 0%,多对级数对不存在]
  declareJoker: false,  // onDeal: 对方亮主且我方主弱(nT≤5)时用王对反无主
  rebelNo: false,       // onRebel: 关掉恒 true(对照用)
  discardV1: false,     // 扣底:绝门/留A/留对子评分 [R3 退:150 seeds +0.22±0.66 量不出]
  buryPoints: false,    // 扣底:优先把分埋进底(仅 discardV1)[R3b 退:-0.3±1.2]
};

/* ---------- 小工具 ---------- */

function splitSuits(hand, trump) {
  const m = new Map();
  for (const c of hand) {
    const s = E.effSuit(c, trump);
    if (!m.has(s)) m.set(s, []);
    m.get(s).push(c);
  }
  for (const arr of m.values()) arr.sort((a, b) => E.ordIdx(b, trump) - E.ordIdx(a, trump));
  return m; // 每组 ordIdx 降序
}

const ord = (c, trump) => E.ordIdx(c, trump);

/* ---------- follow 候选 ---------- */

function candLow(hand, leadCl, trump) {
  return E.findLegalFollow(hand, leadCl, trump, null, {});
}
function candHigh(hand, leadCl, trump) {
  return E.findLegalFollow(hand, leadCl, trump, null, { high: true });
}
function candPoints(hand, leadCl, trump, lowFirst) {
  return E.findLegalFollow(hand, leadCl, trump, null, lowFirst ? { giveLowPoints: true } : { pointFirst: true });
}
function candDump(hand, leadCl, trump, suitLen, trumpLast) {
  const pref = { cheapDump: true };
  if (suitLen) pref.suitLen = suitLen;
  if (trumpLast) pref.trumpLast = true;
  return E.findLegalFollow(hand, leadCl, trump, null, pref);
}

// 校验:合法且真的赢
function winsTrick(hand, leadCl, trump, plays, seat, chosen) {
  if (!chosen) return false;
  if (!E.isLegalFollow(hand, leadCl, chosen, trump)) return false;
  return E.resolveTrick(plays.concat([{ seat, cards: chosen }]), trump).winSeat === seat;
}

// 最小赢牌候选(single/pair/tractor;throw 不试)
function candMinWin(hand, leadCl, trump, plays, seat, noBreak) {
  const bestIdx = E.resolveTrick(plays, trump).winIdx;
  const bestCl = E.classify(plays[bestIdx].cards, trump);
  const suitCards = hand.filter(c => E.effSuit(c, trump) === leadCl.suit);
  const haveSuit = suitCards.length > 0;
  const trumps = hand.filter(c => E.effSuit(c, trump) === 'T');
  const pairKeys = new Set();
  if (noBreak) {
    for (const g of groupPairs(hand, trump)) pairKeys.add(g.cards[0].suit + '|' + g.cards[0].rank);
  }
  const brk = c => (pairKeys.has(c.suit + '|' + c.rank) ? 1 : 0);
  const asc = (a, b) => (brk(a) - brk(b)) || (ord(a, trump) - ord(b, trump));

  // 在某个牌池里找:single → 最小且 >minTop 的牌;pair/tractor → 最小且 top>minTop 的同型组件
  const pickFrom = (pool, minTop) => {
    if (leadCl.type === 'single') {
      const c = pool.filter(c => ord(c, trump) > minTop).sort(asc)[0];
      return c ? [c] : null;
    }
    if (leadCl.type === 'pair') {
      const groups = groupPairs(pool, trump);
      const g = groups.filter(g => g.top > minTop).sort((a, b) => a.top - b.top)[0];
      return g ? g.cards : null;
    }
    if (leadCl.type === 'tractor') {
      const segs = tractorSegs(pool, trump, leadCl.len);
      const s = segs.filter(sg => sg.top > minTop).sort((a, b) => a.top - b.top)[0];
      return s ? s.cards : null;
    }
    return null;
  };

  let chosen = null;
  if (haveSuit) {
    // 只能走本门;有人毙过( best 是主 )就赢不了
    if (bestCl.suit === leadCl.suit) chosen = pickFrom(suitCards, bestCl.top);
  } else {
    // 断门:主牌路。best 是主 → 要更大的主;否则任意主
    const minTop = bestCl.suit === 'T' ? bestCl.top : -1;
    chosen = pickFrom(trumps, minTop);
  }
  return winsTrick(hand, leadCl, trump, plays, seat, chosen) ? chosen : null;
}

function groupPairs(cards, trump) {
  const m = new Map();
  for (const c of cards) {
    const k = c.suit + '|' + c.rank;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(c);
  }
  const out = [];
  for (const g of m.values())
    if (g.length >= 2) out.push({ top: ord(g[0], trump), cards: [g[0], g[1]] });
  return out;
}

// pool 里所有长度 len 的连续对子段
function tractorSegs(cards, trump, len) {
  const pairs = groupPairs(cards, trump).sort((a, b) => a.top - b.top);
  const out = [];
  let i = 0;
  while (i < pairs.length) {
    let j = i;
    while (j + 1 < pairs.length && pairs[j + 1].top === pairs[j].top + 1) j++;
    for (let s = i; s + len - 1 <= j; s++) {
      const seg = pairs.slice(s, s + len);
      const all = [];
      for (const p of seg) all.push(p.cards[0], p.cards[1]);
      out.push({ top: seg[seg.length - 1].top, cards: all });
    }
    i = j + 1;
  }
  return out;
}

/* ---------- onDeal ---------- */

function decideDeclare(view, cfg) {
  const rank = view.trumpRank;
  const hand = view.hand;
  const cur = view.curDecl;
  const seat = view.seat;

  const lvlBySuit = new Map(), suitCnt = new Map();
  let j15 = 0, j16 = 0;
  for (const c of hand) {
    if (c.rank === 15) j15++;
    if (c.rank === 16) j16++;
    if (c.suit === 'X') continue;
    suitCnt.set(c.suit, (suitCnt.get(c.suit) || 0) + 1);
    if (c.rank === rank) lvlBySuit.set(c.suit, (lvlBySuit.get(c.suit) || 0) + 1);
  }

  if (cur && cur.seat === seat) {
    if (cur.strength === 1 && !view.rebelHappened && (lvlBySuit.get(cur.suit) || 0) >= 2)
      return { suit: cur.suit, strength: 2 };
    return null;
  }
  if (cfg.declareJoker && cur) {
    // 对方已亮:我方在其主下太弱 → 王对反无主
    const wouldTrump = { suit: cur.suit, rank };
    let nT = 0;
    for (const c of hand) if (E.effSuit(c, wouldTrump) === 'T') nT++;
    if (nT <= 5) {
      if (j16 >= 2) return { suit: null, strength: 4 };
      if (j15 >= 2) return { suit: null, strength: 3 };
    }
  }
  if (cfg.declareJokerND && !view.dealerKnown && !cur) {
    if (j16 >= 2) return { suit: null, strength: 4 };
    if (j15 >= 2) return { suit: null, strength: 3 };
  }
  for (const [suit, n] of lvlBySuit) {
    if (n >= 2 && (!cur || cur.strength < 2)) {
      if (cur && (suitCnt.get(suit) || 0) < cfg.pairOverrideLen) continue;
      if (!cur && (suitCnt.get(suit) || 0) < cfg.pairDeclareLen) continue;
      if (cfg.pairDeclareBest) {
        // 收集所有可亮的对子,选门最长的
        let best = null;
        for (const [s2, n2] of lvlBySuit) {
          if (n2 >= 2 && (!best || (suitCnt.get(s2) || 0) > best.len))
            best = { suit: s2, len: suitCnt.get(s2) || 0 };
        }
        return best ? { suit: best.suit, strength: 2 } : null;
      }
      return { suit, strength: 2 };
    }
  }
  if (!cur && cfg.declareSingle) {
    const minLen = (!view.dealerKnown && cfg.declareLenND) ? cfg.declareLenND : cfg.declareLen;
    let best = null;
    for (const [suit, n] of lvlBySuit) {
      if (n >= 1) {
        const len = suitCnt.get(suit) || 0;
        if (len >= minLen && (!best || len > best.len)) best = { suit, len };
      }
    }
    if (best) return { suit: best.suit, strength: 1 };
  }
  return null;
}

/* ---------- discard ---------- */

function decideDiscard(view, cfg) {
  const trump = view.trump;
  const nonTrump = [], trumps = [];
  for (const c of view.hand) (E.effSuit(c, trump) === 'T' ? trumps : nonTrump).push(c);
  let out;
  if (cfg.discardV3 && nonTrump.length > 8) {
    const suitLen = new Map();
    for (const c of nonTrump) suitLen.set(c.suit, (suitLen.get(c.suit) || 0) + 1);
    out = nonTrump.slice().sort((a, b) =>
      ((a.rank === 14 ? 1 : 0) - (b.rank === 14 ? 1 : 0)) ||
      (suitLen.get(a.suit) - suitLen.get(b.suit)) ||
      (E.cardPoints(a) - E.cardPoints(b)) ||
      (ord(a, trump) - ord(b, trump))).slice(0, 8);
  } else if (cfg.discardV4 && nonTrump.length > 8) {
    const suitLen = new Map(), suitPts = new Map();
    for (const c of nonTrump) {
      suitLen.set(c.suit, (suitLen.get(c.suit) || 0) + 1);
      suitPts.set(c.suit, (suitPts.get(c.suit) || 0) + E.cardPoints(c));
    }
    out = nonTrump.slice().sort((a, b) =>
      (suitLen.get(a.suit) - suitLen.get(b.suit)) ||
      (suitPts.get(a.suit) - suitPts.get(b.suit)) ||
      (E.cardPoints(a) - E.cardPoints(b)) ||
      (ord(a, trump) - ord(b, trump))).slice(0, 8);
  } else if (cfg.discardV2 && nonTrump.length > 8) {
    const suitLen = new Map();
    for (const c of nonTrump) suitLen.set(c.suit, (suitLen.get(c.suit) || 0) + 1);
    out = nonTrump.slice().sort((a, b) =>
      (suitLen.get(a.suit) - suitLen.get(b.suit)) ||
      (E.cardPoints(a) - E.cardPoints(b)) ||
      (ord(a, trump) - ord(b, trump))).slice(0, 8);
  } else if (cfg.discardV1 && nonTrump.length > 8) {
    const bySuit = new Map();
    for (const c of nonTrump) {
      if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
      bySuit.get(c.suit).push(c);
    }
    const pairKeys = new Set();
    for (const arr of bySuit.values()) {
      const cnt = new Map();
      for (const c of arr) {
        cnt.set(c.rank, (cnt.get(c.rank) || 0) + 1);
        if (cnt.get(c.rank) === 2) pairKeys.add(c.suit + '|' + c.rank);
      }
    }
    const scored = nonTrump.map(c => {
      let s = ord(c, trump);
      if (pairKeys.has(c.suit + '|' + c.rank)) s += 4;
      if (bySuit.get(c.suit).length <= 3) s -= 6; // 追求绝门
      if (c.rank === 14) s += 8;                    // 留 A
      s += (cfg.buryPoints ? -1.0 : 0.8) * E.cardPoints(c);
      return { c, s };
    });
    scored.sort((a, b) => a.s - b.s);
    out = scored.slice(0, 8).map(x => x.c);
  } else {
    nonTrump.sort((a, b) => ord(a, trump) - ord(b, trump));
    out = nonTrump.slice(0, 8);
  }
  trumps.sort((a, b) => ord(a, trump) - ord(b, trump));
  let i = 0;
  while (out.length < 8) out.push(trumps[i++]);
  return out;
}

/* ---------- 剩余牌分析(history + 手牌 + 底牌 → 对手可能持有的牌) ---------- */

const DECK_CACHE = new Map(); // trump 无关,静态 108 张
function staticDeck() {
  if (!DECK_CACHE.has('d')) DECK_CACHE.set('d', E.makeDeck());
  return DECK_CACHE.get('d');
}

function oppCardsBySuit(view) {
  const trump = view.trump;
  const gone = new Set();
  for (const c of view.hand) gone.add(c.id);
  for (const p of view.history) for (const c of p.cards) gone.add(c.id);
  for (const c of view.buriedKnown) gone.add(c.id);
  const m = new Map();
  for (const c of staticDeck()) {
    if (gone.has(c.id)) continue;
    const s = E.effSuit(c, trump);
    if (!m.has(s)) m.set(s, []);
    m.get(s).push(c);
  }
  return m;
}

// 我方某门里能安全甩出的组件集;<2 个返回 null。risk: 单张允许的天敌数
function safeThrowComps(myCards, oppCards, trump, risk) {
  const comps = E.decompose(myCards, trump);
  if (comps.length < 2) return null;
  const oppComps = E.decompose(oppCards, trump);
  let oppPairTop = -1;
  for (const oc of oppComps)
    if ((oc.type === 'pair' || oc.type === 'tractor') && oc.top > oppPairTop) oppPairTop = oc.top;
  const safe = [];
  for (const comp of comps) {
    if (comp.type === 'single') {
      let beaters = 0;
      for (const c of oppCards) if (E.ordIdx(c, trump) > comp.top) beaters++;
      if (beaters <= (risk || 0)) safe.push(comp);
    } else if (comp.type === 'pair') {
      if (comp.top > oppPairTop) safe.push(comp);
    } else {
      const beatable = oppComps.some(oc => oc.type === 'tractor' && oc.len >= comp.len && oc.top > comp.top);
      if (!beatable) safe.push(comp);
    }
  }
  return safe.length >= 2 ? safe : null;
}

// 从 history 推断各家已知绝门(没跟出领出花色 → 绝该门)
function knownVoids(view) {
  const voids = [new Set(), new Set(), new Set(), new Set()];
  const H = view.history, trump = view.trump;
  for (let i = 0; i + 4 <= H.length; i += 4) {
    const leadSuit = E.effSuit(H[i].cards[0], trump);
    for (let k = 1; k < 4; k++) {
      const p = H[i + k];
      if (!p.cards.some(c => E.effSuit(c, trump) === leadSuit)) voids[p.seat].add(leadSuit);
    }
  }
  return voids;
}

/* ---------- lead ---------- */

function decideLead(view, cfg) {
  const trump = view.trump;
  const suits = splitSuits(view.hand, trump);
  let opp = null;
  const getOpp = () => (opp || (opp = oppCardsBySuit(view)));
  if (cfg.leadV1 || cfg.leadAce) {
    // 1. 副牌 A(优先长门里的 A)
    let aceLead = null;
    for (const [s, arr] of suits) {
      if (s === 'T') continue;
      const a = arr.find(c => c.rank === 14);
      if (a && (!aceLead || arr.length > aceLead.len)) aceLead = { card: a, len: arr.length };
    }
    if (aceLead) return [aceLead.card];
  }
  if (cfg.leadV1 || cfg.leadTrumpPull) {
    // 2. 庄家方主强(≥8)抽主
    if (view.myTeam === view.declSeat % 2) {
      const t = suits.get('T') || [];
      if (t.length >= 8) return [t[0]];
    }
  }
  if (cfg.throwLead) {
    // 安全甩牌:每门(含主)找全无敌组件组合,选张数最多的
    let best = null;
    for (const [s, arr] of suits) {
      const safe = safeThrowComps(arr, getOpp().get(s) || [], trump, cfg.throwRisk1 ? 1 : 0);
      if (safe) {
        const n = safe.reduce((sum, c) => sum + c.cards.length, 0);
        if (!best || n > best.n) best = { n, safe };
      }
    }
    if (best) {
      const cards = [];
      for (const c of best.safe) cards.push(...c.cards);
      return cards;
    }
  }
  if (cfg.leadV2) {
    // 拖拉机 / 对子(主门组件由 leadTrumpComps 控制)
    const comps = [];
    for (const [s, arr] of suits) {
      if (s === 'T' && !cfg.leadTrumpComps) continue;
      if (s === 'T' && cfg.leadTrumpOnlyDecl && view.myTeam !== view.declSeat % 2) continue;
      for (const comp of E.decompose(arr, trump)) comps.push(comp);
    }
    const tractors = comps.filter(x => x.type === 'tractor');
    if (tractors.length) {
      if (cfg.tractorLenFirst) tractors.sort((a, b) => b.len - a.len || b.top - a.top);
      else tractors.sort((a, b) => b.top - a.top || b.len - a.len);
      return tractors[0].cards.slice();
    }
    const pairs = comps.filter(x => x.type === 'pair' && (cfg.pairLeadAny || x.top >= 8)); // top ≥ J
    if (pairs.length) {
      pairs.sort((a, b) => b.top - a.top);
      return pairs[0].cards.slice();
    }
  }
  if (cfg.leadKnownWinners) {
    // 必赢单张:我顶张 > 对手该门剩余最大
    let best = null;
    for (const [s, arr] of suits) {
      if (s === 'T') continue;
      let oppTop = -1;
      for (const c of getOpp().get(s) || []) {
        const o = E.ordIdx(c, trump);
        if (o > oppTop) oppTop = o;
      }
      if (E.ordIdx(arr[0], trump) > oppTop && (!best || arr.length > best.len))
        best = { card: arr[0], len: arr.length };
    }
    if (best) return [best.card];
  }
  if (cfg.leadShortLate && view.hand.length <= 6) {
    // 残局:领最短副门的最小牌,造绝门等毙
    let shortArr = null;
    for (const [s, arr] of suits) {
      if (s === 'T') continue;
      if (arr.length <= 2 && (!shortArr || arr.length < shortArr.length)) shortArr = arr;
    }
    if (shortArr) return [shortArr[shortArr.length - 1]];
  }
  if (cfg.endgameLeadT && view.hand.length <= 2) {
    // 残局:领最大主(没有则最大牌)守底
    const t = suits.get('T') || [];
    if (t.length) return [t[0]];
    let bestC = null;
    for (const [s, arr] of suits) {
      if (s === 'T') continue;
      if (!bestC || E.ordIdx(arr[0], trump) > E.ordIdx(bestC, trump)) bestC = arr[0];
    }
    if (bestC) return [bestC];
  }
  if (cfg.leadPartnerVoid) {
    // 领队友已知绝门、且对手还持有的牌:出最小那张,让队友毙
    const partner = (view.seat + 2) % 4;
    const voids = knownVoids(view)[partner];
    let best = null;
    for (const s of voids) {
      if (s === 'T') continue;
      const arr = suits.get(s);
      if (!arr || !arr.length) continue;
      const oppN = (getOpp().get(s) || []).length;
      if (oppN === 0) continue; // 对手也没这门,毙了白毙
      if (!best || oppN > best.oppN) best = { card: arr[arr.length - 1], oppN };
    }
    if (best) return [best.card];
  }
  let bestArr = null;
  for (const [s, arr] of suits) {
    if (s === 'T') continue;
    if (cfg.avoidOppVoid) {
      const voids = knownVoids(view);
      const opp1 = (view.seat + 1) % 4, opp2 = (view.seat + 3) % 4;
      if (voids[opp1].has(s) || voids[opp2].has(s)) continue;
    }
    if (!bestArr || arr.length > bestArr.length) bestArr = arr;
  }
  if (!bestArr) { // 全被避开则退回不过滤
    for (const [s, arr] of suits) {
      if (s === 'T') continue;
      if (!bestArr || arr.length > bestArr.length) bestArr = arr;
    }
  }
  if (bestArr) return [cfg.leadLowFromLong ? bestArr[bestArr.length - 1] : bestArr[0]];
  return [suits.get('T')[0]];
}

// 队友当前赢位是否保险(末家必保险;否则按剩余牌估算)
function partnerWinSecure(view, plays) {
  if (plays.length === 3) return true;
  const trump = view.trump;
  const bestIdx = E.resolveTrick(plays, trump).winIdx;
  const cl = E.classify(plays[bestIdx].cards, trump);
  const opp = oppCardsBySuit(view);
  if (cl.suit === 'T') {
    for (const c of opp.get('T') || []) if (E.ordIdx(c, trump) > cl.top) return false;
    return true;
  }
  for (const c of opp.get(cl.suit) || []) if (E.ordIdx(c, trump) > cl.top) return false;
  return (opp.get('T') || []).length === 0; // 还有主在外就可能被毙
}

/* ---------- follow ---------- */

function decideFollow(view, plays, cfg) {
  const trump = view.trump, hand = view.hand, seat = view.seat;
  const leadCl = E.classify(plays[0].cards, trump);
  const curWin = E.resolveTrick(plays, trump).winSeat;
  const partner = (seat + 2) % 4;
  const low = candLow(hand, leadCl, trump);

  if (curWin === partner) {
    if (cfg.partnerPoints && !(cfg.safePoints && !partnerWinSecure(view, plays)))
      return candPoints(hand, leadCl, trump, cfg.partnerPointsLow);
    return low;
  }
  if (cfg.minWin) {
    const mw = candMinWin(hand, leadCl, trump, plays, seat, cfg.minWinNoBreak);
    if (mw) {
      const isRuff = E.effSuit(mw[0], trump) === 'T' && leadCl.suit !== 'T';
      if (isRuff && (cfg.ruffMinPts > 0 || cfg.overRuffCare)) {
        let pts = 0;
        for (const p of plays) pts += E.countPoints(p.cards);
        let skip = cfg.ruffMinPts > 0 && pts < cfg.ruffMinPts;
        if (!skip && cfg.overRuffCare && pts < 10) {
          // 我之后还有已知绝门的对手,且我的毙牌不是剩余最大主 → 可能被超毙
          const voids = knownVoids(view);
          const myTeam = seat % 2;
          let risky = false;
          for (let off = plays.length + 1; off < 4 && !risky; off++) {
            const s2 = (plays[0].seat + off) % 4;
            if (s2 % 2 !== myTeam && voids[s2].has(leadCl.suit)) risky = true;
          }
          if (risky) {
            const opp = oppCardsBySuit(view);
            let myTop = -1;
            for (const c of mw) { const o = E.ordIdx(c, trump); if (o > myTop) myTop = o; }
            let oppTop = -1;
            for (const c of opp.get('T') || []) { const o = E.ordIdx(c, trump); if (o > oppTop) oppTop = o; }
            if (myTop < oppTop) skip = true;
          }
        }
        if (skip) return dumpCand(hand, leadCl, trump, low, view, cfg);
      }
      return mw;
    }
  } else {
    const high = candHigh(hand, leadCl, trump);
    if (winsTrick(hand, leadCl, trump, plays, seat, high)) return high;
  }
  return dumpCand(hand, leadCl, trump, low, view, cfg);
}

function dumpCand(hand, leadCl, trump, low, view, cfg) {
  if (cfg.cheapDump) {
    let suitLen = null;
    if (cfg.dumpToVoid) {
      suitLen = new Map();
      for (const c of hand) {
        const s = E.effSuit(c, trump);
        suitLen.set(s, (suitLen.get(s) || 0) + 1);
      }
    }
    return candDump(hand, leadCl, trump, suitLen, cfg.trumpLast);
  }
  return low;
}

/* ---------- 工厂 ---------- */

module.exports = function makeAI(over) {
  const cfg = Object.assign({}, CFG, over);
  return {
    name: 'kimi-k3',
    onDeal(view) {
      try { return decideDeclare(view, cfg); } catch (e) { return null; }
    },
    onRebel(view) {
      try { return !cfg.rebelNo; } catch (e) { return false; }
    },
    discard(view) {
      try {
        const d = decideDiscard(view, cfg);
        if (Array.isArray(d) && d.length === 8) return d;
      } catch (e) { /* fallthrough */ }
      return view.hand.slice(0, 8);
    },
    lead(view) {
      try {
        const c = decideLead(view, cfg);
        if (Array.isArray(c) && c.length > 0) return c;
      } catch (e) { /* fallthrough */ }
      return [view.hand[0]];
    },
    follow(view, plays) {
      try {
        const c = decideFollow(view, plays, cfg);
        if (Array.isArray(c) && c.length > 0) return c;
      } catch (e) { /* fallthrough */ }
      return E.findLegalFollow(view.hand, E.classify(plays[0].cards, view.trump), view.trump);
    },
  };
};
module.exports.CFG = CFG;
