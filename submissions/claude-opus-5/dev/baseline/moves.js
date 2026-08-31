/* moves.js —— 合法着法的生成与兜底构造。
 * forceLegalFollow / forceLegalLead 保证返回合法着法(用于自己兜底,永不吃罚分)。
 * genFollowCandidates / genLeadCandidates 给策略层挑选。
 */
'use strict';
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

function genFollowCandidates(hand, lead, trump, opts, cap) {
  cap = cap || 60;
  const S = E.filterSuit(hand, lead.suit, trump);
  const rest = [];
  for (let i = 0; i < hand.length; i++) if (E.effSuit(hand[i], trump) !== lead.suit) rest.push(hand[i]);
  const k = lead.cards.length;
  const ns = Math.min(k, S.length);
  const parts = genInSuitParts(S, lead, trump, opts, Math.max(8, cap));
  const j = k - ns;
  const fills = genFills(rest, j, trump, 12, lead);
  const out = [];
  const seen = new Set();
  for (let a = 0; a < parts.length; a++) {
    for (let b = 0; b < fills.length; b++) {
      const cand = parts[a].concat(fills[b]);
      if (cand.length !== k) continue;
      const key = cand.map(function (c) { return c.id; }).sort(function (x, y) { return x - y; }).join(',');
      if (seen.has(key)) continue;
      if (!E.isLegalFollow(hand, lead, cand, trump, opts)) continue;
      seen.add(key);
      out.push(cand);
      if (out.length >= cap) return out;
    }
  }
  if (out.length === 0) out.push(forceLegalFollow(hand, lead, trump, opts));
  return out;
}

module.exports = {
  bySuit, pairsAndSingles, junkScore, combos,
  forceLegalLead, forceLegalFollow,
  genLeadCandidates, genThrowCandidates, genFollowCandidates, genFills,
};
