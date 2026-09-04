/* dev/bots.js —— 对照用的参照选手(确定性,无随机源) */
'use strict';
const E = require('../engine.js');
const M = require('../moves.js');
/* 计时标尺专用的冻结引擎,见 dev/frozen/README.md */
const FE = require('./frozen/engine.js');
const FM = require('./frozen/moves.js');

/* 模板选手:example/index.js 的行为 */
function template() {
  return {
    name: 'template',
    onDeal() { return null; },
    onRebel() { return false; },
    discard(v) { return v.hand.slice(0, 8); },
    lead(v) { return [v.hand[0]]; },
    follow(v, plays) { return v.hand.slice(0, plays[0].cards.length); },
  };
}

/* 守法但无策略:总是出最小的合法着法,亮主看到级数牌就亮 */
function naive() {
  return {
    name: 'naive',
    onDeal(v) {
      const r = v.trumpRank;
      for (let i = 0; i < v.hand.length; i++) {
        const c = v.hand[i];
        if (c.suit !== 'X' && c.rank === r) {
          if (v.curDecl) return null;
          return { suit: c.suit, strength: 1 };
        }
      }
      return null;
    },
    onRebel() { return false; },
    discard(v) {
      const h = v.hand.slice().sort((a, b) => M.junkScore(a, v.trump) - M.junkScore(b, v.trump));
      return h.slice(0, 8);
    },
    lead(v) { return M.forceLegalLead(v.hand, v.trump); },
    follow(v, plays) {
      const lead = E.classify(plays[0].cards, v.trump);
      return M.forceLegalFollow(v.hand, lead, v.trump, null);
    },
  };
}

/* 贪心:能赢就赢,不能赢就垫最小;亮主用长门 */
function greedy() {
  return {
    name: 'greedy',
    onDeal(v) {
      const r = v.trumpRank, h = v.hand;
      if (h.length < 12) return null;
      const cnt = { S: 0, H: 0, D: 0, C: 0 }, rc = { S: 0, H: 0, D: 0, C: 0 };
      for (const c of h) { if (c.suit !== 'X') { cnt[c.suit]++; if (c.rank === r) rc[c.suit]++; } }
      let bs = null, bv = -1;
      for (const s of ['S', 'H', 'D', 'C']) if (rc[s] > 0 && cnt[s] > bv) { bv = cnt[s]; bs = s; }
      if (!bs) return null;
      const st = rc[bs] >= 2 ? 2 : 1;
      if (v.curDecl) { if (v.curDecl.seat === v.seat || st <= v.curDecl.strength) return null; }
      return { suit: bs, strength: st };
    },
    onRebel() { return false; },
    discard(v) {
      const h = v.hand.slice().sort((a, b) => M.junkScore(a, v.trump) - M.junkScore(b, v.trump));
      return h.slice(0, 8);
    },
    lead(v) {
      const cands = M.genLeadCandidates(v.hand, v.trump);
      let best = null, bv = -1e9;
      for (const cd of cands) {
        const cl = E.classify(cd, v.trump);
        if (!cl) continue;
        const s = cl.top * 1.0 + cd.length * 2 - (cl.suit === 'T' ? 8 : 0);
        if (s > bv) { bv = s; best = cd; }
      }
      return best || M.forceLegalLead(v.hand, v.trump);
    },
    follow(v, plays) {
      const lead = E.classify(plays[0].cards, v.trump);
      const cands = M.genFollowCandidates(v.hand, lead, v.trump, null, 40);
      const pts = plays.reduce((a, p) => a + E.countPoints(p.cards), 0);
      let best = null, bv = -1e9;
      for (const cd of cands) {
        const r = E.resolveTrick(plays.concat([{ seat: v.seat, cards: cd }]), v.trump);
        const iWin = r.winner === v.seat;
        const partner = (r.winner % 2) === v.myTeam;
        let s = iWin ? 100 + pts * 2 : (partner ? 40 + E.countPoints(cd) * 3 : -E.countPoints(cd) * 3);
        for (const c of cd) s -= E.ordIdx(c, v.trump) * 0.5 + (E.effSuit(c, v.trump) === 'T' ? 3 : 0);
        if (s > bv) { bv = s; best = cd; }
      }
      return best || M.forceLegalFollow(v.hand, lead, v.trump, null);
    },
  };
}


