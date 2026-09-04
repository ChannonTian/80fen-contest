/* moves.js —— 合法着法的生成与兜底构造。
 * forceLegalFollow / forceLegalLead 保证返回合法着法(用于自己兜底,永不吃罚分)。
 * genFollowCandidates / genLeadCandidates 给策略层挑选。
 */
'use strict';

/* genFollowCandidates 的临时表:id -> 手牌下标。只写手牌用到的槽位,
 * 只读 cand 里的牌(必是手牌的子集),所以陈旧槽位永远读不到,不用清零。
 * 该函数不会被重入(它调用的几个函数都不回头调它)。 */
const IDX = new Int8Array(108);
const E = require('./engine.js');

const DEF = { strictTractorFollow: true, partialTractorFollow: true };

function bySuit(cards, trump) {
  const m = { T: [], S: [], H: [], D: [], C: [] };
  for (let i = 0; i < cards.length; i++) m[E.effSuit(cards[i], trump)].push(cards[i]);
  return m;
}

/* 拆出同花同点的对子列表(未配对的进 singles) */
function pairsAndSingles(cards, trump) {
  const groups = new Map();
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const k = c.suit + '/' + c.rank;
    let g = groups.get(k);
    if (!g) { g = []; groups.set(k, g); }
    g.push(c);
  }
  const pairs = [], singles = [];
  groups.forEach(function (g) {
    let i = 0;
    while (i + 1 < g.length) { pairs.push([g[i], g[i + 1]]); i += 2; }
    if (i < g.length) singles.push(g[i]);
  });
  pairs.sort(function (a, b) { return E.ordIdx(a[0], trump) - E.ordIdx(b[0], trump); });
  singles.sort(function (a, b) { return E.ordIdx(a, trump) - E.ordIdx(b, trump); });
  return { pairs: pairs, singles: singles };
}

/* 垫牌代价:越小越愿意丢 */
function junkScore(c, trump) {
  return E.cardPoints(c) * 10 + E.ordIdx(c, trump) + (E.effSuit(c, trump) === 'T' ? 40 : 0);
}

/* ---------- 兜底:一定合法 ---------- */

function forceLegalLead(hand, trump) {
  let best = hand[0];
  for (let i = 1; i < hand.length; i++) {
    if (junkScore(hand[i], trump) < junkScore(best, trump)) best = hand[i];
  }
  return [best];
}

function forceLegalFollow(hand, lead, trump, opts) {
  const o = opts || DEF;
  const k = lead.cards.length;
  const S = E.filterSuit(hand, lead.suit, trump);
  const ns = Math.min(k, S.length);
  const chosen = [];
  const used = new Set();

  if (ns > 0) {
    const comps = E.decompose(S, trump);
    const need = E.needPairs(lead);
    const mustPairs = Math.min(need, E.countPairsIn(S));
    let reqTr = 0;
    if (o.strictTractorFollow !== false && lead.type === 'tractor') {
      const m = E.longestTractor(S, trump);
      if (m >= lead.len) reqTr = lead.len;
      else if (o.partialTractorFollow !== false && m >= 2) reqTr = m;
    }
    if (reqTr > 0) {
      let pick = null;
      for (let i = 0; i < comps.length; i++) {
        const c = comps[i];
        if (c.type === 'tractor' && c.len >= reqTr && (!pick || c.len < pick.len)) pick = c;
      }
      for (let i = 0; i < reqTr * 2 && i < pick.cards.length; i++) {
        chosen.push(pick.cards[i]); used.add(pick.cards[i].id);
      }
    }
    let have = E.countPairsIn(chosen);
    if (have < mustPairs) {
      const left = [];
      for (let i = 0; i < S.length; i++) if (!used.has(S[i].id)) left.push(S[i]);
      const ps = pairsAndSingles(left, trump).pairs;
      for (let i = 0; i < ps.length && have < mustPairs && chosen.length + 2 <= ns; i++) {
        chosen.push(ps[i][0], ps[i][1]);
        used.add(ps[i][0].id); used.add(ps[i][1].id);
        have++;
      }
    }
    const remain = [];
    for (let i = 0; i < S.length; i++) if (!used.has(S[i].id)) remain.push(S[i]);
    remain.sort(function (a, b) { return junkScore(a, trump) - junkScore(b, trump); });
    for (let i = 0; i < remain.length && chosen.length < ns; i++) {
      chosen.push(remain[i]); used.add(remain[i].id);
    }
  }
  if (chosen.length < k) {
    const others = [];
    for (let i = 0; i < hand.length; i++) {
      if (E.effSuit(hand[i], trump) !== lead.suit && !used.has(hand[i].id)) others.push(hand[i]);
    }
    others.sort(function (a, b) { return junkScore(a, trump) - junkScore(b, trump); });
    for (let i = 0; i < others.length && chosen.length < k; i++) {
      chosen.push(others[i]); used.add(others[i].id);
    }
  }
  return chosen;
}

