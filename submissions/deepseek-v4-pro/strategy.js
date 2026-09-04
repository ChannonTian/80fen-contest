'use strict';

/* strategy.js —— deepseek-v4-pro 的决策逻辑。
 *
 * 纯 JS 内建、确定性(无 Math.random / Date / 环境依赖)。view 一律只读。
 * 结构:
 *   create()                 → 工厂返回值 {name, onDeal, onRebel, discard, lead, follow}
 *   buildTrack(view)         → 记牌: 未见牌、已得分、剩余墩
 *   minFollow(...)           → 满足一切跟牌义务的最小合法跟 (AI 兜底 + 裁判替出用)
 *   各阶段的启发式决策函数。
 */

const E = require('./engine.js');

const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_IDX = { S: 0, H: 1, D: 2, C: 3 };

/* ================= 调参区 (每轮改动只动这里) ================= */
const TUNE = {
  /* 亮主 (注: 无庄局亮主=抢庄, 庄定局亮主=只改主色; 庄定局口径才是联赛主体) */
  BID_ENABLED: true,      // 亮主开关 (一次改动一个开关, 便于回退)
  OPEN_BID_MIN: 16,      // 无人亮时 我亮单的最低分
  OPEN_BID_NT_MIN: 13,   // 无人亮时 亮小王对(无主)的最低分
  OVERBID_MIN: 19,       // 反别人主的最低分
  OVERBID_NT_MIN: 15,    // 用王对反的最低分
  REBEL_ALWAYS: true,    // 造反: 被问就造反
  /* 跟牌 */
  AVOID_POINT_FEED: true, // 对手赢墩时垫非分牌, 不喂分
  /* 扣底 */
  BURY_VOID_MAX: 2,      // 断门目标: 张数 ≤ 此值的副门花色全埋
  DISCARD_WEAK_POINT_BUMP: 30,   // 弱庄: 分牌埋点上调 (少埋分, 防末墩×2)
  DISCARD_STRONG_POINT_DROP: 10, // 强庄: 分牌埋点下调 (多埋分保护)
  /* 出牌价值 */
  VAL_TRUMP_LEAD: 0.9,   // 吊主
  VAL_ACE_LEAD: 0.5,     // 首攻 A
  VAL_LOW_LEAD: 0.35,    // 小牌发展
  VAL_LAST_TRICK: 3.0,   // 末墩抢墩
  VAL_PAIR_LEAD_BASE: 0.55,
  PTS_WIN_FACTOR_DEF: 1.0,  // 闲家视角: 赢下的分
  PTS_WIN_FACTOR_DECL: 0.75, // 庄家视角: 拦下的分 (实测 0.75→0.0: decl +14.6, match +10.1级 —— 庄家不吃分不抢领出权)
  KILL_WIN_FACTOR_DECL: 0.75, // 庄家毙牌独立因子 (先与吃分同步, 待扫)
  DUMP_POINTS_FACTOR: 0.95, // 甩分到队友墩的收益(闲家)
  KILL_RISK_AFTER: 0.25,    // 后面还有人时 赢墩把握的折扣
};

/* ================= 基础工具 ================= */

function countRank(hand, suit, rank) {
  let n = 0;
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (c.suit === suit && c.rank === rank) n++;
  }
  return n;
}

function hasRankPair(hand, suit, rank) {
  return countRank(hand, suit, rank) >= 2;
}

function isTrumpCard(c, trump) {
  return E.effSuit(c, trump) === 'T';
}

function ordSortAsc(trump) {
  return (a, b) => E.ordIdx(a, trump) - E.ordIdx(b, trump);
}

function removeIds(hand, cards) {
  const ids = new Set();
  for (let i = 0; i < cards.length; i++) ids.add(cards[i].id);
  const out = [];
  for (let i = 0; i < hand.length; i++) if (!ids.has(hand[i].id)) out.push(hand[i]);
  return out;
}

/* 一手牌里同门的全部组件 */
function suitComps(hand, effS, trump) {
  const cs = [];
  for (let i = 0; i < hand.length; i++) if (E.effSuit(hand[i], trump) === effS) cs.push(hand[i]);
  return E.decompose(cs, trump);
}

function longestTractorLen(comps) {
  let m = 0;
  for (let i = 0; i < comps.length; i++) {
    if (comps[i].type === 'tractor' && comps[i].len > m) m = comps[i].len;
  }
  return m;
}

/* comps (已按序) 里长度恰为 L 的连续对片段 (返回对数组), 取 top 最小的 */
function tractorSlice(comps, L) {
  for (let i = 0; i < comps.length; i++) {
    const cm = comps[i];
    if (cm.type !== 'tractor' || cm.len < L) continue;
    const pairs = [];
    // 组件内对子按序; 取前 L 对
    let p = 0;
    for (let j = 0; j + 1 < cm.cards.length; j += 2) {
      if (p >= L) break;
      pairs.push([cm.cards[j], cm.cards[j + 1]]);
      p++;
    }
    if (pairs.length === L) return pairs;
  }
  return null;
}

/* ================= 记牌器 ================= */

/* 从未见牌视角统计。返回:
 * remSuitRank(suit, rank): 未见张数
 * defPts: 闲家已得分; tricksDone; tricksLeft
 * 辅助: unseenAbove(effS, t), pairSlotAbove(effS, t) → ordIdx 列表, tractorRunAbove
 */
