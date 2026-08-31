/* dev/pvbot.js —— 探针:残局用「完美信息 + 贪心走子」把剩下的墩打完来评估候选。
 * 只在开发期用(需要 game.js 注入真实手牌),用来回答一个问题:
 * 「多墩前瞻」到底值多少?值就去建采样版的 rollout,不值就彻底放弃。 */
'use strict';
const E = require('../engine.js');
const M = require('../moves.js');
const S = require('../strategy.js');

function ids(cs) { const a = []; for (const c of cs) a.push(c.id); return a; }
function without(hand, cards) {
  const s = new Set(ids(cards));
  return hand.filter(c => !s.has(c.id));
}

/* 完美信息下的快速走子:能赢且值钱就赢,队友赢就送分,否则出最废的 */
function quickPlay(hands, seat, trump, plays, leadCl) {
  if (!leadCl) {
    const cands = M.quickLeadOptions(hands[seat], trump);
    let best = null, bv = -1e9;
    for (const cd of cands) {
      const cl = E.classify(cd, trump);
      if (!cl) continue;
      let beaten = false;
      for (let i = 1; i < 4 && !beaten; i++) {
        const p = (seat + i) % 4;
        if (p % 2 === seat % 2) continue;
        const sc = E.filterSuit(hands[p], cl.suit, trump);
        if (sc.length ? E.canBeatComp(sc, cl, trump)
          : (cl.suit !== 'T' && E.filterSuit(hands[p], 'T', trump).length &&
             (cl.type === 'single' || E.canBeatComp(E.filterSuit(hands[p], 'T', trump), { type: cl.type, top: -1, len: cl.len, cards: cl.cards }, trump)))) beaten = true;
      }
      let v = (beaten ? -6 : 12) + cd.length * 2 - E.countPoints(cd) * (beaten ? 1.5 : 0);
      for (const c of cd) v -= E.ordIdx(c, trump) * 0.25;
      if (v > bv) { bv = v; best = cd; }
    }
    return best || M.forceLegalLead(hands[seat], trump);
  }
  const cands = M.quickFollowOptions(hands[seat], leadCl, trump);
  const pts = plays.reduce((a, p) => a + E.countPoints(p.cards), 0);
  let best = null, bv = -1e9;
  for (const cd of cands) {
    const r = E.resolveTrick(plays.concat([{ seat, cards: cd }]), trump);
    const mine = (r.winner % 2) === (seat % 2);
    let v = mine ? 40 + (pts + E.countPoints(cd)) * 2 : -E.countPoints(cd) * 3;
    for (const c of cd) v -= E.ordIdx(c, trump) * 0.3 + (E.effSuit(c, trump) === 'T' ? 2 : 0);
    if (v > bv) { bv = v; best = cd; }
  }
  return best || M.forceLegalFollow(hands[seat], leadCl, trump, null);
}

/* 从当前局面把这一局打完,返回「我方拿到的分」 */
function playout(hands, trump, plays, leader, myTeam, kittyPts, declTeam) {
  const H = hands.map(h => h.slice());
  const teamPts = [0, 0];
  let cur = plays.map(p => ({ seat: p.seat, cards: p.cards }));
  let lead = E.classify(cur[0].cards, trump);
  let ldr = leader;
  let lastWinner = -1, lastSize = 1;
  for (;;) {
    while (cur.length < 4) {
      const seat = (ldr + cur.length) % 4;
      const cd = quickPlay(H, seat, trump, cur, lead);
      H[seat] = without(H[seat], cd);
      cur.push({ seat, cards: cd });
    }
    const r = E.resolveTrick(cur, trump);
    teamPts[r.winner % 2] += r.points;
    lastWinner = r.winner; lastSize = lead.cards.length;
    ldr = r.winner;
    if (H[ldr].length === 0) break;
    const lc = quickPlay(H, ldr, trump, [], null);
    H[ldr] = without(H[ldr], lc);
    lead = E.classify(lc, trump);
    cur = [{ seat: ldr, cards: lc }];
  }
  const defTeam = 1 - declTeam;
  let def = teamPts[defTeam];
  if ((lastWinner % 2) === defTeam) def += kittyPts * 2 * lastSize;
  return (myTeam === defTeam) ? def : -def;
}

function pvbot(maxCards) {
  const inner = S.makeAI();
  const cfg = { oracle: true, oracleHands: null };
  function god() { return cfg.oracleHands ? cfg.oracleHands() : null; }
  return {
    name: 'pv' + maxCards, cfg,
    onDeal: inner.onDeal, onRebel: inner.onRebel, discard: inner.discard,
    lead(v) {
      const g = god();
      if (!g || v.hand.length > maxCards) return inner.lead(v);
      const trump = v.trump, declTeam = v.declSeat % 2;
      const kp = v.buriedKnown && v.buriedKnown.length ? E.countPoints(v.buriedKnown) : 4;
      const cands = M.genLeadCandidates(v.hand, trump).concat(M.genThrowCandidates(v.hand, trump, 12));
      let best = null, bv = -1e9;
      const seen = new Set();
      for (const cd of cands) {
        const k = ids(cd).sort((a, b) => a - b).join(',');
        if (seen.has(k)) continue; seen.add(k);
        if (!E.classify(cd, trump)) continue;
        const hands = [0, 1, 2, 3].map(i => g[i].slice());
        hands[v.seat] = without(hands[v.seat], cd);
        const val = playout(hands, trump, [{ seat: v.seat, cards: cd }], v.seat, v.myTeam, kp, declTeam);
        if (val > bv) { bv = val; best = cd; }
      }
      return best || inner.lead(v);
    },
    follow(v, plays) {
      const g = god();
      if (!g || v.hand.length > maxCards) return inner.follow(v, plays);
      const trump = v.trump, declTeam = v.declSeat % 2;
      const kp = v.buriedKnown && v.buriedKnown.length ? E.countPoints(v.buriedKnown) : 4;
      const lead = E.classify(plays[0].cards, trump);
      const cands = M.genFollowCandidates(v.hand, lead, trump, null, 40, 10);
      let best = null, bv = -1e9;
      for (const cd of cands) {
        const hands = [0, 1, 2, 3].map(i => g[i].slice());
        hands[v.seat] = without(hands[v.seat], cd);
        const val = playout(hands, trump, plays.concat([{ seat: v.seat, cards: cd }]), plays[0].seat, v.myTeam, kp, declTeam);
        if (val > bv) { bv = val; best = cd; }
      }
      return best && E.isLegalFollow(v.hand, lead, best, trump, null) ? best : inner.follow(v, plays);
    },
  };
}
module.exports = { pvbot, playout, quickPlay };
