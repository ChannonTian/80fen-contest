/* dev/game.js —— 自建的对局循环(模拟裁判)。开发工具,不参与提交的决策代码。
 * 严格按 RULES.md §S2 的时序 + README 的接口/罚分口径实现。
 */
'use strict';
const E = require('../engine.js');
const M = require('../moves.js');

/* ---------- 种子随机 ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(deck, rng) {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* 一份「发牌结果」:与 firstTaker 无关,座位 → 25 张,外加底牌。 */
function makeDealing(seed, roundIdx) {
  const rng = mulberry32((seed * 1000003 + roundIdx * 7919) | 0);
  for (let i = 0; i < 8; i++) rng();
  const a = shuffled(E.makeDeck(), rng);
  const piles = [[], [], [], []];
  for (let s = 0; s < 4; s++) piles[s] = a.slice(s * 25, s * 25 + 25);
  return { piles: piles, kitty: a.slice(100, 108), full: a };
}

const OPTS = { strictTractorFollow: true, partialTractorFollow: true };
const GATES = [2, 5, 10, 13];

function idsOf(cs) { const a = []; for (let i = 0; i < cs.length; i++) a.push(cs[i].id); return a; }
function removeIds(hand, ids) {
  const s = new Set(ids);
  const out = [];
  for (let i = 0; i < hand.length; i++) if (!s.has(hand[i].id)) out.push(hand[i]);
  return out;
}
function sortHand(h, trump) {
  return h.slice().sort(function (a, b) {
    const sa = E.effSuit(a, trump), sb = E.effSuit(b, trump);
    if (sa !== sb) return (sa === 'T' ? 4 : 'SHDC'.indexOf(sa)) - (sb === 'T' ? 4 : 'SHDC'.indexOf(sb));
    return E.ordIdx(a, trump) - E.ordIdx(b, trump);
  });
}

/* 需要哪些牌才能亮出这个 declaration */
function cardsForDecl(hand, opt, rank) {
  if (!opt || typeof opt !== 'object') return null;
  const st = opt.strength;
  if (st === 1 || st === 2) {
    if (!opt.suit || opt.suit === 'X' || 'SHDC'.indexOf(opt.suit) < 0) return null;
    const c = hand.filter(function (x) { return x.suit === opt.suit && x.rank === rank; });
    if (st === 1) return c.length >= 1 ? [c[0]] : null;
    return c.length >= 2 ? [c[0], c[1]] : null;
  }
  if (st === 3 || st === 4) {
    const r = st === 3 ? 15 : 16;
    const c = hand.filter(function (x) { return x.suit === 'X' && x.rank === r; });
    return c.length >= 2 ? [c[0], c[1]] : null;
  }
  return null;
}