/* 抢分型:见分就抢,能赢就赢,分牌优先垫给队友 */
function pointHog() {
  const g = greedy();
  return {
    name: 'pointHog',
    onDeal: g.onDeal, onRebel: () => false, discard: g.discard,
    lead(v) {
      const cands = M.genLeadCandidates(v.hand, v.trump);
      let best = null, bv = -1e9;
      for (const cd of cands) {
        const cl = E.classify(cd, v.trump); if (!cl) continue;
        const s = cl.top * 2 + cd.length * 3 + E.countPoints(cd) * 0.5;
        if (s > bv) { bv = s; best = cd; }
      }
      return best || M.forceLegalLead(v.hand, v.trump);
    },
    follow(v, plays) {
      const lead = E.classify(plays[0].cards, v.trump);
      const cands = M.genFollowCandidates(v.hand, lead, v.trump, null, 40);
      const pts = plays.reduce((a, p) => a + E.countPoints(p.cards), 0);
      let best = null, bv = -1e9;
      for (const cd of cands) {
        const r = E.resolveTrick(plays.concat([{ seat: v.seat, cards: cd }]), v.trump);
        const iWin = r.winner === v.seat, mate = (r.winner % 2) === v.myTeam;
        let s = iWin ? 200 + pts * 4 : (mate ? 60 + E.countPoints(cd) * 6 : -E.countPoints(cd) * 2);
        for (const c of cd) s -= E.ordIdx(c, v.trump) * 0.2;
        if (s > bv) { bv = s; best = cd; }
      }
      return best || M.forceLegalFollow(v.hand, lead, v.trump, null);
    },
  };
}

/* 攒主型:主牌能不出就不出,副牌一律出小 */
function trumpMiser() {
  const g = greedy();
  return {
    name: 'trumpMiser',
    onDeal: g.onDeal, onRebel: () => false, discard: g.discard,
    lead(v) {
      const cands = M.genLeadCandidates(v.hand, v.trump);
      let best = null, bv = -1e9;
      for (const cd of cands) {
        const cl = E.classify(cd, v.trump); if (!cl) continue;
        let s = cl.top + cd.length * 2 - (cl.suit === 'T' ? 40 : 0) - E.countPoints(cd);
        if (s > bv) { bv = s; best = cd; }
      }
      return best || M.forceLegalLead(v.hand, v.trump);
    },
    follow(v, plays) {
      const lead = E.classify(plays[0].cards, v.trump);
      const cands = M.genFollowCandidates(v.hand, lead, v.trump, null, 40);
      const pts = plays.reduce((a, p) => a + E.countPoints(p.cards), 0);
      let best = null, bv = -1e9;
      for (const cd of cands) {
        const r = E.resolveTrick(plays.concat([{ seat: v.seat, cards: cd }]), v.trump);
        const iWin = r.winner === v.seat, mate = (r.winner % 2) === v.myTeam;
        let nT = 0; for (const c of cd) if (E.effSuit(c, v.trump) === 'T') nT++;
        let s = iWin ? (pts >= 10 ? 120 + pts * 2 : 20) : (mate ? 50 + E.countPoints(cd) * 3 : -E.countPoints(cd) * 3);
        s -= nT * 12;
        for (const c of cd) s -= E.ordIdx(c, v.trump) * 0.4;
        if (s > bv) { bv = s; best = cd; }
      }
      return best || M.forceLegalFollow(v.hand, lead, v.trump, null);
    },
  };
}