function buildTrack(view) {
  const trump = view.trump;
  const me = view.seat;
  const declSeat = view.declSeat;
  // 已见牌
  const seen = new Map(); // `${suit}:${rank}` → count
  const addSeen = (cards) => {
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const k = c.suit + ':' + c.rank;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
  };
  addSeen(view.hand);
  for (let i = 0; i < view.history.length; i++) addSeen(view.history[i].cards);
  if (view.buriedKnown && view.buriedKnown.length) addSeen(view.buriedKnown);

  const rem = (suit, rank) => {
    if (suit === 'X') return 2 - (seen.get('X:' + rank) || 0);
    return 2 - (seen.get(suit + ':' + rank) || 0);
  };

  // 重放已完成的墩
  let defPts = 0;
  let tricksDone = 0;
  const hist = view.history;
  // 断门检测: 某家在某门领出时垫了别门 → 该家该门断门
  const voidSeats = new Map(); // suit -> Set(seat)
  const addVoid = (s, seat) => {
    let set = voidSeats.get(s);
    if (!set) { set = new Set(); voidSeats.set(s, set); }
    set.add(seat);
  };
  if (trump) {
    for (let i = 0; i + 4 <= hist.length; i += 4) {
      const plays = hist.slice(i, i + 4);
      const leadCls = E.classify(plays[0].cards, trump);
      if (leadCls) {
        for (let k = 1; k < 4; k++) {
          const ps = plays[k];
          let inSuit = 0;
          for (let j = 0; j < ps.cards.length; j++) {
            if (E.effSuit(ps.cards[j], trump) === leadCls.suit) inSuit++;
          }
          if (inSuit === 0) addVoid(leadCls.suit, ps.seat);
        }
      }
    }
    for (let i = 0; i + 4 <= hist.length; i += 4) {
      const r = E.resolveTrick(hist.slice(i, i + 4), trump);
      if (r.seat % 2 !== declSeat % 2) defPts += r.points;
      tricksDone++;
    }
  }
  // 剩余牌数 (剩余墩数的上界; 一墩可能多张)
  const cardsLeft = view.hand.length;

  /* 门内某序以上未见张数 */
  const unseenAbove = (effS, t) => {
    let n = 0;
    if (effS === 'T') {
      if (14 > t) n += rem('X', 15);
      if (15 > t) n += rem('X', 16);
      if (trump.suit === null) {
        for (let si = 0; si < 4; si++) {
          if (13 > t) n += rem(SUITS[si], trump.rank);
        }
      } else {
        for (let si = 0; si < 4; si++) {
          const s = SUITS[si];
          if (s === trump.suit) {
            if (13 > t) n += rem(s, trump.rank);
            for (let r = 2; r <= 14; r++) {
              if (r === trump.rank) continue;
              if (E.ordIdx({ suit: s, rank: r }, trump) > t) n += rem(s, r);
            }
          } else if (12 > t) {
            n += rem(s, trump.rank);
          }
        }
      }
    } else {
      for (let r = 2; r <= 14; r++) {
        if (r === trump.rank) continue;
        if (E.ordIdx({ suit: effS, rank: r }, trump) > t) n += rem(effS, r);
      }
    }
    return n;
  };

  /* 门内 t 之上「可能存在对子/拖拉机」的序位置列表 (每个位置代表可放一个对子) */
  const pairSlots = (effS) => {
    const slots = [];
    if (effS === 'T') {
      if (rem('X', 15) >= 2) slots.push(14);
      if (rem('X', 16) >= 2) slots.push(15);
      if (trump.suit === null) {
        for (let si = 0; si < 4; si++) {
          if (rem(SUITS[si], trump.rank) >= 2) slots.push(13);
        }
      } else {
        for (let si = 0; si < 4; si++) {
          const s = SUITS[si];
          if (s === trump.suit) {
            if (rem(s, trump.rank) >= 2) slots.push(13);
            for (let r = 2; r <= 14; r++) {
              if (r === trump.rank) continue;
              if (rem(s, r) >= 2) slots.push(E.ordIdx({ suit: s, rank: r }, trump));
            }
          } else {
            if (rem(s, trump.rank) >= 2) slots.push(12);
          }
        }
      }
    } else {
      for (let r = 2; r <= 14; r++) {
        if (r === trump.rank) continue;
        if (rem(effS, r) >= 2) slots.push(E.ordIdx({ suit: effS, rank: r }, trump));
      }
    }
    slots.sort((a, b) => a - b);
    return slots;
  };

  /* 甩牌判定用: 组件能否被别家压过 (保守估计: 未见牌全在别家手上) */
  const compBeatable = (comp, effS) => {
    if (comp.type === 'single') {
      return unseenAbove(effS, comp.top) > 0;
    }
    const slots = pairSlots(effS);
    if (comp.type === 'pair') {
      for (let i = 0; i < slots.length; i++) if (slots[i] > comp.top) return true;
      return false;
    }
    // tractor: 连续 L 个序 > comp.top
    let run = 0;
    let prev = -10;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s > comp.top && s === prev + 1) { run++; if (run >= comp.len) return true; }
      else run = (s > comp.top) ? 1 : 0;
      prev = s;
    }
    return false;
  };

  return {
    trump, me, declSeat,
    rem,
    defPts, tricksDone, tricksLeft: cardsLeft,
    unseenAbove, pairSlots, compBeatable,
    voidSeats,
  };
}

/* ================= 跟牌候选生成 ================= */

function pairsInLead(leadCls) {
  return E.countPairsIn(leadCls.cards);
}

/* 满足全部义务的最小合法跟。
 * avoidPoints=true 时: 在对手赢墩的态势下垫牌, 优先垫非分牌 (不喂分)。 */