function playRound(cfg) {
  const bots = cfg.bots;
  const levels = cfg.levels;
  const played = cfg.played;
  const roundIdx = cfg.roundIdx;
  const log = { violations: [0, 0, 0, 0], penalties: [0, 0], events: [] };
  const trace = cfg.trace;

  let redeals = 0;
  let dealerKnown = cfg.dealerKnown;
  let dealer = cfg.dealer;
  let firstTaker = cfg.firstTaker;
  let dealSalt = 0;
  let hands, kitty, curDecl, rebelHappened, trump, declSeat, trumpRank;

  for (;;) {
    const dealing = makeDealing(cfg.seed, roundIdx * 17 + dealSalt);
    if (!dealerKnown && dealSalt === 0 && cfg.needCut) {
      /* 切牌定先:用牌堆前四张比大小 */
      let bi = 0;
      for (let i = 1; i < 4; i++) {
        if (E.cutValue(dealing.full[i]) > E.cutValue(dealing.full[bi])) bi = i;
      }
      firstTaker = (cfg.cutBase + bi) % 4;
    }
    hands = [[], [], [], []];
    kitty = dealing.kitty;
    curDecl = null; rebelHappened = false;

    const myRank = function (seat) {
      return dealerKnown ? levels[dealer % 2] : levels[seat % 2];
    };

    const tryDeclare = function (seat, opt) {
      if (!opt) return false;
      const rank = myRank(seat);
      const cards = cardsForDecl(hands[seat], opt, rank);
      if (!cards) { log.violations[seat]++; return false; }
      const d = E.declarationOf(cards, rank);
      if (!d) { log.violations[seat]++; return false; }
      if (d.strength !== opt.strength) { log.violations[seat]++; return false; }
      const next = { seat: seat, suit: d.suit, strength: d.strength };
      if (!E.declAllowed(curDecl, next, rebelHappened)) return false;
      curDecl = next;
      if (d.strength >= 3) rebelHappened = true;
      return true;
    };

    const mkDealView = function (seat) {
      return {
        phase: 'deal', seat: seat, myTeam: seat % 2, hand: hands[seat],
        trumpRank: myRank(seat), trump: null, declSeat: -1,
        curDecl: curDecl ? { seat: curDecl.seat, suit: curDecl.suit, strength: curDecl.strength } : null,
        rebelHappened: rebelHappened, dealerKnown: dealerKnown, dealer: dealerKnown ? dealer : -1,
        firstTaker: firstTaker, levels: [levels[0], levels[1]], played: [played[0], played[1]],
        gates: GATES, round: roundIdx, kittySize: 8, history: [], buriedKnown: [],
      };
    };

    /* ② 逐张发牌 + 亮主 */
    const cnt = [0, 0, 0, 0];
    for (let step = 0; step < 100; step++) {
      const seat = (firstTaker + step) % 4;
      hands[seat].push(dealing.piles[seat][cnt[seat]++]);
      let opt = null;
      try { opt = bots[seat].onDeal(mkDealView(seat)); } catch (e) { opt = null; log.violations[seat]++; }
      tryDeclare(seat, opt);
    }
    for (let circle = 0; circle < 4; circle++) {
      let acted = false;
      for (let i = 0; i < 4; i++) {
        const seat = (firstTaker + i) % 4;
        let opt = null;
        try { opt = bots[seat].onDeal(mkDealView(seat)); } catch (e) { opt = null; log.violations[seat]++; }
        if (opt && tryDeclare(seat, opt)) acted = true;
      }
      if (!acted) break;
    }

    /* ③ 定主定庄 */
    if (cfg.forceNoTrump) curDecl = null;      // 开发期:强制无主局,专门练这条路径
    declSeat = dealerKnown ? dealer : (curDecl ? curDecl.seat : firstTaker);
    trumpRank = dealerKnown ? levels[dealer % 2]
      : (curDecl ? levels[curDecl.seat % 2] : levels[firstTaker % 2]);
    trump = { suit: curDecl ? curDecl.suit : null, rank: trumpRank };

    /* ④ 低分/少主造反 */
    if (cfg.rebelMode !== 'off' && redeals < 3) {
      let redo = false;
      for (let i = 1; i <= 3 && !redo; i++) {
        const seat = (declSeat + i) % 4;
        if (seat % 2 === declSeat % 2) continue;
        const r = E.canFullRebel(hands[seat], trump);
        if (!r.ok) continue;
        let ans = false;
        try {
          ans = bots[seat].onRebel({
            phase: 'rebel', seat: seat, myTeam: seat % 2, hand: hands[seat],
            trumpRank: trumpRank, trump: { suit: trump.suit, rank: trump.rank }, declSeat: declSeat,
            curDecl: curDecl, rebelHappened: rebelHappened, dealerKnown: dealerKnown,
            dealer: dealerKnown ? dealer : -1, firstTaker: firstTaker,
            levels: [levels[0], levels[1]], played: [played[0], played[1]], gates: GATES,
            round: roundIdx, kittySize: 8, history: [], buriedKnown: [],
            rebelReason: { pts: r.pts, nT: r.nT, byPts: r.byPts, byTrump: r.byTrump },
          });
        } catch (e) { ans = false; log.violations[seat]++; }
        if (ans === true) redo = true;
      }
      if (redo) {
        redeals++; dealSalt++;
        dealerKnown = false; dealer = -1;
        log.events.push('redeal#' + redeals);
        continue;
      }
    }
    break;
  }

  const declTeam = declSeat % 2;
  const defTeam = 1 - declTeam;

  /* ⑤ 拿底扣底 */
  let hand33 = hands[declSeat].concat(kitty);
  let buried;
  const disView = {
    phase: 'discard', seat: declSeat, myTeam: declTeam, hand: hand33,
    trumpRank: trumpRank, trump: { suit: trump.suit, rank: trump.rank }, declSeat: declSeat,
    curDecl: curDecl, rebelHappened: rebelHappened, dealerKnown: true, dealer: declSeat,
    firstTaker: firstTaker, levels: [levels[0], levels[1]], played: [played[0], played[1]],
    gates: GATES, round: roundIdx, kittySize: 8, history: [], buriedKnown: kitty.slice(),
  };
  let dres = null;
  try { dres = bots[declSeat].discard(disView); } catch (e) { dres = null; }
  if (dres && dres.cards) dres = dres.cards;
  let ok = Array.isArray(dres) && dres.length === 8;
  if (ok) {
    const hid = new Set(idsOf(hand33)); const seen = new Set();
    for (let i = 0; i < 8; i++) {
      const c = dres[i];
      if (!c || typeof c.id !== 'number' || !hid.has(c.id) || seen.has(c.id)) { ok = false; break; }
      seen.add(c.id);
    }
  }
  if (!ok) {
    log.violations[declSeat]++;
    log.penalties[declTeam] += 40;
    log.events.push('bad-discard@' + declSeat);
    const s = hand33.slice().sort(function (a, b) { return M.junkScore(a, trump) - M.junkScore(b, trump); });
    buried = s.slice(0, 8);
  } else {
    const byId = new Map(); for (let i = 0; i < hand33.length; i++) byId.set(hand33[i].id, hand33[i]);
    buried = dres.map(function (c) { return byId.get(c.id); });
  }
  hands[declSeat] = removeIds(hand33, idsOf(buried));

  /* ⑥ 25 墩 */
  const history = [];
  const trickLog = [];
  const teamPts = [0, 0];
  let leader = declSeat;
  let lastWinner = -1, lastLeadSize = 1;

  const godify = function () {
    for (let i = 0; i < 4; i++) if (bots[i].cfg && (bots[i].cfg.oracle || bots[i].cfg.__probe)) bots[i].cfg.oracleHands = function () { return hands; };
  };
  godify();
  const mkView = function (phase, seat, trickNo) {
    return {
      phase: phase, seat: seat, myTeam: seat % 2, hand: hands[seat],
      trumpRank: trumpRank, trump: { suit: trump.suit, rank: trump.rank }, declSeat: declSeat,
      curDecl: curDecl, rebelHappened: rebelHappened, dealerKnown: true, dealer: declSeat,
      firstTaker: firstTaker, levels: [levels[0], levels[1]], played: [played[0], played[1]],
      gates: GATES, round: roundIdx, kittySize: 8, history: history,
      buriedKnown: seat === declSeat ? buried.slice() : [], trickNo: trickNo,
    };
  };

  for (let t = 0; hands[leader].length > 0; t++) {
    const plays = [];
    /* 领出 */
    let lc = null;
    try { lc = bots[leader].lead(mkView('lead', leader, t)); } catch (e) { lc = null; }
    if (lc && lc.cards) lc = lc.cards;
    let leadCards = null;
    if (Array.isArray(lc) && lc.length > 0) {
      const hid = new Set(idsOf(hands[leader])); const seen = new Set();
      let good = true;
      for (let i = 0; i < lc.length; i++) {
        const c = lc[i];
        if (!c || typeof c.id !== 'number' || !hid.has(c.id) || seen.has(c.id)) { good = false; break; }
        seen.add(c.id);
      }
      if (good) {
        const byId = new Map(); for (let i = 0; i < hands[leader].length; i++) byId.set(hands[leader][i].id, hands[leader][i]);
        const real = lc.map(function (c) { return byId.get(c.id); });
        if (E.classify(real, trump)) leadCards = real;
      }
    }
    if (!leadCards) {
      log.violations[leader]++;
      const n = (Array.isArray(lc) && lc.length) ? lc.length : 1;
      log.penalties[leader % 2] += n * 5;
      log.events.push('bad-lead@' + leader + ':' + n);
      leadCards = M.forceLegalLead(hands[leader], trump);
    }
    /* 甩牌校验 */
    const cl0 = E.classify(leadCards, trump);
    if (cl0.type === 'throw') {
      const chk = E.checkThrow(hands, leader, leadCards, trump);
      if (!chk.ok) leadCards = chk.forced.cards.slice();
    }
    hands[leader] = removeIds(hands[leader], idsOf(leadCards));
    plays.push({ seat: leader, cards: leadCards });
    history.push({ seat: leader, cards: leadCards.slice() });
    const lead = E.classify(leadCards, trump);

    for (let i = 1; i < 4; i++) {
      const seat = (leader + i) % 4;
      let fc = null;
      try { fc = bots[seat].follow(mkView('follow', seat, t), plays.map(function (p) { return { seat: p.seat, cards: p.cards.slice() }; })); }
      catch (e) { fc = null; }
      if (fc && fc.cards) fc = fc.cards;
      let cards = null;
      if (Array.isArray(fc) && fc.length === lead.cards.length) {
        const byId = new Map(); for (let q = 0; q < hands[seat].length; q++) byId.set(hands[seat][q].id, hands[seat][q]);
        let good = true; const seen = new Set();
        for (let q = 0; q < fc.length; q++) {
          const c = fc[q];
          if (!c || typeof c.id !== 'number' || !byId.has(c.id) || seen.has(c.id)) { good = false; break; }
          seen.add(c.id);
        }
        if (good) {
          const real = fc.map(function (c) { return byId.get(c.id); });
          if (E.isLegalFollow(hands[seat], lead, real, trump, OPTS)) cards = real;
        }
      }
      if (!cards) {
        log.violations[seat]++;
        log.penalties[seat % 2] += lead.cards.length * 5;
        log.events.push('bad-follow@' + seat + ':t' + t);
        cards = M.forceLegalFollow(hands[seat], lead, trump, OPTS);
      }
      hands[seat] = removeIds(hands[seat], idsOf(cards));
      plays.push({ seat: seat, cards: cards });
      history.push({ seat: seat, cards: cards.slice() });
    }

    const r = E.resolveTrick(plays, trump);
    teamPts[r.winner % 2] += r.points;
    var _lp = E.countPoints(plays[0].cards);
    trickLog.push({ t: t, leader: plays[0].seat, winner: r.winner, points: r.points,
      suit: lead.suit, size: lead.cards.length, type: lead.type,
      leadPts: _lp, otherPts: r.points - _lp, leaderWon: (r.winner % 2) === (plays[0].seat % 2) });
    leader = r.winner;
    lastWinner = r.winner;
    lastLeadSize = lead.cards.length;
    if (trace) trace(t, plays, r, trump);
  }

  /* ⑦ 结算 */
  let defPoints = teamPts[defTeam];
  defPoints += log.penalties[declTeam] - log.penalties[defTeam];
  if (defPoints < 0) defPoints = 0;
  if (defPoints > 200) defPoints = 200;
  const defWonLast = (lastWinner % 2) === defTeam;
  const sc = E.scoreRound(defPoints, buried, defWonLast, lastLeadSize);

  return {
    sc: sc, declSeat: declSeat, declTeam: declTeam, defTeam: defTeam,
    trump: trump, trumpRank: trumpRank, defPoints: defPoints,
    rawDefPoints: teamPts[defTeam], kittyPts: E.countPoints(buried),
    defWonLast: defWonLast, lastLeadSize: lastLeadSize,
    penalties: log.penalties, violations: log.violations, events: log.events,
    curDecl: curDecl, redeals: redeals, firstTaker: firstTaker,
    tricks: trickLog, history: history, buried: buried,
    hash: (function () { let h = 0; for (let i = 0; i < history.length; i++) { const cs = history[i].cards; for (let j = 0; j < cs.length; j++) h = (h * 31 + cs[j].id) | 0; } return h; })(),
  };
}

