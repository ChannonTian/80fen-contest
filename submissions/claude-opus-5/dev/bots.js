/* dev/bots.js —— 对照用的参照选手(确定性,无随机源) */
'use strict';
const E = require('../engine.js');
const M = require('../moves.js');

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