function minFollow(hand, leadCls, trump, avoidPoints) {
  const n = leadCls.cards.length;
  const suit = leadCls.suit;
  const inSuit = [];
  const notSuit = [];
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (E.effSuit(c, trump) === suit) inSuit.push(c);
    else notSuit.push(c);
  }
  const needInSuit = Math.min(n, inSuit.length);
  const needPairs = pairsInLead(leadCls);
  let mustPairs = Math.min(needPairs, E.countPairsIn(inSuit));
  const chosen = [];
  const usedIds = new Set();
  const comps = E.decompose(inSuit, trump);
  const pairsAll = [];
  const singlesAll = [];
  for (let i = 0; i < comps.length; i++) {
    const cm = comps[i];
    if (cm.type === 'single') singlesAll.push(cm.cards[0]);
    else pairsAll.push(cm);
  }
  // 拖拉机义务
  if (leadCls.type === 'tractor') {
    const m = longestTractorLen(comps);
    if (m >= leadCls.len) {
      const slice = tractorSlice(comps, leadCls.len);
      if (slice) {
        for (let i = 0; i < slice.length; i++) {
          chosen.push(slice[i][0], slice[i][1]);
          usedIds.add(slice[i][0].id); usedIds.add(slice[i][1].id);
        }
        mustPairs -= slice.length;
      }
    } else if (m >= 2) {
      // partial: 必须跟出最长的那条
      for (let i = 0; i < comps.length; i++) {
        if (comps[i].type === 'tractor' && comps[i].len === m) {
          for (let j = 0; j + 1 < comps[i].cards.length; j += 2) {
            chosen.push(comps[i].cards[j], comps[i].cards[j + 1]);
            usedIds.add(comps[i].cards[j].id); usedIds.add(comps[i].cards[j + 1].id);
            mustPairs--;
          }
          break;
        }
      }
    }
  }
  // 最低的对子补义务 (拖拉机展开成单个对子; avoidPoints 时优先非分对)
  if (mustPairs > 0) {
    const avail = [];
    for (let i = 0; i < pairsAll.length; i++) {
      const cm = pairsAll[i];
      if (cm.type === 'tractor') {
        for (let j = 0; j + 1 < cm.cards.length; j += 2) {
          avail.push({ top: E.ordIdx(cm.cards[j], trump), cards: [cm.cards[j], cm.cards[j + 1]] });
        }
      } else {
        avail.push({ top: cm.top, cards: cm.cards });
      }
    }
    avail.sort((a, b) => {
      if (avoidPoints) {
        const pa = E.cardPoints(a.cards[0]) + E.cardPoints(a.cards[1]) > 0 ? 1 : 0;
        const pb = E.cardPoints(b.cards[0]) + E.cardPoints(b.cards[1]) > 0 ? 1 : 0;
        if (pa !== pb) return pa - pb;
      }
      return a.top - b.top;
    });
    let taken = 0;
    for (let i = 0; taken < mustPairs && i < avail.length; i++) {
      const p = avail[i];
      if (usedIds.has(p.cards[0].id)) continue;
      chosen.push(p.cards[0], p.cards[1]);
      usedIds.add(p.cards[0].id); usedIds.add(p.cards[1].id);
      taken++;
    }
  }
  // 同门补单张: 未用的同门牌按小到大 (未被义务征用的对子可拆); avoidPoints 时优先非分
  const remaining = inSuit
    .filter((c) => !usedIds.has(c.id))
    .sort((a, b) => {
      if (avoidPoints) {
        const pa = E.cardPoints(a) > 0 ? 1 : 0;
        const pb = E.cardPoints(b) > 0 ? 1 : 0;
        if (pa !== pb) return pa - pb;
      }
      return E.ordIdx(a, trump) - E.ordIdx(b, trump);
    });
  let si = 0;
  while (chosen.length < needInSuit && si < remaining.length) {
    chosen.push(remaining[si++]);
  }
  // 非同门补 (垫非分牌优先)
  if (chosen.length < n) {
    const rest = notSuit.filter((c) => !usedIds.has(c.id));
    rest.sort((a, b) => {
      const pa = E.cardPoints(a) - E.cardPoints(b);
      if (pa !== 0) return pa;
      const ta = isTrumpCard(a, trump) ? 1 : 0;
      const tb = isTrumpCard(b, trump) ? 1 : 0;
      if (ta !== tb) return ta - tb;
      return E.ordIdx(a, trump) - E.ordIdx(b, trump);
    });
    let ri = 0;
    while (chosen.length < n && ri < rest.length) chosen.push(rest[ri++]);
  }
  return chosen;
}

/* 墩内当前最大 (plays 可能不足 4 手) */
function trickWinnerSoFar(plays, trump) {
  const lead = E.classify(plays[0].cards, trump);
  let best = lead;
  let idx = 0;
  if (lead) {
    const st = E.structOf(lead);
    for (let i = 1; i < plays.length; i++) {
      const cl = E.classify(plays[i].cards, trump);
      if (!cl || !E.sameStruct(E.structOf(cl), st)) continue;
      if (cl.suit === best.suit) {
        if (cl.top > best.top) { best = cl; idx = i; }
      } else if (cl.suit === 'T') {
        best = cl; idx = i;
      }
    }
  }
  return {
    seat: plays[idx].seat,
    top: best ? best.top : -1,
    suit: best ? best.suit : null,
    type: best ? best.type : null,
  };
}