/* 一整场:打到某队过 A */
function playMatch(botFactories, seed, opts) {
  opts = opts || {};
  const maxRounds = opts.maxRounds || 60;
  const bots = botFactories.map(function (f) { return f(); });
  const levels = [2, 2];
  const played = [-1, -1];
  let dealerKnown = false, dealer = -1, firstTaker = 0, needCut = true;
  const rounds = [];
  const pen = [0, 0];
  const viol = [0, 0, 0, 0];
  let winner = -1;

  for (let r = 0; r < maxRounds; r++) {
    const res = playRound({
      bots: bots, seed: seed, roundIdx: r, levels: levels, played: played,
      dealerKnown: dealerKnown, dealer: dealer, firstTaker: firstTaker,
      needCut: needCut, cutBase: 0, rebelMode: opts.rebelMode || 'full',
    });
    pen[0] += res.penalties[0]; pen[1] += res.penalties[1];
    for (let i = 0; i < 4; i++) viol[i] += res.violations[i];
    const adv = E.advanceMatch(levels, res.declSeat, res.sc, opts.gates === null ? null : GATES, played, opts);
    levels[0] = adv.levels[0]; levels[1] = adv.levels[1];
    if (adv.played) { played[0] = adv.played[0]; played[1] = adv.played[1]; }
    rounds.push({
      declSeat: res.declSeat, declTeam: res.declTeam, total: res.sc.total, up: res.sc.up,
      held: res.sc.declHeld, levels: [levels[0], levels[1]], trump: res.trump,
      defPoints: res.defPoints, kittyPts: res.kittyPts, defWonLast: res.defWonLast,
      penalties: res.penalties.slice(), events: res.events,
    });
    if (adv.over) { winner = adv.winner; break; }
    dealer = adv.dealer; dealerKnown = true; firstTaker = dealer; needCut = false;
  }
  return {
    winner: winner, levels: levels, rounds: rounds, penalties: pen, violations: viol,
    nRounds: rounds.length,
  };
}

module.exports = { playRound, playMatch, makeDealing, mulberry32, sortHand, GATES, OPTS };
