/* 对局循环 —— 照 RULES.md §S2 的时序模拟裁判。开发工具,不在提交件里。 */
'use strict';
const E = require('../engine.js');
const M = require('../moves.js');

/* 种子随机:mulberry32 */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

const GATES = [2, 5, 10, 13];

/* ===== 切牌定先 ===== */
function cutForFirst(rnd) {
  const deck = E.makeDeck();
  const cuts = [];
  for (let s = 0; s < 4; s++) cuts.push(deck[(rnd() * 108) | 0]);
  let best = 0;
  for (let s = 1; s < 4; s++) {
    if (cuts[s].rank > cuts[best].rank) best = s;
    else if (cuts[s].rank === cuts[best].rank) {
      const so = { S: 3, H: 2, C: 1, D: 0 };
      if (cuts[s].suit === 'X' || (so[cuts[s].suit] || 0) > (so[cuts[best].suit] || 0)) best = s;
    }
  }
  return best;
}

function freeze(o) { return Object.freeze(o); }

/* ===== 一局的完整流程 =====
 * opts: {dealerKnown, firstTaker, round, levels, played, gates}
 * 返回 {sc, declSeat, penalties, violations, fallbacks}
 */
function playRound(ais, st, rnd, opts) {
  const violations = [0, 0, 0, 0];   // 每家违规次数
  const fallbacks = [0, 0, 0, 0];
  const penTeam = [0, 0];            // 罚分(记到对方头上的额度,按犯规方所在队索引记)
  let declSeat = -1, curDecl = null, rebelHappened = false;
  let dealerKnown = opts.dealerKnown;
  let firstTaker = opts.firstTaker;

  let redealCount = 0;
  while (true) {
    // ---- 发牌 + 亮主 ----
    const deck = E.makeDeck();
    for (const c of deck) Object.freeze(c);
    shuffle(deck, rnd);
    const hands = [[], [], [], []];
    curDecl = null; rebelHappened = false;

    const myLevel = (s) => dealerKnown ? st.levels[opts.dealer % 2] : st.levels[s % 2];

    function baseView(s, hand) {
      return {
        phase: 'deal', seat: s, myTeam: s % 2, hand: hand.map(x => x),
        trumpRank: myLevel(s), trump: null, declSeat: -1,
        curDecl: curDecl ? { seat: curDecl.seat, suit: curDecl.suit, strength: curDecl.strength } : null,
        rebelHappened, dealerKnown, dealer: dealerKnown ? opts.dealer : -1,
        firstTaker, levels: st.levels.slice(), played: st.played.slice(), gates: st.gates.slice(),
        round: opts.round, kittySize: 8, history: [], buriedKnown: [],
      };
    }

    function askDeal(s) {
      const ai = ais[s];
      let r;
      try { r = ai.onDeal(freeze(baseView(s, hands[s]))) || null; }
      catch (e) { fallbacks[s]++; return; }
      if (!r) return;
      // 校验组合真的在手
      const lv = myLevel(s);
      let valid = null;
      if (r.strength === 1 || r.strength === 2) {
        const cs = hands[s].filter(x => x.suit === r.suit && x.rank === lv);
        if (r.strength === 1 && cs.length >= 1) valid = { suit: r.suit, strength: 1 };
        if (r.strength === 2 && cs.length >= 2) valid = { suit: r.suit, strength: 2 };
      } else if (r.strength === 3 || r.strength === 4) {
        const j = hands[s].filter(x => x.suit === 'X' && x.rank === (r.strength === 3 ? 15 : 16));
        if (j.length >= 2) valid = { suit: null, strength: r.strength };
      }
      if (!valid) { violations[s]++; return; } // 拿不出来:当作没亮
      const offer = { seat: s, suit: valid.suit, strength: valid.strength };
      if (E.canReinforce(curDecl, s, offer, rebelHappened)) curDecl = offer;
      else if (E.canOverride(curDecl, s, offer)) {
        curDecl = offer;
        if (valid.strength >= 3) rebelHappened = true;
      }
      // 压不过/反自己:判断失误,不算违规
    }

    for (let i = 0; i < 100; i++) {
      const s = (firstTaker + i) % 4;
      hands[s].push(deck[i]);
      askDeal(s);
    }
    // 发完后再绕圈问,直到一整圈没人动作(上限 4 圈)
    for (let circle = 0; circle < 4; circle++) {
      let acted = false;
      for (let s = 0; s < 4; s++) {
        const before = curDecl;
        askDeal(s);
        if (curDecl !== before) acted = true;
      }
      if (!acted) break;
    }

    // ---- 定主、定庄 ----
    let trump;
    if (curDecl) {
      const lv = dealerKnown ? st.levels[opts.dealer % 2] : st.levels[curDecl.seat % 2];
      trump = { suit: curDecl.strength >= 3 ? null : curDecl.suit, rank: lv };
      if (!dealerKnown) declSeat = curDecl.seat;
    } else {
      const lv = dealerKnown ? st.levels[opts.dealer % 2] : st.levels[firstTaker % 2];
      trump = { suit: null, rank: lv }; // 无人亮主 → 无主局
      if (!dealerKnown) declSeat = firstTaker;
    }
    if (dealerKnown) declSeat = opts.dealer;

    // ---- 造反 ----
    if (redealCount < 3) {
      let rebel = false;
      for (let i = 1; i <= 4 && !rebel; i++) {
        const s = (declSeat + i) % 4;
        if (s % 2 === declSeat % 2) continue; // 只有庄家的对方队
        const el = E.isRebelEligible(hands[s], trump, 15, 3);
        if (!el.ok) continue;
        let nT = 0;
        for (const c of hands[s]) if (E.effSuit(c, trump) === 'T') nT++;
        let r = false;
        try {
          r = !!ais[s].onRebel(freeze(Object.assign(baseView(s, hands[s]), {
            phase: 'rebel', trump, declSeat,
            rebelReason: { pts: E.countPts(hands[s]), nT, byPts: !!el.pts, byTrump: !!el.byTrump },
          })));
        } catch (e) { fallbacks[s]++; }
        if (r) { rebel = true; redealCount++; }
      }
      if (rebel) { dealerKnown = false; firstTaker = cutForFirst(rnd); continue; } // 重发 → 回到①,按无庄局处理
    }
    // redeal 次数用尽也强制开打 —— 上面 while(true) 自然处理

    return finishRound(ais, st, rnd, { hands, trump, declSeat, deck, firstTaker,
      violations, fallbacks, dealerKnown });
  }
}