/* 手牌估值 (用于前后对比) */
function handEval(hand, trump) {
  let v = 0;
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (E.effSuit(c, trump) === 'T') {
      const o = E.ordIdx(c, trump);
      if (o === 15) v += 3.2;
      else if (o === 14) v += 2.8;
      else if (o === 13) v += 2.4;
      else if (o === 12) v += 2.0;
      else if (o === 11) v += 1.4;
      else if (o === 10) v += 1.2;
      else if (o === 9) v += 1.0;
      else if (o === 8) v += 0.9;
      else if (o === 7) v += 0.85;
      else v += 0.5 + o * 0.03;
    } else if (c.rank === 14) v += 1.0;
    else if (c.rank === 13) v += 0.6;
    else v += 0.12;
  }
  const comps = E.decompose(hand, trump);
  for (let i = 0; i < comps.length; i++) {
    const cm = comps[i];
    if (cm.type === 'pair') {
      v += isTrumpCard(cm.cards[0], trump) ? 2.2 : 1.2;
    } else if (cm.type === 'tractor') {
      v += (isTrumpCard(cm.cards[0], trump) ? 2.5 : 1.5) * cm.len;
    }
  }
  return v;
}

function trumpSpentValue(cards, trump) {
  let v = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (E.effSuit(c, trump) === 'T') {
      const o = E.ordIdx(c, trump);
      if (o === 15) v += 3.2;
      else if (o === 14) v += 2.8;
      else if (o >= 13) v += 2.2;
      else if (o === 11) v += 1.3;
      else v += 0.6;
    }
  }
  return v;
}

/* ================= 五个方法 ================= */

/* ---------- onDeal ---------- */

function suitBidScore(hand, s, lvl, myTeamIsDecl) {
  const trump = { suit: s, rank: lvl };
  let tc = 0, jokers = 0, rankCards = 0, high = 0, pairs = 0, aces = 0;
  const tcards = [];
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (E.effSuit(c, trump) === 'T') {
      tcards.push(c);
      tc++;
      if (c.suit === 'X') {
        jokers++;
        high += c.rank === 16 ? 4 : 3;
      } else if (c.rank === lvl) {
        rankCards++;
        high += c.suit === s ? 2.5 : 1.5;
      } else if (c.rank >= 13) high += 1;
    } else if (c.rank === 14) aces++;
  }
  const comps = E.decompose(tcards, trump);
  for (let i = 0; i < comps.length; i++) {
    const cm = comps[i];
    if (cm.type === 'pair') pairs++;
    else if (cm.type === 'tractor') pairs += cm.len;
  }
  const declBonus = myTeamIsDecl ? 1.0 : 0;
  return tc * 2 + jokers * 2 + rankCards * 2 + pairs * 1.5 + aces * 1.5 + high + declBonus;
}

function ntBidScore(hand, lvl, myTeamIsDecl) {
  let jokers = 0, rankCards = 0, pairs = 0, aces = 0;
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (c.suit === 'X') jokers++;
    else if (c.rank === lvl) rankCards++;
    else if (c.rank === 14) aces++;
  }
  // 无主对子: 王对 + 各门级牌对
  if (countRank(hand, 'X', 15) >= 2) pairs++;
  if (countRank(hand, 'X', 16) >= 2) pairs++;
  for (let si = 0; si < 4; si++) if (countRank(hand, SUITS[si], lvl) >= 2) pairs++;
  const declBonus = myTeamIsDecl ? 1.0 : 0;
  return jokers * 3 + rankCards * 2 + pairs * 2 + aces + declBonus;
}

function onDeal(view) {
  if (!TUNE.BID_ENABLED) return null; // 开关: 当前实测永不亮更优
  const hand = view.hand;
  const lvl = view.trumpRank;
  const cur = view.curDecl;
  const me = view.seat;

  // 自己亮的: 只考虑加固
  if (cur && cur.seat === me) {
    if (cur.strength === 1 && !view.rebelHappened && hasRankPair(hand, cur.suit, lvl)) {
      return { suit: cur.suit, strength: 2 };
    }
    return null;
  }
  // 队友亮的: 不反
  if (cur && cur.seat % 2 === view.myTeam) return null;

  const myTeamIsDecl = view.dealerKnown && view.dealer >= 0 && view.dealer % 2 === view.myTeam;

  let best = null;
  let bestScore = -1e9;
  const consider = (opt, score) => {
    if (score > bestScore) { bestScore = score; best = opt; }
  };
  // 王对 (无主)
  const ntScore = ntBidScore(hand, lvl, myTeamIsDecl);
  if (countRank(hand, 'X', 16) >= 2) consider({ suit: null, strength: 4 }, ntScore);
  else if (countRank(hand, 'X', 15) >= 2) consider({ suit: null, strength: 3 }, ntScore);
  // 各花色
  for (let si = 0; si < 4; si++) {
    const s = SUITS[si];
    const nRank = countRank(hand, s, lvl);
    if (nRank === 0) continue;
    const sc = suitBidScore(hand, s, lvl, myTeamIsDecl);
    consider({ suit: s, strength: nRank >= 2 ? 2 : 1 }, sc);
  }

  if (cur) {
    // 反别人的主: 必须严格更强 + 显著更好
    if (!best || best.strength <= cur.strength) return null;
    const min = best.suit === null ? TUNE.OVERBID_NT_MIN : TUNE.OVERBID_MIN;
    if (bestScore < min) return null;
    return best;
  }
  if (!best) return null;
  const min = best.suit === null ? TUNE.OPEN_BID_NT_MIN : TUNE.OPEN_BID_MIN;
  if (bestScore < min) return null;
  return best;
}

/* ---------- onRebel ---------- */

function onRebel(view) {
  return TUNE.REBEL_ALWAYS;
}

/* ---------- discard ---------- */