/* 同门异构:自家 AI 换一批权重,当作「水平相当但风格不同」的对手 */
function sibling() {
  /* 用 dev/yardstick/ 的**冻结快照**,不跟着 DEFAULTS 漂移 —— 之前 sibling
   * 一直在偷偷吸收我自己的改进,把进步量得偏小了。 */
  const S = require('./yardstick/strategy.js');
  return S.makeAI({
    name: 'sibling',
    /* 固定住,不要跟着 DEFAULTS 漂移 —— 它是长期对照的标尺 */
    rollout: false, cvRuffAware: 0, voidAwarePool: true, evalV2: true, declV2: true,
    ntGate: 8, declNoDealerBar: 0, rebelPts: 99, rebelTrump: 99,
    tempoW: 7, lossW: 1.3, overkillW: 0.22, drawTrumpW: 18,
    leadWinPts: 4.6, leadLosePts: 6.2, ptsPerCardLater: 2.6,
    breakPairW: 3, voidGainW: 2, throwBonus: 25,
    declProjNeed: 9, ruffPairFactor: 0.45, cvSure: 15, cvTrumpBase: 5,
  });
}

/* 带 rollout 的同门对手(和本 AI 同架构、同强度级别) */
function siblingR() {
  const S = require('./yardstick/strategy.js');
  return S.makeAI({
    name: 'siblingR',
    tempoW: 7, lossW: 1.3, overkillW: 0.22, drawTrumpW: 18,
    leadWinPts: 4.6, leadLosePts: 6.2, ptsPerCardLater: 2.6,
    breakPairW: 3, voidGainW: 2, throwBonus: 25,
    declProjNeed: 9, ruffPairFactor: 0.45, cvSure: 15, cvTrumpBase: 5,
  });
}

/* 专门制造无主局:有王对就反成无主;没有就不亮,逼出「无人亮主 → 无主局」 */
function ntForcer() {
  const g = greedy();
  return {
    name: 'ntForcer',
    onDeal(v) {
      let sj = 0, bj = 0;
      for (const c of v.hand) if (c.suit === 'X') { if (c.rank === 15) sj++; else bj++; }
      const st = bj >= 2 ? 4 : (sj >= 2 ? 3 : 0);
      if (!st) return null;
      if (v.curDecl && (v.curDecl.seat === v.seat || st <= v.curDecl.strength)) return null;
      return { suit: null, strength: st };
    },
    onRebel: g.onRebel, discard: g.discard, lead: g.lead, follow: g.follow,
  };
}

module.exports = { template, naive, greedy, pointHog, trumpMiser, sibling, siblingR, ntForcer };


/* ---------- 计时标尺:和上面同样的策略,但跑在冻结的引擎上 ----------
 * 只用于时间预算测量。参照选手若共享我正在优化的 moves.js/engine.js,
 * 我的优化会漏进标尺里,比值就不再反映「相对主办方基准选手」的真实倍数。 */
function frozenify(src, name) {
  return function () {
    const body = src.toString()
      .replace(/\bM\./g, '__FM.').replace(/\bE\./g, '__FE.');
    /* eslint-disable no-new-func */
    const f = new Function('__FE', '__FM', 'return (' + body + ')')(FE, FM);
    const ai = f(); ai.name = name; return ai;
  };
}
const greedyFrozen = frozenify(greedy, 'greedyFrozen');

module.exports.greedyFrozen = greedyFrozen;


/* ---------- 陌生风格的对手 ----------
 * 我所有的调参都是打我自己写的 bot,而联赛里对手是别的模型写的程序。
 * 这几个的目的不是"强",是**风格上与我的参照选手正交**,用来试探我的
 * 对手模型和评估函数有没有对某一类打法系统性失灵。全部确定性(自带种子)。 */