/* ---------- 组合工具 ---------- */

function combos(arr, k, cap, out) {
  out = out || [];
  if (k === 0) { out.push([]); return out; }
  if (arr.length < k) return out;
  const idx = [];
  for (let i = 0; i < k; i++) idx.push(i);
  while (true) {
    const pick = [];
    for (let i = 0; i < k; i++) pick.push(arr[idx[i]]);
    out.push(pick);
    if (out.length >= cap) return out;
    let i = k - 1;
    while (i >= 0 && idx[i] === arr.length - k + i) i--;
    if (i < 0) return out;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

/* ---------- 领出候选 ---------- */

function genLeadCandidates(hand, trump, opts) {
  const groups = bySuit(hand, trump);
  const out = [];
  const keys = ['T', 'S', 'H', 'D', 'C'];
  for (let ki = 0; ki < keys.length; ki++) {
    const cards = groups[keys[ki]];
    if (cards.length === 0) continue;
    const comps = E.decompose(cards, trump);
    for (let i = 0; i < comps.length; i++) {
      const c = comps[i];
      if (c.type === 'single') { out.push(c.cards.slice()); }
      else if (c.type === 'pair') { out.push(c.cards.slice()); out.push([c.cards[0]]); }
      else {
        /* 拖拉机:整条 + 各段连续子拖拉机 + 单对 + 单张 */
        for (let len = c.len; len >= 2; len--) {
          for (let st = 0; st + len <= c.len; st++) {
            out.push(c.cards.slice(st * 2, (st + len) * 2));
            if (out.length > 400) break;
          }
        }
        for (let st = 0; st < c.len; st++) out.push(c.cards.slice(st * 2, st * 2 + 2));
        out.push([c.cards[0]]);
      }
    }
  }
  return out;
}

/* 甩牌候选:同门里挑 2~3 个组件 */
function genThrowCandidates(hand, trump, cap) {
  const groups = bySuit(hand, trump);
  const keys = ['T', 'S', 'H', 'D', 'C'];
  const out = [];
  for (let ki = 0; ki < keys.length; ki++) {
    const cards = groups[keys[ki]];
    if (cards.length < 2) continue;
    const comps = E.decompose(cards, trump);
    if (comps.length < 2) continue;
    for (let a = 0; a < comps.length && out.length < cap; a++) {
      for (let b = a + 1; b < comps.length && out.length < cap; b++) {
        out.push(comps[a].cards.concat(comps[b].cards));
      }
    }
    if (comps.length >= 2 && out.length < cap) {
      const all = [];
      for (let i = 0; i < comps.length; i++) all.push.apply(all, comps[i].cards);
      out.push(all);
    }
  }
  return out;
}

/* ---------- 跟牌候选 ---------- */

/* 在花色 S 内枚举合法的 ns 张子集(骨架法),再配上门外补张 */
function genInSuitParts(S, lead, trump, opts, cap) {
  const o = opts || DEF;
  const k = lead.cards.length;
  const ns = Math.min(k, S.length);
  if (ns === 0) return [[]];
  if (ns === S.length) return [S.slice()];

  const need = E.needPairs(lead);
  const mustPairs = Math.min(need, E.countPairsIn(S));
  let reqTr = 0;
  if (o.strictTractorFollow !== false && lead.type === 'tractor') {
    const m = E.longestTractor(S, trump);
    if (m >= lead.len) reqTr = lead.len;
    else if (o.partialTractorFollow !== false && m >= 2) reqTr = m;
  }

  const res = [];
  const ps = pairsAndSingles(S, trump);
  const comps = E.decompose(S, trump);

  /* 第一步:所有可能的必需拖拉机切片(没有要求时只有空切片) */
  const trSlices = [];
  if (reqTr > 0) {
    for (let i = 0; i < comps.length; i++) {
      const c = comps[i];
      if (c.type === 'tractor' && c.len >= reqTr) {
        for (let st = 0; st + reqTr <= c.len; st++) {
          trSlices.push(c.cards.slice(st * 2, (st + reqTr) * 2));
        }
      }
    }
    if (trSlices.length === 0) trSlices.push([]);
  } else trSlices.push([]);

  for (let ti = 0; ti < trSlices.length && res.length < cap; ti++) {
    const base = trSlices[ti];
    const usedIds = new Set();
    for (let i = 0; i < base.length; i++) usedIds.add(base[i].id);
    const leftPairs = [];
    for (let i = 0; i < ps.pairs.length; i++) {
      if (!usedIds.has(ps.pairs[i][0].id) && !usedIds.has(ps.pairs[i][1].id)) leftPairs.push(ps.pairs[i]);
    }
    const havePairs = E.countPairsIn(base);
    const extraPairs = Math.max(0, mustPairs - havePairs);
    const pairSets = combos(leftPairs, Math.min(extraPairs, leftPairs.length), 60);
    for (let pi = 0; pi < pairSets.length && res.length < cap; pi++) {
      const chosen = base.slice();
      const uid = new Set(usedIds);
      for (let i = 0; i < pairSets[pi].length; i++) {
        chosen.push(pairSets[pi][i][0], pairSets[pi][i][1]);
        uid.add(pairSets[pi][i][0].id); uid.add(pairSets[pi][i][1].id);
      }
      if (chosen.length > ns) continue;
      const fillN = ns - chosen.length;
      if (fillN === 0) { res.push(chosen); continue; }
      const pool = [];
      for (let i = 0; i < S.length; i++) if (!uid.has(S[i].id)) pool.push(S[i]);
      const fills = combos(pool, fillN, Math.max(4, Math.floor(cap / Math.max(1, pairSets.length))));
      for (let fi = 0; fi < fills.length && res.length < cap; fi++) {
        res.push(chosen.concat(fills[fi]));
      }
    }
  }
  if (res.length === 0) res.push(forceLegalFollow(S.concat(), lead, trump, opts).slice(0, ns));
  return res;
}

/* 门外补张候选:j 张,来自非本门的牌 */
function genFills(rest, j, trump, cap, leadCl) {
  if (j === 0) return [[]];
  const out = [];
  const seen = new Set();
  function push(cards) {
    if (!cards || cards.length !== j) return;
    const ids = cards.map(function (c) { return c.id; }).sort().join(',');
    if (seen.has(ids)) return;
    seen.add(ids); out.push(cards);
  }
  const trumps = [], offs = [];
  for (let i = 0; i < rest.length; i++) {
    if (E.effSuit(rest[i], trump) === 'T') trumps.push(rest[i]); else offs.push(rest[i]);
  }
  /* (a) 毙:用主牌凑出与领出同结构的组合 */
  if (trumps.length >= j && leadCl) {
    const comps = E.decompose(trumps, trump);
    if (leadCl.type === 'pair' && j === 2) {
      for (let i = 0; i < comps.length; i++) {
        const c = comps[i];
        if (c.type === 'pair') push(c.cards.slice());
        else if (c.type === 'tractor') for (let st = 0; st < c.len; st++) push(c.cards.slice(st * 2, st * 2 + 2));
      }
    } else if (leadCl.type === 'tractor' && j === leadCl.len * 2) {
      for (let i = 0; i < comps.length; i++) {
        const c = comps[i];
        if (c.type === 'tractor' && c.len >= leadCl.len) {
          for (let st = 0; st + leadCl.len <= c.len; st++) push(c.cards.slice(st * 2, (st + leadCl.len) * 2));
        }
      }
    } else if (leadCl.type === 'single' && j === 1) {
      const sorted = trumps.slice().sort(function (a, b) { return E.ordIdx(a, trump) - E.ordIdx(b, trump); });
      push([sorted[0]]);
      push([sorted[sorted.length - 1]]);
      if (sorted.length > 2) push([sorted[Math.floor(sorted.length / 2)]]);
    }
  }
  /* (b) 垫:最废的 j 张 / 最废的非分张 / 送分给队友 */
  const byJunk = rest.slice().sort(function (a, b) { return junkScore(a, trump) - junkScore(b, trump); });
  push(byJunk.slice(0, j));
  const noPts = offs.filter(function (c) { return E.cardPoints(c) === 0; })
    .sort(function (a, b) { return junkScore(a, trump) - junkScore(b, trump); });
  if (noPts.length >= j) push(noPts.slice(0, j));
  const pts = rest.filter(function (c) { return E.cardPoints(c) > 0; })
    .sort(function (a, b) { return E.cardPoints(b) - E.cardPoints(a); });
  if (pts.length >= j) push(pts.slice(0, j));
  else if (pts.length > 0) {
    const mix = pts.concat(noPts);
    if (mix.length >= j) push(mix.slice(0, j));
  }
  /* (c) 少量随机化补充,保证候选不至于太窄 */
  if (out.length < cap) {
    const extra = combos(byJunk.slice(0, Math.min(byJunk.length, 8)), j, cap - out.length);
    for (let i = 0; i < extra.length; i++) push(extra[i]);
  }
  return out.length ? out : [byJunk.slice(0, j)];
}

function genFollowCandidates(hand, lead, trump, opts, cap, fillCap) {
  cap = cap || 60;
  fillCap = fillCap || 12;
  const S = E.filterSuit(hand, lead.suit, trump);
  const rest = [];
  for (let i = 0; i < hand.length; i++) if (E.effSuit(hand[i], trump) !== lead.suit) rest.push(hand[i]);
  const k = lead.cards.length;
  const ns = Math.min(k, S.length);
  const parts = genInSuitParts(S, lead, trump, opts, Math.max(8, cap));
  const j = k - ns;
  const fills = genFills(rest, j, trump, fillCap, lead);
  const out = [];
  const seen = new Set();
  const ctx = E.followCtx(hand, lead, trump);   // 候选之间不变的部分,只算一次
  /* 去重键:原来是 cand.map(id).sort().join(',') —— 每个候选两个数组、两个
   * 闭包、一个字符串。parts 取自领出花色、fills 取自其余花色,构造上不相交,
   * 所以候选里没有重复牌;手牌至多 25 张,用「手牌下标位掩码」做键是单射的。
   * 而且键能由 parts/fills 各自的掩码或出来,在 concat 之前就判掉重复。 */
  /* 位掩码只在下标 <32 时可靠。跟牌阶段手牌至多 25 张,但庄家扣底时手上有
   * 33 张 —— 万一将来在别处调用,回绕会**静默地少去重**,丢掉合法候选而不
   * 报错。所以超了就退回原来的字符串键。 */
  const useMask = hand.length <= 31;
  for (let i = 0; i < hand.length; i++) IDX[hand[i].id] = i;
  const pk = [], fk = [];
  if (useMask) {
    for (let a = 0; a < parts.length; a++) { let m = 0;
      for (let i = 0; i < parts[a].length; i++) m |= (1 << IDX[parts[a][i].id]); pk.push(m); }
    for (let b = 0; b < fills.length; b++) { let m = 0;
      for (let i = 0; i < fills[b].length; i++) m |= (1 << IDX[fills[b][i].id]); fk.push(m); }
  }
  for (let a = 0; a < parts.length; a++) {
    for (let b = 0; b < fills.length; b++) {
      if (parts[a].length + fills[b].length !== k) continue;
      const key = useMask ? (pk[a] | fk[b])
        : parts[a].concat(fills[b]).map(function (c) { return c.id; })
            .sort(function (x, y) { return x - y; }).join(',');
      if (seen.has(key)) continue;
      const cand = parts[a].concat(fills[b]);
      if (!E.isLegalFollow(hand, lead, cand, trump, opts, ctx)) continue;
      seen.add(key);
      out.push(cand);
      if (out.length >= cap) return out;
    }
  }
  if (out.length === 0) out.push(forceLegalFollow(hand, lead, trump, opts));
  return out;
}

/* ---------- 走子用的精简着法集(只给 2~4 个选项,给 rollout 用) ---------- */

/* 从 cards 里挑出与 lead 同形状、top 最大的一手;挑不出返回 null */
function bestShapeFrom(cards, lead, trump) {
  if (cards.length < lead.cards.length) return null;
  if (lead.type === 'single') {
    let b = null, bo = -1;
    for (let i = 0; i < cards.length; i++) {
      const o = E.ordIdx(cards[i], trump);
      if (o > bo) { bo = o; b = cards[i]; }
    }
    return b ? [b] : null;
  }
  const comps = E.decompose(cards, trump);
  if (lead.type === 'pair') {
    let b = null, bo = -1;
    for (let i = 0; i < comps.length; i++) {
      const c = comps[i];
      if (c.type === 'pair' && c.top > bo) { bo = c.top; b = c.cards.slice(); }
      else if (c.type === 'tractor' && c.top > bo) { bo = c.top; b = c.cards.slice(c.cards.length - 2); }
    }
    return b;
  }
  if (lead.type === 'tractor') {
    let b = null, bo = -1;
    for (let i = 0; i < comps.length; i++) {
      const c = comps[i];
      if (c.type === 'tractor' && c.len >= lead.len && c.top > bo) {
        bo = c.top; b = c.cards.slice(c.cards.length - lead.len * 2);
      }
    }
    return b;
  }
  return null;
}

/* 走子专用的「最废一手」。和 forceLegalFollow 给出同一个牌集合,
 * 但对两种压倒性常见的情形走快路,完全不碰 Map / decompose / 排序:
 *   k === 1        —— 领出单张时对子和拖拉机义务都是空的,本门任意一张都合法;
 *   本门 ≤ k 张    —— 本门必须全出,剩下的从门外挑最废的,义务同样自动满足。
 * 其余情形回落到通用实现。 */
function cheapFollow(hand, lead, trump) {
  const k = lead.cards.length;
  const suit = lead.suit;
  let sCount = 0;
  for (let i = 0; i < hand.length; i++) if (E.effSuit(hand[i], trump) === suit) sCount++;

  if (k === 1) {
    let best = null, bv = Infinity;
    const onlySuit = sCount > 0;
    for (let i = 0; i < hand.length; i++) {
      if (onlySuit && E.effSuit(hand[i], trump) !== suit) continue;
      const v = junkScore(hand[i], trump);
      if (v < bv) { bv = v; best = hand[i]; }
    }
    return best ? [best] : forceLegalFollow(hand, lead, trump, null);
  }

  if (sCount <= k) {
    const out = [];
    const rest = [];
    for (let i = 0; i < hand.length; i++) {
      if (E.effSuit(hand[i], trump) === suit) out.push(hand[i]); else rest.push(hand[i]);
    }
    let needMore = k - out.length;
    if (needMore > 0) {
      rest.sort(function (a, b) { return junkScore(a, trump) - junkScore(b, trump); });
      for (let i = 0; i < rest.length && needMore > 0; i++, needMore--) out.push(rest[i]);
    }
    if (out.length === k) return out;
  }
  return forceLegalFollow(hand, lead, trump, null);
}

/* 跟牌:最废的一手 + 最多两手「试图赢下来」的。
 * 走子(rollout)里每次决策会调上千次,所以这里每个选项都做到**构造即合法**,
 * 一次 isLegalFollow 都不调:
 *   - 本门够张时,bestShapeFrom 取的是本门里同形状的一组 → 张数、对子数、
 *     拖拉机三条都自然满足;
 *   - 本门全断时,整手都从主牌出 → chosenInSuit = 0 = min(k, 0),三条义务全空;
 *   - 送分那一手,本门有牌就必须从本门挑。 */
function quickFollowOptions(hand, lead, trump) {
  const out = [cheapFollow(hand, lead, trump)];
  const k = lead.cards.length;
  const S = E.filterSuit(hand, lead.suit, trump);
  if (S.length >= k) {
    const w = bestShapeFrom(S, lead, trump);
    if (w && w.length === k) out.push(w);
  } else if (S.length === 0 && lead.suit !== 'T') {
    const T = E.filterSuit(hand, 'T', trump);
    const w = bestShapeFrom(T, lead, trump);
    if (w && w.length === k) out.push(w);
  }
  /* 队友赢的时候把分垫出去。这一手不是构造即合法的(可能藏了本门),
   * 所以保留校验;试过改成「本门有牌就从本门挑」,量到 −1.7σ,退回。 */
  if (k === 1) {
    let pt = null, pv = -1;
    for (let i = 0; i < hand.length; i++) {
      const p = E.cardPoints(hand[i]);
      if (p > pv) { pv = p; pt = hand[i]; }
    }
    if (pv > 0 && pt) {
      const c = [pt];
      if (E.isLegalFollow(hand, lead, c, trump, null)) out.push(c);
    }
  }
  return out;
}

/* 领出:每一门的最大组件 + 全局最废的一张。
 * rich=true 时再补上「每一门最小的一张」—— 走子里想留主牌、只丢某一门的小牌时用得上。 */
function quickLeadOptions(hand, trump, rich) {
  const g = bySuit(hand, trump);
  const keys = ['T', 'S', 'H', 'D', 'C'];
  const out = [];
  let junk = null, jv = 1e9;
  for (let ki = 0; ki < keys.length; ki++) {
    const cs = g[keys[ki]];
    if (!cs.length) continue;
    const comps = E.decompose(cs, trump);
    let big = null, bo = -1, small = null, so = 1e9;
    for (let i = 0; i < comps.length; i++) {
      if (comps[i].top > bo) { bo = comps[i].top; big = comps[i]; }
    }
    if (big) out.push(big.cards.slice());
    for (let i = 0; i < cs.length; i++) {
      const v = junkScore(cs[i], trump);
      if (v < jv) { jv = v; junk = cs[i]; }
      const o = E.ordIdx(cs[i], trump);
      if (o < so) { so = o; small = cs[i]; }
    }
    if (rich && small && (!big || big.cards.length !== 1 || big.cards[0].id !== small.id)) out.push([small]);
  }
  if (junk) out.push([junk]);
  return out.length ? out : [[hand[0]]];
}

module.exports = {
  bySuit, pairsAndSingles, junkScore, combos, bestShapeFrom,
  quickFollowOptions, quickLeadOptions, cheapFollow,
  forceLegalLead, forceLegalFollow,
  genLeadCandidates, genThrowCandidates, genFollowCandidates, genFills,
};