function buryScore(c, hand, trump) {
  const es = E.effSuit(c, trump);
  if (es === 'T') {
    const o = E.ordIdx(c, trump);
    if (o >= 11) return 100; // 大主绝不埋
    // 低主: 只在主极多时埋
    const tcount = hand.reduce((n, x) => n + (E.effSuit(x, trump) === 'T' ? 1 : 0), 0);
    return tcount >= 11 ? 60 : 100;
  }
  if (c.rank === 14) return 90; // A 不埋
  // 对子不拆
  const paired = countRank(hand, c.suit, c.rank) >= 2;
  const pairBonus = paired ? 25 : 0;
  const suitCards = hand.filter((x) => x.suit === c.suit && x.rank !== trump.rank).length;
  if (c.rank === 13) {
    // K: 有 A 或 K 对保护则留
    const hasA = countRank(hand, c.suit, 14) >= 1;
    if (hasA || paired) return 75 + pairBonus;
    return 20;
  }
  if (c.rank === 10) {
    return suitCards >= 5 ? 55 : 30 + pairBonus;
  }
  if (c.rank === 5) return 38 + pairBonus;
  return 40 + c.rank + pairBonus; // 小牌按点序埋 (先埋小的)
}

function discard(view) {
  const hand = view.hand;
  const trump = view.trump;
  // 庄家强度: 弱庄少埋分 (末墩被抠 ×2 风险), 强庄多埋分 (保护)
  const trumps = hand.filter((c) => E.effSuit(c, trump) === 'T');
  let trumpPower = trumps.length;
  for (let i = 0; i < trumps.length; i++) {
    const o = E.ordIdx(trumps[i], trump);
    if (o >= 14) trumpPower += 2;
    else if (o >= 12) trumpPower += 1;
  }
  const weak = trumpPower <= 6;
  const strong = trumpPower >= 12;
  // 1. 断门目标: 张数 1..2 且无 A 的副门全埋 (弱庄不埋这门里的分)
  const buried = [];
  const buriedIds = new Set();
  if (trump.suit) {
    for (let si = 0; si < 4; si++) {
      const s = SUITS[si];
      if (s === trump.suit) continue;
      const cs = hand.filter((c) => c.suit === s && c.rank !== trump.rank);
      if (cs.length >= 1 && cs.length <= TUNE.BURY_VOID_MAX && !cs.some((c) => c.rank === 14)) {
        const hasPts = cs.some((c) => E.cardPoints(c) > 0);
        if (weak && hasPts) continue; // 弱庄: 这门的分留在手里
        for (let i = 0; i < cs.length; i++) {
          buried.push(cs[i]);
          buriedIds.add(cs[i].id);
        }
      }
    }
  }
  // 2. 按 buryScore 补足 8 张
  const rest = hand.filter((c) => !buriedIds.has(c.id));
  const score = (c) => {
    let sc = buryScore(c, hand, trump);
    if (E.cardPoints(c) > 0 && !buriedIds.has(c.id)) {
      if (weak) sc += TUNE.DISCARD_WEAK_POINT_BUMP;
      else if (strong) sc -= TUNE.DISCARD_STRONG_POINT_DROP;
    }
    return sc;
  };
  rest.sort((a, b) => score(a) - score(b));
  for (let i = 0; buried.length < 8 && i < rest.length; i++) buried.push(rest[i]);
  return buried;
}

/* ---------- lead ---------- */