function finishRound(ais, st, rnd, ctx) {
  const { hands, trump, declSeat, deck, violations, fallbacks } = ctx;
  const defTeam = 1 - (declSeat % 2);
  const penTeam = [0, 0];
  const penalize = penalizeFactory(defTeam, penTeam);

  // ---- 扣底 ----
  const kitty = deck.slice(100);
  hands[declSeat] = hands[declSeat].concat(kitty);
  {
    let disc;
    const v = Object.freeze({
      phase: 'discard', seat: declSeat, myTeam: declSeat % 2, hand: hands[declSeat].slice(),
      trumpRank: trump.rank, trump, declSeat, curDecl: null, rebelHappened: false,
      dealerKnown: true, dealer: declSeat, firstTaker: ctx.firstTaker,
      levels: st.levels.slice(), played: st.played.slice(), gates: st.gates.slice(),
      round: ctx.round, kittySize: 8, history: [], buriedKnown: kitty.slice(),
    });
    try { disc = ais[declSeat].discard(v); } catch (e) { fallbacks[declSeat]++; disc = null; }
    const ids = disc ? disc.map(c => c && c.id) : null;
    const okDisc = disc && disc.length === 8 &&
      new Set(ids).size === 8 &&
      ids.every(id => hands[declSeat].some(c => c.id === id));
    if (!okDisc) {
      violations[declSeat]++;
      penalize(declSeat, 40);
      // 裁判替扣:8 张最低的非分牌,不够再扣分低的
      const sorted = hands[declSeat].slice().sort((a, b) => (E.cardPts(a) - E.cardPts(b)) ||
        (E.ordIdx(a, trump) - E.ordIdx(b, trump)) || (a.id - b.id));
      disc = sorted.slice(0, 8);
    }
    const dids = new Set(disc.map(c => c.id));
    hands[declSeat] = hands[declSeat].filter(c => !dids.has(c.id));
    var buried = disc.slice();
  }

  // ---- 25 墩 ----
  const history = [];
  let pts = [0, 0]; // 各队收的分
  let lastLeadSize = 1, lastWinnerTeam = 0;
  let leader = declSeat;
  for (let t = 0; hands[declSeat].length > 0 && hands[leader].length > 0; t++) {
    const plays = [];
    for (let i = 0; i < 4; i++) {
      const s = (leader + i) % 4;
      const leadCls = plays.length ? E.classify(plays[0].cards, trump) : null;
      const v = Object.freeze({
        phase: plays.length ? 'follow' : 'lead', seat: s, myTeam: s % 2,
        hand: hands[s].slice(), trumpRank: trump.rank, trump, declSeat, curDecl: null,
        rebelHappened: false, dealerKnown: true, dealer: declSeat, firstTaker: ctx.firstTaker,
        levels: st.levels.slice(), played: st.played.slice(), gates: st.gates.slice(),
        round: ctx.round, kittySize: 8, history: history.concat(plays), buriedKnown: [],
        trickNo: t,
      });
      let cards = null;
      try {
        const r = i === 0 ? ais[s].lead(v) : ais[s].follow(v, plays.map(p => ({ seat: p.seat, cards: p.cards.map(c => ({ suit: c.suit, rank: c.rank, id: c.id })) })));
        if (r && !Array.isArray(r) && r.cards) r = r.cards;
        if (Array.isArray(r)) cards = r;
      } catch (e) { fallbacks[s]++; }
      const handIds = new Set(hands[s].map(c => c.id));
      const sane = cards && cards.length > 0 && cards.every(c => c && handIds.has(c.id)) &&
        new Set(cards.map(c => c.id)).size === cards.length;
      if (i === 0) {
        let cls = sane ? E.classify(cards, trump) : null;
        if (!cls) {
          violations[s]++; penalize(s, 5);
          if (process.env.DBG_VIOL) console.log('VIOL lead seat', s, JSON.stringify(cards && cards.map(c => c && [c.suit, c.rank])));
          cards = [lowestCard(hands[s], trump)]; cls = E.classify(cards, trump);
        } else if (cls.type === 'throw') {
          const chk = E.checkThrow(hands, s, cards, trump);
          if (!chk.ok) { cards = chk.forced.cards.slice(); cls = E.classify(cards, trump); }
        }
        plays.push({ seat: s, cards });
        lastLeadSize = cards.length;
        for (const c of cards) removeFromHand(hands[s], c);
      } else {
        // 规则书洞:按 §S3 伪码无解的局面(甩牌 vs 多对),宽松口径接受、不计罚
        const hole = sane && cards && E.followSpecImpossible(hands[s], leadCls, trump) &&
          E.isLegalFollowRelaxed(hands[s], leadCls, cards, trump);
        const legal = (sane && E.isLegalFollow(hands[s], leadCls, cards, trump)) || hole;
        if (!legal) {
          if (cards) {
            violations[s]++; penalize(s, cards.length * 5);
            if (process.env.DBG_VIOL) console.log('VIOL follow seat', s, 'lead', JSON.stringify(leadCls && leadCls.type), JSON.stringify(plays[0].cards.map(c => [c.suit, c.rank])), 'trump', JSON.stringify(trump), 'chosen', JSON.stringify(cards.map(c => c && [c.suit, c.rank])), 'hand', JSON.stringify(hands[s].map(c => [c.suit, c.rank])));
          }
          else { fallbacks[s]++; penalize(s, leadCls.cards.length * 5); }
          cards = M.forceLegalFollow(hands[s], leadCls, trump);
        }
        plays.push({ seat: s, cards });
        for (const c of cards) removeFromHand(hands[s], c);
      }
    }
    const res = E.resolveTrick(plays, trump);
    pts[res.winner % 2] += res.pts;
    lastWinnerTeam = res.winner % 2;
    history.push(...plays);
    leader = res.winner;
  }
  for (let s = 0; s < 4; s++)
    if (hands[s].length !== 0) throw new Error(`手牌没有同步出空: seat ${s} 剩 ${hands[s].length} 张`);

  // ---- 结算 ----
  const defWonLast = lastWinnerTeam === defTeam;
  // 罚分口径:犯规方是庄家方 → 加进闲家得分;犯规方是闲家 → 从闲家得分里扣。
  let defTotal = pts[defTeam] + penTeam[1 - defTeam] - penTeam[defTeam];
  if (defTotal < 0) defTotal = 0;
  if (defTotal > 200) defTotal = 200;
  const scAdj = E.scoreRound(defTotal, buried, defWonLast, lastLeadSize);

  return { sc: scAdj, defTotal, declSeat, defTeam, buriedPts: E.countPts(buried),
    violations, fallbacks, penTeam, lastLeadSize, defWonLast };
}