function rngFrom(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5; let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function seedOf(v) {
  let s = (v.hand.length * 31 + (v.history ? v.history.length : 0) * 7919 + v.seat * 131) | 0;
  for (let i = 0; i < v.hand.length; i++) s = (s * 33 + v.hand[i].id) | 0;
  return s;
}

/* 完全不可预测:在合法候选里等概率乱挑。专门用来打「对手是理性的」这个假设。 */
function randomLegal() {
  return {
    name: 'randomLegal',
    onDeal(v) {
      const r = v.trumpRank, h = v.hand, rng = rngFrom(seedOf(v));
      const ok = [];
      for (const c of h) if (c.rank === r && c.suit !== 'X') ok.push(c.suit);
      if (!ok.length || rng() < 0.4) return null;
      const s = ok[Math.floor(rng() * ok.length) % ok.length];
      if (v.curDecl && (v.curDecl.seat === v.seat || v.curDecl.strength >= 1)) return null;
      return { suit: s, strength: 1 };
    },
    onRebel() { return false; },
    discard(v) {
      const rng = rngFrom(seedOf(v));
      const h = v.hand.slice();
      for (let i = h.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = h[i]; h[i] = h[j]; h[j] = t; }
      return h.slice(0, 8);
    },
    lead(v) {
      const cands = M.genLeadCandidates(v.hand, v.trump);
      if (!cands.length) return M.forceLegalLead(v.hand, v.trump);
      return cands[Math.floor(rngFrom(seedOf(v))() * cands.length) % cands.length];
    },
    follow(v, plays) {
      const lead = E.classify(plays[0].cards, v.trump);
      const cands = M.genFollowCandidates(v.hand, lead, v.trump, null, 40);
      if (!cands.length) return M.forceLegalFollow(v.hand, lead, v.trump, null);
      return cands[Math.floor(rngFrom(seedOf(v))() * cands.length) % cands.length];
    },
  };
}

/* 甩牌狂:能甩就甩,专打我的甩牌处理与被甩时的应对。 */
function thrower() {
  const g = greedy();
  return {
    name: 'thrower',
    onDeal: g.onDeal, onRebel: g.onRebel, discard: g.discard,
    lead(v) {
      const thr = M.genThrowCandidates(v.hand, v.trump, 30);
      let best = null;
      for (const cd of thr) if (!best || cd.length > best.length) best = cd;   // 越大越甩
      return best || g.lead(v);
    },
    follow: g.follow,
  };
}

/* 极端保守:永不领主,永远出最小的,分只往队友手里塞。 */
function hoarder() {
  const g = greedy();
  return {
    name: 'hoarder',
    onDeal: g.onDeal, onRebel: g.onRebel, discard: g.discard,
    lead(v) {
      const cands = M.genLeadCandidates(v.hand, v.trump);
      let best = null, bv = 1e9;
      for (const cd of cands) {
        const cl = E.classify(cd, v.trump);
        if (!cl) continue;
        const s = cl.top + (cl.suit === 'T' ? 100 : 0) + E.countPoints(cd) * 3;
        if (s < bv) { bv = s; best = cd; }
      }
      return best || M.forceLegalLead(v.hand, v.trump);
    },
    follow: g.follow,
  };
}

/* 极端进攻:永远出能出的最大的一手,高牌早早烧光。 */
function maxer() {
  const g = greedy();
  return {
    name: 'maxer',
    onDeal: g.onDeal, onRebel: g.onRebel, discard: g.discard,
    lead(v) {
      const cands = M.genLeadCandidates(v.hand, v.trump);
      let best = null, bv = -1e9;
      for (const cd of cands) {
        const cl = E.classify(cd, v.trump);
        if (!cl) continue;
        const s = cl.top + (cl.suit === 'T' ? 50 : 0) + cd.length * 3;
        if (s > bv) { bv = s; best = cd; }
      }
      return best || M.forceLegalLead(v.hand, v.trump);
    },
    follow(v, plays) {
      const lead = E.classify(plays[0].cards, v.trump);
      const cands = M.genFollowCandidates(v.hand, lead, v.trump, null, 40);
      let best = null, bv = -1e9;
      for (const cd of cands) {
        const cl = E.classify(cd, v.trump);
        const s = (cl ? cl.top : -1) + (cl && cl.suit === 'T' ? 50 : 0);
        if (s > bv) { bv = s; best = cd; }
      }
      return best || M.forceLegalFollow(v.hand, lead, v.trump, null);
    },
  };
}
module.exports.randomLegal = randomLegal;
module.exports.thrower = thrower;
module.exports.hoarder = hoarder;
module.exports.maxer = maxer;