function leadCandidates(view, track) {
  const hand = view.hand;
  const trump = view.trump;
  const myTeam = view.myTeam;
  const declTeam = view.declSeat % 2;
  const role = myTeam === declTeam ? 'decl' : 'def';
  const tricksLeft = track.tricksLeft;
  const cands = [];

  const myTrumps = hand.filter((c) => E.effSuit(c, trump) === 'T');

  /* 末墩: 抢墩 (手牌只剩本墩的量) */
  if (tricksLeft <= 2) {
    if (tricksLeft === 2) {
      // 两张若成对: 整墩出对 (这墩就是末墩)
      const cls2 = E.classify(hand, trump);
      if (cls2 && cls2.type === 'pair') {
        cands.push({ cards: hand.slice(), note: 'last', val: TUNE.VAL_LAST_TRICK });
      }
    }
    let best = null;
    for (let i = 0; i < hand.length; i++) {
      const c = hand[i];
      const key = (E.effSuit(c, trump) === 'T' ? 20 + E.ordIdx(c, trump) : (c.rank === 14 ? 10 : c.rank));
      if (!best || key > best.key) best = { cards: [c], key };
    }
    if (best) cands.push({ cards: best.cards, note: 'last', val: TUNE.VAL_LAST_TRICK - 0.1 });
  }

  /* 吊主 */
  if (myTrumps.length >= (role === 'decl' ? 6 : 9)) {
    // 主对 (若对子够硬)
    const tcomps = E.decompose(myTrumps, trump);
    let pairTop = -1, pairCards = null;
    for (let i = 0; i < tcomps.length; i++) {
      const cm = tcomps[i];
      if (cm.type === 'pair' && cm.top > pairTop) { pairTop = cm.top; pairCards = cm.cards.slice(); }
    }
    if (pairTop >= 12) {
      cands.push({ cards: pairCards, note: 'trumpPair', val: TUNE.VAL_TRUMP_LEAD + 0.4 + (pairTop - 12) * 0.15 });
    }
    // 最低主单张
    const lowest = myTrumps.slice().sort(ordSortAsc(trump))[0];
    cands.push({ cards: [lowest], note: 'trump', val: TUNE.VAL_TRUMP_LEAD });
  }

  /* 副牌结构 */
  const partner = (view.seat + 2) % 4;
  for (let si = 0; si < 4; si++) {
    const s = SUITS[si];
    if (s === trump.suit) continue;
    const voids = track.voidSeats.get(s);
    const oppVoid = voids && (voids.has((view.seat + 1) % 4) || voids.has((view.seat + 3) % 4));
    const partnerVoid = voids && voids.has(partner);
    const cs = hand.filter((c) => c.suit === s && c.rank !== trump.rank);
    if (!cs.length) continue;
    const comps = E.decompose(cs, trump);
    const singles = comps.filter((c) => c.type === 'single');
    const pairs = comps.filter((c) => c.type === 'pair');
    // 闲家已断门: 避免领这门 (除非队友断门可以垫分/毙)
    if (oppVoid && !partnerVoid) continue;
    const voidBonus = partnerVoid ? 1.2 : 0;
    // A 领出
    const aces = singles.filter((c) => c.cards[0].rank === 14);
    if (aces.length === 2) {
      cands.push({ cards: [aces[0].cards[0], aces[1].cards[0]], note: 'AA', val: 1.6 + voidBonus });
    } else if (aces.length === 1) {
      cands.push({ cards: aces[0].cards, note: 'A', val: TUNE.VAL_ACE_LEAD + (role === 'def' ? 0.4 : 0) + voidBonus });
    }
    // 对子领出 (K 对优先)
    pairs.sort((a, b) => b.top - a.top);
    for (let i = 0; i < pairs.length && i < 2; i++) {
      const top = pairs[i].top;
      cands.push({ cards: pairs[i].cards.slice(), note: 'pair', val: TUNE.VAL_PAIR_LEAD_BASE + top * 0.06 + (role === 'def' && top >= 9 ? 0.3 : 0) + voidBonus });
    }
    // 最低单张 (发展)
    singles.sort((a, b) => a.top - b.top);
    if (singles.length) {
      cands.push({ cards: [singles[0].cards[0]], note: 'low', val: TUNE.VAL_LOW_LEAD + voidBonus });
    }
  }

  /* 甩牌扩张:
   * 1) 自动甩: 领出的组件是本门 top 最小的组件 → 整门甩出 (失败强制出的正是最小组件, 零风险)
   * 2) 保险甩: 所有组件都无人能压 → 整门甩出 */
  for (let i = 0; i < cands.length; i++) {
    const cd = cands[i];
    const cls = E.classify(cd.cards, trump);
    if (!cls || cls.type === 'throw') continue;
    const allComps = suitComps(hand, cls.suit, trump);
    if (allComps.length <= 1) continue;
    // 1) 自动甩
    let isMinTop = true;
    for (let j = 0; j < allComps.length; j++) {
      if (allComps[j].top < cls.top) { isMinTop = false; break; }
    }
    if (isMinTop) {
      const full = [];
      for (let j = 0; j < allComps.length; j++) full.push(...allComps[j].cards);
      cands.push({ cards: full, note: 'throw', val: cd.val + 0.15 });
    }
    // 2) 保险甩
    let safe = true;
    for (let j = 0; j < allComps.length; j++) {
      if (track.compBeatable(allComps[j], cls.suit)) { safe = false; break; }
    }
    if (safe) {
      const full = [];
      for (let j = 0; j < allComps.length; j++) full.push(...allComps[j].cards);
      cands.push({ cards: full, note: 'throw', val: cd.val + 0.8 });
    }
  }

  cands.sort((a, b) => b.val - a.val);
  return cands;
}

function lead(view) {
  const track = buildTrack(view);
  const cands = leadCandidates(view, track);
  if (!cands.length) return [view.hand[0]];
  // 小优化: 同 value 下倾向副牌小单张 (保留结构), 已由排序决定
  return cands[0].cards;
}

/* ---------- follow ---------- */

