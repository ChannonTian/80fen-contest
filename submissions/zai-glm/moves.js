/* 着法生成与「裁判替出」用的兜底合法着法。只用 JS 内建。 */
'use strict';
const E = require('./engine.js');

/* 手里 (suit,rank) 的 pair 列表，按 ordIdx 升序 */
function pairList(cards, trump) {
  const g = new Map();
  for (const c of cards) {
    const k = c.suit + c.rank;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(c);
  }
  const out = [];
  for (const g2 of g.values()) if (g2.length >= 2) out.push({ cards: [g2[0], g2[1]], top: ordOf(g2[0], trump) });
  out.sort((a, b) => a.top - b.top);
  return out;
}
function ordOf(c, trump) { return E.ordIdx(c, trump); }

/* 最长拖拉机 run（连续 pair 序列）的最大长度，并返回所有 runs */
function tractorRuns(pairs) {
  const runs = [];
  let run = [];
  for (const p of pairs) {
    if (run.length && p.top - run[run.length - 1].top === 1) run.push(p);
    else { if (run.length) runs.push(run); run = [p]; }
  }
  if (run.length) runs.push(run);
  return runs; // 每个 run 是 pair 数组,长度 1 的就是孤立对
}

/* 跟牌候选生成：返回若干合法 chosen（可能很多，限制条数）。
 * 策略：满足义务后，剩余名额从「本门牌 + 其他门牌」里组合。
 * 这里生成一个覆盖面足够广的集合：义务核心固定/最低几种 + 垫牌选择。 */
function legalFollows(hand, lead, trump, cap) {
  cap = cap || 200;
  const n = lead.cards.length;
  const S = hand.filter(c => E.effSuit(c, trump) === lead.suit);
  const k = Math.min(n, S.length);
  const needPairs = lead.type === 'pair' ? 1
    : lead.type === 'tractor' ? lead.len
    : lead.type === 'throw' ? lead.comps.reduce((a, c) => a + (c.type === 'tractor' ? c.len : 1), 0)
    : 0;
  const mustP = Math.min(needPairs, E.countPairsIn(S), (k / 2) | 0); // k/2 封顶:规则书洞,见 forceLegalFollow 注
  const runs = tractorRuns(pairList(S, trump));
  const maxT = runs.reduce((m, r) => r.length >= 2 ? Math.max(m, r.length) : m, 0);
  let tractorObl = null;
  if (lead.type === 'tractor' && maxT >= 2) {
    tractorObl = maxT >= lead.len ? lead.len : maxT; // 必须出的拖拉机长度
  }

  const seen = new Set();
  const out = [];
  function emit(sel) {
    if (sel.length !== n) return;
    const ids = sel.map(c => c.id).sort((a, b) => a - b).join(',');
    if (seen.has(ids)) return;
    if (!E.isLegalFollow(hand, lead, sel, trump)) return;
    seen.add(ids);
    out.push(sel);
  }

  // 义务牌核心:拖拉机义务 + 对子数义务(叠加),再加最低补足
  function obligationCores() {
    const cores = [];
    const pairs = runs.reduce((a, r) => a.concat(r), []); // 全部 pair,升序
    const pairKey = (p) => p.cards[0].suit + p.cards[0].rank;
    if (tractorObl) {
      const segs = [];
      for (const r of runs) {
        if (r.length < tractorObl) continue;
        for (let st = 0; st + tractorObl <= r.length; st++) segs.push(r.slice(st, st + tractorObl));
      }
      if (!segs.length) return null; // 不应发生
      for (const seg of segs.slice(0, 4)) {
        const base = [];
        const usedPairs = new Set();
        for (const p of seg) { base.push(...p.cards); usedPairs.add(pairKey(p)); }
        // 补对子到 mustP
        const rem = pairs.filter(p => !usedPairs.has(pairKey(p)));
        const extraSets = mustP > seg.length ? pickIdx(rem.length, Math.min(mustP - seg.length, rem.length), 4) : [[]];
        for (const idxs of extraSets) {
          const cs = base.slice();
          for (const i of idxs) cs.push(...rem[i].cards);
          cores.push(cs);
        }
      }
    } else if (mustP > 0) {
      const idxSets = pickIdx(pairs.length, mustP, 8);
      for (const idxs of idxSets) {
        const cs = [];
        for (const i of idxs) cs.push(...pairs[i].cards);
        cores.push(cs);
      }
    } else cores.push([]);
    return cores;
  }

  function pickIdx(total, m, cap) {
    // 从 total 个里选 m 个的所有组合(带 cap);优先枚举「包含最低几个」与「最高几个」
    const res = [];
    function rec(start, chosen) {
      if (res.length >= cap) return;
      if (chosen.length === m) { res.push(chosen.slice()); return; }
      for (let i = start; i <= total - (m - chosen.length); i++) {
        chosen.push(i); rec(i + 1, chosen); chosen.pop();
      }
    }
    rec(0, []);
    return res;
  }

  const cores = obligationCores();
  if (!cores) return [{ fallback: true }];

  const Srest = S.slice(); // 本门剩余可选
  const others = hand.filter(c => E.effSuit(c, trump) !== lead.suit);

  for (const core of cores) {
    const coreIds = new Set(core.map(c => c.id));
    const pool = S.filter(c => !coreIds.has(c.id));
    const extra = k - core.length;
    // 本门补足 extra 张的若干选法:最低的、最高的、含分的
    const choices = pickFrom(pool, extra, trump);
    for (const add of choices) {
      const sel = core.concat(add);
      if (sel.length < n) {
        // 本门出完还不够(或选择出本门更少?不 —— 必须出 k 张本门,这里 sel===k)
        if (sel.length !== k) continue;
        // 剩 n-k 张从 others 里选
        const och = pickFrom(others, n - k, trump);
        for (const add2 of och) emit(sel.concat(add2));
        if (out.length > cap) return out;
      } else emit(sel);
      if (out.length > cap) return out;
    }
  }
  if (!out.length) {
    // 兜底:至少给一个合法解
    emit(forceLegalFollow(hand, lead, trump));
  }
  return out;
}

