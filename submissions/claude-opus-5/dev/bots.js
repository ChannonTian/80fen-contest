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

module.exports = { template, naive, greedy };