function follow(view, plays) {
  const hand = view.hand;
  const trump = view.trump;
  const me = view.seat;
  const partner = (me + 2) % 4;
  const declTeam = view.declSeat % 2;
  const role = me % 2 === declTeam ? 'decl' : 'def';
  const leadCls = E.classify(plays[0].cards, trump);
  const track = buildTrack(view);
  const cur = trickWinnerSoFar(plays, trump);
  const seatsAfter = 4 - plays.length;
  let ptsIn = 0;
  for (let i = 0; i < plays.length; i++) {
    for (let j = 0; j < plays[i].cards.length; j++) ptsIn += E.cardPoints(plays[i].cards[j]);
  }
  const curIsPartner = cur.seat === partner;
  const curIsOpp = !curIsPartner; // 含领出方(自己不在 plays 里, 对手或队友)

  const inSuit = hand.filter((c) => E.effSuit(c, trump) === leadCls.suit);
  const mustInSuit = Math.min(leadCls.cards.length, inSuit.length);

  const winFactor = role === 'def' ? TUNE.PTS_WIN_FACTOR_DEF : TUNE.PTS_WIN_FACTOR_DECL;
  const cands = [];

  const pushCand = (cards, note, baseVal) => {
    if (!cards || cards.length !== leadCls.cards.length) return;
    const after = removeIds(hand, cards);
    const handDelta = handEval(after, trump) - handEval(hand, trump);
    let val = baseVal + handDelta;
    if (note === 'dump') val += 0.1;
    cands.push({ cards, note, val });
  };

  /* ---- 同门跟牌 ---- */
  if (mustInSuit > 0) {
    // 1) 最小跟 (对方在赢时垫非分)
    const avoidFeed = TUNE.AVOID_POINT_FEED && curIsOpp && !curIsPartner;
    pushCand(minFollow(hand, leadCls, trump, avoidFeed), 'dump', 0);

    // 2) 能大则最小大过 (结构匹配且当前不是队友在赢)
    const win = curIsPartner ? null : minWinFollow(hand, leadCls, trump, cur);
    if (win) {
      let base = ptsIn * winFactor;
      if (seatsAfter > 0 && curIsOpp && cur.suit === leadCls.suit) {
        // 后面的人可能更大: 折扣
        const above = track.unseenAbove(leadCls.suit, win.top);
        base -= Math.min(above, 2) * 0.4 * ptsIn * 0.25;
      }
      pushCand(win, 'win', base);
    }

    // 3) 队友在赢: 甩分
    if (curIsPartner && ptsIn > 0 && safeDump(track, cur, seatsAfter, trump)) {
      pushCand(dumpPointsFollow(hand, leadCls, trump), 'dumpPts',
        ptsIn * winFactor + myPoints(hand) * 0.1);
    }
  } else {
    /* ---- 断门 ---- */
    // 1) 毙: 有点分且对方在赢
    if (ptsIn > 0 && curIsOpp && !curIsPartner) {
      const kill = minKill(hand, leadCls, trump, cur, track);
      if (kill) {
        const killTop = E.classify(kill, trump).top;
        const spent = trumpSpentValue(kill, trump);
        const kf = role === 'decl' ? TUNE.KILL_WIN_FACTOR_DECL : TUNE.PTS_WIN_FACTOR_DEF;
        let base = ptsIn * kf - spent;
        if (seatsAfter > 0) {
          const above = track.unseenAbove('T', killTop);
          base -= Math.min(above, 2) * TUNE.KILL_RISK_AFTER * ptsIn;
        }
        pushCand(kill, 'kill', base);
      }
    }
    // 2) 队友在赢 (含领出方): 甩分
    if (curIsPartner && ptsIn > 0 && safeDump(track, cur, seatsAfter, trump)) {
      const dump = dumpPointsVoid(hand, leadCls.cards.length, trump);
      pushCand(dump, 'dumpPts', ptsIn * winFactor + 0.3);
    }
    // 3) 垫: 最低非分
    const shed = shedCards(hand, leadCls.cards.length, trump, ptsIn > 0 && curIsOpp);
    pushCand(shed, 'shed', 0);
    // 4) 无分且队友在赢: 甩分 (把分牌送到队友墩)
    if (curIsPartner && safeDump(track, cur, seatsAfter, trump)) {
      const dump2 = dumpPointsVoid(hand, leadCls.cards.length, trump);
      const gain = role === 'def' ? TUNE.DUMP_POINTS_FACTOR : 0.4;
      pushCand(dump2, 'dumpPtsFree', gain);
    }
  }

  if (!cands.length) return minFollow(hand, leadCls, trump);
  cands.sort((a, b) => b.val - a.val);
  return cands[0].cards;
}

/* 后面无人 / 队友牌够硬 / 已无更大牌 → 甩分安全 */
function safeDump(track, cur, seatsAfter, trump) {
  if (seatsAfter === 0) return true;
  if (cur.suit === 'T') {
    if (cur.top >= 13) return true;
    return track.unseenAbove('T', cur.top) === 0;
  }
  // 队友出的是本门 A: 只有毙能压
  if (cur.top === 11) {
    return track.unseenAbove('T', -1) === 0; // 无任何未见主牌
  }
  return false;
}

function myPoints(cards) {
  let p = 0;
  for (let i = 0; i < cards.length; i++) p += E.cardPoints(cards[i]);
  return p;
}

/* 最小能大过的同门跟 (结构匹配 lead) */
function minWinFollow(hand, leadCls, trump, cur) {
  const suit = leadCls.suit;
  const inSuit = hand.filter((c) => E.effSuit(c, trump) === suit);
  if (cur.suit !== suit) return null; // 已被毙: 同门大不过
  if (leadCls.type === 'single') {
    let best = null;
    for (let i = 0; i < inSuit.length; i++) {
      const o = E.ordIdx(inSuit[i], trump);
      if (o > cur.top && (!best || o < E.ordIdx(best, trump))) best = inSuit[i];
    }
    return best ? [best] : null;
  }
  const comps = E.decompose(inSuit, trump);
  if (leadCls.type === 'pair') {
    let best = null;
    for (let i = 0; i < comps.length; i++) {
      const cm = comps[i];
      if (cm.type === 'pair' && cm.top > cur.top && (!best || cm.top < best.top)) best = cm;
      else if (cm.type === 'tractor') {
        const tp = cm.cards[0]; // 最低那对
        const ttop = E.ordIdx(tp, trump);
        if (ttop > cur.top && (!best || ttop < best.top)) best = { top: ttop, cards: [cm.cards[0], cm.cards[1]] };
      }
    }
    return best ? best.cards.slice() : null;
  }
  if (leadCls.type === 'tractor') {
    // 找长度恰为 L 且 top > cur.top 的切片
    let best = null;
    for (let i = 0; i < comps.length; i++) {
      const cm = comps[i];
      if (cm.type !== 'tractor' || cm.len < leadCls.len) continue;
      for (let off = 0; off + leadCls.len <= cm.len; off++) {
        const pairs = [];
        for (let j = 0; j < leadCls.len; j++) {
          const idx = (off + j) * 2;
          pairs.push(cm.cards[idx], cm.cards[idx + 1]);
        }
        const top = E.ordIdx(cm.cards[(off + leadCls.len) * 2 - 1], trump);
        if (top > cur.top && (!best || top < best.top)) best = { cards: pairs, top };
      }
    }
    return best ? best.cards : null;
  }
  return null; // 甩牌领出: v1 不大过
}