function pickFrom(pool, m, trump) {
  if (m <= 0) return [[]];
  if (pool.length < m) return [];
  const res = [];
  const byOrd = pool.slice().sort((a, b) => ordOf(a, trump) - ordOf(b, trump) || a.id - b.id);
  // 最低 m、最高 m、最低 m-1 + 每个「分牌」、以及少量随机位置
  const low = byOrd.slice(0, m);
  const high = byOrd.slice(-m);
  res.push(low, high);
  const midStart = (((pool.length - m) / 2) | 0);
  const mid = byOrd.slice(midStart, midStart + m);
  if (mid.length === m) res.push(mid);
  if (m >= 1 && pool.length > m) {
    for (let i = m - 1; i < Math.min(byOrd.length, m + 5); i++) {
      const s = low.slice(0, m - 1).concat([byOrd[i]]);
      res.push(s);
    }
    // 逐个换入高牌
    for (let j = pool.length - 1; j >= Math.max(m, pool.length - 4); j--) {
      const s = low.slice(0, m - 1).concat([byOrd[j]]);
      res.push(s);
    }
  }
  // 去重
  const seen = new Set();
  return res.filter(s => {
    const k = s.map(c => c.id).sort((a, b) => a - b).join(',');
    if (seen.has(k) || s.length !== m) return false;
    seen.add(k); return true;
  });
}

/* 裁判替出用:构造一手一定合法的跟牌(尽量笨:义务牌取最低,垫牌取最低)。
 * 义务是叠加的:张数 → 对子数 → 拖拉机,三条都要满足。 */
function forceLegalFollow(hand, lead, trump) {
  const n = lead.cards.length;
  const S = hand.filter(c => E.effSuit(c, trump) === lead.suit);
  const k = Math.min(n, S.length);
  const pairs = pairList(S, trump);           // 升序
  const runs = tractorRuns(pairs);
  const maxT = runs.reduce((m, r) => r.length >= 2 ? Math.max(m, r.length) : m, 0);
  const need = lead.type === 'pair' ? 1
    : lead.type === 'tractor' ? lead.len
    : lead.type === 'throw' ? lead.comps.reduce((a, c) => a + (c.type === 'tractor' ? c.len : 1), 0)
    : 0;
  // 注意:need 超过 k/2 时(如甩 3 单 vs 手里 2 对),规则书伪码下不存在合法跟牌
  // —— 这是规则书的洞(NOTES.md)。这里按可用张数封顶,给出「最接近义务」的一手。
  const mustP = Math.min(need, E.countPairsIn(S), (k / 2) | 0);

  const sel = [];
  const used = new Set();
  const usedPairs = new Set(); // 已完整选入的 (suit,rank) 对

  function addPair(p) {
    sel.push(p.cards[0], p.cards[1]);
    used.add(p.cards[0].id); used.add(p.cards[1].id);
    usedPairs.add(p.cards[0].suit + p.cards[0].rank);
  }

  // 1) 拖拉机义务:领出拖拉机、手里有拖拉机时,必须含一段
  if (lead.type === 'tractor' && maxT >= 2) {
    const L = maxT >= lead.len ? lead.len : maxT;
    let seg = null;
    for (const r of runs) {
      if (r.length < L) continue;
      // 取该 run 最低的连续 L 段
      const cand = r.slice(0, L);
      if (!seg || cand[0].top < seg[0].top) seg = cand;
    }
    for (const p of seg) addPair(p);
  }
  // 2) 对子数义务(与拖拉机义务叠加)
  for (const p of pairs) {
    if (usedPairs.size >= mustP) break;
    if (!used.has(p.cards[0].id)) addPair(p);
  }
  // 3) 张数:本门补足
  const rest = S.filter(c => !used.has(c.id))
    .sort((a, b) => ordOf(a, trump) - ordOf(b, trump) || a.id - b.id);
  while (sel.length < k && rest.length) sel.push(rest.shift());
  // 4) 本门不够:垫其他门最低(先废牌)
  if (sel.length < n) {
    const oth = hand.filter(c => E.effSuit(c, trump) !== lead.suit)
      .sort((a, b) => (E.cardPts(a) - E.cardPts(b)) || (ordOf(a, trump) - ordOf(b, trump)) || (a.id - b.id));
    while (sel.length < n && oth.length) sel.push(oth.shift());
  }
  return sel;
}

module.exports = { pairList, tractorRuns, legalFollows, forceLegalFollow, pickFrom };