function penalizeFactory(defTeam, penTeam) {
  return (s, p) => { penTeam[s % 2 === defTeam ? defTeam : 1 - defTeam] += p; };
}
function lowestCard(hand, trump) {
  let b = hand[0];
  for (const c of hand) if (E.ordIdx(c, trump) < E.ordIdx(b, trump)) b = c;
  return b;
}
function removeFromHand(hand, c) {
  for (let i = 0; i < hand.length; i++) if (hand[i].id === c.id) { hand.splice(i, 1); return; }
}

/* ===== 整场 ===== */
/* aiFactories: [f0,f1,f2,f3]; seats 0,2 用 factoryA,1,3 用 factoryB(由调用方排) */
function playMatch(ais, seed, maxRounds) {
  const rnd = mulberry32(seed);
  const st = { levels: [2, 2], played: [-1, -1], gates: GATES.slice() };
  let dealer = -1, dealerKnown = false, firstTaker = cutForFirst(rnd);
  const stats = { rounds: [], violations: [0, 0, 0, 0], fallbacks: [0, 0, 0, 0], pen: [0, 0], roundsCount: 0 };
  for (let round = 0; round < (maxRounds || 60); round++) {
    const r = playRound(ais, st, rnd, {
      dealerKnown, dealer, firstTaker, round, levels: st.levels, played: st.played, gates: st.gates,
    });
    stats.roundsCount++;
    stats.rounds.push(r);
    for (let s = 0; s < 4; s++) { stats.violations[s] += r.violations[s]; stats.fallbacks[s] += r.fallbacks[s]; }
    stats.pen[0] += r.penTeam[0]; stats.pen[1] += r.penTeam[1];
    const adv = E.advanceMatch(st.levels, r.declSeat, r.sc, st.gates, st.played);
    if (adv.over) { stats.winner = adv.winnerTeam; break; }
    dealer = adv.dealer; dealerKnown = true;
  }
  stats.finalLevels = st.levels.slice();
  if (stats.winner === undefined) stats.winner = -1;
  return stats;
}

module.exports = { mulberry32, shuffle, playRound, playMatch, cutForFirst, GATES };