/* 队友在赢: 甩分跟 (同门内) */
function dumpPointsFollow(hand, leadCls, trump) {
  const base = minFollow(hand, leadCls, trump);
  // 把同门内可换的单张换成手中同门的分牌
  const suit = leadCls.suit;
  const ptsInSuit = hand.filter((c) => E.effSuit(c, trump) === suit && E.cardPoints(c) > 0);
  const ptsByRank = {};
  for (let i = 0; i < ptsInSuit.length; i++) {
    const c = ptsInSuit[i];
    const k = c.suit + ':' + c.rank;
    (ptsByRank[k] = ptsByRank[k] || []).push(c);
  }
  // 只换单张位置 (对子义务已由 minFollow 满足; 换掉的是单张填充位)
  const out = base.slice();
  const inBaseIds = new Set();
  for (let i = 0; i < out.length; i++) inBaseIds.add(out[i].id);
  // 找到 base 里同门单张 (非对组成部分) — 简化: 按分值排序手牌分牌, 逐个替换 base 里的同门最低单张
  const sortedPts = ptsInSuit.slice().sort((a, b) => E.cardPoints(b) - E.cardPoints(a));
  for (let i = 0; i < sortedPts.length; i++) {
    const c = sortedPts[i];
    if (inBaseIds.has(c.id)) continue;
    // 找一个 base 中同门单张替换
    let swapped = false;
    for (let j = 0; j < out.length; j++) {
      const o = out[j];
      if (E.effSuit(o, trump) === suit && E.cardPoints(o) === 0 && countRank(out, o.suit, o.rank) === 1) {
        // 保证替换后仍合法 (不破坏对子义务): 该位置是单张填充
        out[j] = c;
        inBaseIds.delete(o.id);
        swapped = true;
        break;
      }
    }
    if (!swapped) break;
  }
  return out;
}

/* 断门甩分: 打出手里分最大的 n 张 (非主优先) */
function dumpPointsVoid(hand, n, trump) {
  const pts = hand.filter((c) => E.cardPoints(c) > 0);
  pts.sort((a, b) => {
    const ta = isTrumpCard(a, trump) ? 1 : 0;
    const tb = isTrumpCard(b, trump) ? 1 : 0;
    if (ta !== tb) return ta - tb;
    return E.cardPoints(b) - E.cardPoints(a);
  });
  const out = [];
  for (let i = 0; i < n && i < pts.length; i++) out.push(pts[i]);
  // 不足补最小非分
  if (out.length < n) {
    const rest = hand.filter((c) => E.cardPoints(c) === 0)
      .sort((a, b) => (isTrumpCard(a, trump) ? 1 : 0) - (isTrumpCard(b, trump) ? 1 : 0) || E.ordIdx(a, trump) - E.ordIdx(b, trump));
    for (let i = 0; out.length < n && i < rest.length; i++) out.push(rest[i]);
  }
  return out;
}

/* 断门垫牌: 最低的非分牌 (对手在赢且有点分时坚决不垫分) */
function shedCards(hand, n, trump, keepPoints) {
  const sorted = hand.slice().sort((a, b) => {
    const pa = keepPoints ? E.cardPoints(a) : 0;
    const pb = keepPoints ? E.cardPoints(b) : 0;
    if (pa !== pb) return pa - pb;
    const ta = isTrumpCard(a, trump) ? 1 : 0;
    const tb = isTrumpCard(b, trump) ? 1 : 0;
    if (ta !== tb) return ta - tb;
    return E.ordIdx(a, trump) - E.ordIdx(b, trump);
  });
  return sorted.slice(0, n);
}

/* 断门毙: 结构匹配的最小能赢主牌 */
function minKill(hand, leadCls, trump, cur, track) {
  const trumps = hand.filter((c) => E.effSuit(c, trump) === 'T');
  const comps = E.decompose(trumps, trump);
  const curTop = cur.suit === 'T' ? cur.top : -1;
  if (leadCls.type === 'single') {
    let best = null;
    for (let i = 0; i < trumps.length; i++) {
      const o = E.ordIdx(trumps[i], trump);
      if (o > curTop && (!best || o < E.ordIdx(best, trump))) best = trumps[i];
    }
    return best ? [best] : null;
  }
  if (leadCls.type === 'pair') {
    let best = null;
    for (let i = 0; i < comps.length; i++) {
      const cm = comps[i];
      if (cm.type === 'pair' && cm.top > curTop && (!best || cm.top < best.top)) best = cm;
      else if (cm.type === 'tractor' && E.ordIdx(cm.cards[0], trump) > curTop) {
        if (!best || E.ordIdx(cm.cards[0], trump) < best.top) best = { top: E.ordIdx(cm.cards[0], trump), cards: [cm.cards[0], cm.cards[1]] };
      }
    }
    return best ? best.cards.slice() : null;
  }
  if (leadCls.type === 'tractor') {
    let best = null;
    for (let i = 0; i < comps.length; i++) {
      const cm = comps[i];
      if (cm.type !== 'tractor' || cm.len < leadCls.len) continue;
      for (let off = 0; off + leadCls.len <= cm.len; off++) {
        const top = E.ordIdx(cm.cards[(off + leadCls.len) * 2 - 1], trump);
        if (top > curTop && (!best || top < best.top)) {
          const pairs = [];
          for (let j = 0; j < leadCls.len; j++) {
            const idx = (off + j) * 2;
            pairs.push(cm.cards[idx], cm.cards[idx + 1]);
          }
          best = { cards: pairs, top };
        }
      }
    }
    return best ? best.cards : null;
  }
  return null;
}

/* ================= 工厂 ================= */

function create() {
  return {
    name: 'deepseek-v4-pro',
    onDeal(view) { return onDeal(view); },
    onRebel(view) { return onRebel(view); },
    discard(view) { return discard(view); },
    lead(view) { return lead(view); },
    follow(view, plays) { return follow(view, plays); },
  };
}

module.exports = { create, minFollow, buildTrack };
