'use strict';

const E = require('./engine');

const FEATURES = Object.freeze({
  smartDiscard: true,
  discardPairPenalty: 35,
  discardTrumpPenalty: 90,
  protectPairsOnLead: true,
  riskLeadPolicy: true,
  riskLeadBase: 10,
  riskLeadRisk: 5,
  riskLeadLen: 7,
  riskLeadSuitLen: -2,
  riskLeadTop: -1,
  riskLeadTrump: 5,
  riskLeadPair: 5,
  riskLeadTractor: 0,
  riskLeadThrow: 0,
  riskLeadDefEarlyMulti: -12,
  riskLeadPoints: 0,
  riskLeadKnownVoid: 0,
  riskLeadOpponentNoTrumpVoidBonus: 0,
  riskLeadOpponentNoTrumpVoidRole: 'all',
  riskLeadPartnerVoid: 0,
  riskLeadPartnerVoidSafeOnly: false,
  riskLeadPartnerReturn: 0,
  riskLeadSelfContinue: 0,
  riskLeadDefMiddleMidSingle: 0,
  riskLeadDefThresholdBonus: 0,
  riskLeadDeclThresholdPenalty: 0,
  riskLeadAllowSplitPairs: false,
  riskLeadSplitPairPenalty: 10,
  takeWhenNeeded: true,
  feedPartnerPoints: true,
  protectPairsOnSingleFeed: false,
  preservePairBeforePointFeed: true,
  preserveTractorBeforePointFeed: false,
  cashHighSideSingles: true,
  singleThreatOrdering: false,
  singleThreatRole: 'all',
  singleThreatPhase: 'all',
  cashHighSidePairs: false,
  preferShortSuitCash: false,
  preferDeclarationSupport: false,
  avoidPartnerDeclarationOverride: false,
  avoidBigJokerDeclaration: false,
  cashDeclarerBossPoints: true,
  cashDeclarerBossPhase: 'all',
  cashDefenderBossPoints: false,
  cashDefenderBossPhase: 'all',
  cashDefenderBossMinPoints: 0,
  cashDefenderBossThreshold: false,
  cashDeclarerPointThreatLimit: 0,
  cashBossUseBuriedKnown: false,
  cashBossKnownVoidMode: 'none',
  cashBossPointsFirst: false,
  cashBossShortSuitFirst: false,
  voidOnDiscard: false,
  discardVoidPointBudget: 0,
  voidFiveSingletonOnDiscard: false,
  voidFiveShortSuitOnDiscard: false,
  strongDiscardPairProtection: false,
  avoidSplitPairOnDiscardBoundary: false,
  delaySingleUntil20: false,
  delaySingleUntil8: false,
  delaySingleUntil4: false,
  conserveTrumpOnEmptyTrick: false,
  conserveTrumpOnEmptyRole: 'all',
  conserveTrumpOnEmptyPosition: 'all',
  declarerDrawTrumpEarly: true,
  declarerRiskComboOverDraw: false,
  declarerDrawTrumpFive: false,
  declarerDrawTrumpTwo: false,
  avoidKnownOpponentVoidLead: false,
  declarerForceKnownVoid: false,
  takePairsWhenNeeded: true,
  feedPartnerPairs: false,
  takeTractorsWhenNeeded: false,
  takeTractorsLast: false,
  takeThrowsLast: true,
  takeThrowsProvenThird: false,
  takeTractorsProvenThird: false,
  cashTractors: true,
  leadBossSidePairs: false,
  leadSafeBossPairsEarly: false,
  preferSideTractors: false,
  capTractorLengthTwo: false,
  leadPartnerVoidSuit: false,
  leadBestPair: true,
  conservePairOnEmptyTrick: false,
  declarerPreferTrumpPairs: false,
  defenderDelayPairsEarly: true,
  defenderAllowControlledPairsEarly: false,
  defenderEarlyPairThreatLimit: 0,
  declarerDelayPairsEarly: false,
  declarerDelayPairsMiddle: false,
  leadLongLowSingletonOverPair: false,
  longLowSingletonRole: 'all',
  defenderDelayPairsThree: false,
  defenderDelayPairsEight: false,
  preferCombosOverEarlyDraw: false,
  defenderDuckMidSinglesEarly: false,
  defenderDuckMidSinglesMiddle: false,
  defenderPreferShortSuitMiddle: false,
  defenderAvoidMidTrumpLead: false,
  feedPartnerMultiLast: true,
  feedPartnerMultiProvenThird: true,
  feedPartnerThrowProvenThird: true,
  feedPartnerBossPairThird: true,
  feedPartnerBossThrowThird: true,
  feedPartnerBossTractorThird: false,
  feedPartnerTractorAlwaysThird: true,
  feedPartnerTractorAlwaysThirdRole: 'all',
  feedPartnerTractorMinGain: 5,
  feedPartnerTractorAvoidKnownVoid: false,
  feedPartnerPairOneThreatThird: false,
  feedPartnerThrowOneThreatThird: false,
  feedPartnerExactThrowThird: false,
  feedPartnerThrowAlwaysThird: false,
  feedPartnerThrowAlwaysThirdRole: 'all',
  feedPartnerThrowMinGain: 0,
  feedPartnerPairAlwaysThird: true,
  cautiousPartnerFeed: false,
  rebelOnlyBoth: false,
  rebelRejectPts15Only: false,
  avoidFeedKnownVoid: false,
  avoidFeedKnownVoidRole: 'all',
  avoidFeedKnownVoidMinPoints: 0,
  pairThreatOrdering: false,
  leadPointPairsFirst: false,
  leadProvenThrow: true,
  preferTractorOverProvenThrow: false,
  allowKnownVoidSideThrow: true,
  avoidDefenderKnownVoidMiddleThrow: false,
  takeWithPointsLast: true,
  takeWithPointsSecond: true,
  takeWithPointsSecondRole: 'defender',
  takeWithPointsSecondTrick: 'empty',
  takeWithPointsSecondMinPoints: 0,
  takeWithPointsSecondMaxPoints: 10,
  conserveThresholdPointsLast: false,
  takePairsWithPointsLast: false,
  takePairsWithPointsSecond: false,
  takePairsWithPointsSecondRole: 'defender',
  takePairsWithPointsSecondTrick: 'empty',
  takeThrowsWithPointsLast: true,
  takeWithPointsProvenThird: false,
  takeWithPointsBossThird: false,
  preservePairBeforePointTake: false,
  preservePairPointTakePosition: 'all',
  protectPairsOnSecondPointTakeTie: false,
  allowOneThreatThrow: false,
  avoidLateSideThrow: false,
  preferTrumpThrow: false,
  limitThrowComponentsTwo: false,
});

function byId(a, b) {
  return a.id - b.id;
}

function groupCards(cards) {
  const groups = new Map();
  for (const card of cards) {
    const key = `${card.suit}:${card.rank}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  for (const group of groups.values()) group.sort(byId);
  return groups;
}

function knownVoidsFromHistory(history, trump) {
  const knownVoids = [new Set(), new Set(), new Set(), new Set()];
  for (let i = 0; i + 3 < history.length; i += 4) {
    const trick = history.slice(i, i + 4);
    const led = E.classify(trick[0].cards, trump);
    if (!led) continue;
    for (let j = 1; j < 4; j += 1) {
      if (trick[j].cards.every((card) => E.effSuit(card, trump) !== led.suit)) {
        knownVoids[trick[j].seat].add(led.suit);
      }
    }
  }
  return knownVoids;
}

function pairThreatCount(card, view) {
  const known = new Map();
  const cards = view.hand.concat(view.history.flatMap((item) => item.cards),
    view.buriedKnown || []);
  for (const item of cards) {
    const key = `${item.suit}:${item.rank}`;
    known.set(key, (known.get(key) || 0) + 1);
  }
  const effectiveSuit = E.effSuit(card, view.trump);
  const order = E.ordIdx(card, view.trump);
  let threats = 0;
  for (const suit of E.SUITS) {
    for (let rank = 2; rank <= 14; rank += 1) {
      const probe = { suit, rank };
      if (E.effSuit(probe, view.trump) !== effectiveSuit ||
          E.ordIdx(probe, view.trump) <= order) continue;
      if ((known.get(`${suit}:${rank}`) || 0) === 0) threats += 1;
    }
  }
  for (const rank of [15, 16]) {
    const probe = { suit: 'X', rank };
    if (E.effSuit(probe, view.trump) === effectiveSuit &&
        E.ordIdx(probe, view.trump) > order &&
        (known.get(`X:${rank}`) || 0) === 0) threats += 1;
  }
  return threats;
}

function unknownCardsOfSuit(view, suit) {
  const knownIds = new Set(view.hand.map((card) => card.id));
  for (const play of view.history) {
    for (const card of play.cards) knownIds.add(card.id);
  }
  for (const card of view.buriedKnown || []) knownIds.add(card.id);
  return E.makeDeck().filter((card) =>
    E.effSuit(card, view.trump) === suit && !knownIds.has(card.id));
}

function componentThreatCount(unknown, comp, trump) {
  if (comp.type === 'single') {
    return unknown.filter((card) => E.ordIdx(card, trump) > comp.top).length;
  }
  if (comp.type === 'pair') {
    return [...groupCards(unknown).values()].filter((group) =>
      group.length >= 2 && E.ordIdx(group[0], trump) > comp.top).length;
  }
  return E.decompose(unknown, trump).filter((candidate) =>
    candidate.type === 'tractor' && candidate.len >= comp.len && candidate.top > comp.top).length;
}

function singleThreatCount(card, view) {
  const suit = E.effSuit(card, view.trump);
  const top = E.ordIdx(card, view.trump);
  return unknownCardsOfSuit(view, suit)
    .filter((unknown) => E.ordIdx(unknown, view.trump) > top).length;
}

function useSingleThreatOrdering(view, features) {
  if (!features.singleThreatOrdering) return false;
  const role = view.myTeam === view.declSeat % 2 ? 'declarer' : 'defender';
  const phase = view.trickNo < 5 ? 'early' : view.trickNo < 15 ? 'middle' : 'late';
  return (features.singleThreatRole === 'all' || features.singleThreatRole === role) &&
    (features.singleThreatPhase === 'all' || features.singleThreatPhase === phase);
}

function pointLeadThreatCount(card, view, includeBuriedKnown) {
  const seen = view.hand.concat(view.history.flatMap((item) => item.cards),
    includeBuriedKnown ? (view.buriedKnown || []) : []);
  const top = E.ordIdx(card, view.trump);
  let threats = 0;
  for (let rank = 2; rank <= 14; rank += 1) {
    const probe = { suit: card.suit, rank };
    if (E.effSuit(probe, view.trump) !== card.suit ||
        E.ordIdx(probe, view.trump) <= top) continue;
    const known = seen.filter((item) => item.suit === card.suit && item.rank === rank).length;
    threats += Math.max(0, 2 - known);
  }
  return threats;
}

function declarationOptions(hand, trumpRank) {
  const options = [];
  for (const suit of E.SUITS) {
    const n = hand.filter((card) => card.suit === suit && card.rank === trumpRank).length;
    if (n >= 1) options.push({ suit, strength: 1 });
    if (n >= 2) options.push({ suit, strength: 2 });
  }
  const small = hand.filter((card) => card.suit === 'X' && card.rank === 15).length;
  const big = hand.filter((card) => card.suit === 'X' && card.rank === 16).length;
  if (small >= 2) options.push({ suit: null, strength: 3 });
  if (big >= 2) options.push({ suit: null, strength: 4 });
  return options;
}

function chooseDeclaration(view, features = FEATURES) {
  const options = declarationOptions(view.hand, view.trumpRank)
    .filter(() => !features.avoidPartnerDeclarationOverride || !view.curDecl ||
      view.curDecl.seat === view.seat || view.curDecl.seat % 2 !== view.myTeam)
    .filter((option) => !features.avoidBigJokerDeclaration || option.strength !== 4)
    .filter((option) => !features.delaySingleUntil20 || option.strength !== 1 || view.hand.length >= 20)
    .filter((option) => !features.delaySingleUntil8 || option.strength !== 1 || view.hand.length >= 8)
    .filter((option) => !features.delaySingleUntil4 || option.strength !== 1 || view.hand.length >= 4)
    .filter((option) => E.cardsForDeclaration(view.hand, view.trumpRank, option))
    .filter((option) => E.canOverride(
      view.curDecl,
      option,
      view.seat,
      view.rebelHappened,
    ));
  if (options.length === 0) return null;
  const suitSupport = (option) => option.suit === null ? 0 : view.hand.filter((card) =>
    card.suit === option.suit && card.rank !== view.trumpRank).length;
  options.sort((a, b) => b.strength - a.strength ||
    (features.preferDeclarationSupport ? suitSupport(b) - suitSupport(a) : 0) ||
    String(a.suit).localeCompare(String(b.suit)));
  return options[0];
}

function discardCost(card, trump, groups, features) {
  let cost = E.ordIdx(card, trump);
  if (E.cardPoints(card)) cost += 120 + E.cardPoints(card);
  if (E.effSuit(card, trump) === 'T') cost += features.discardTrumpPenalty;
  if (features.smartDiscard && groups.get(`${card.suit}:${card.rank}`).length >= 2) {
    cost += features.strongDiscardPairProtection ? 90 : features.discardPairPenalty;
  }
  return cost;
}

function chooseDiscard(view, features = FEATURES) {
  const groups = groupCards(view.hand);
  const sorted = view.hand.slice().sort((a, b) =>
    discardCost(a, view.trump, groups, features) - discardCost(b, view.trump, groups, features) ||
    byId(a, b));
  const target = view.kittySize || 8;
  if (features.discardVoidPointBudget > 0) {
    const base = sorted.slice(0, target);
    const sideSuits = E.SUITS.map((suit) => ({
      suit,
      cards: view.hand.filter((card) => E.effSuit(card, view.trump) === suit),
    }));
    function describe(cards) {
      const ids = new Set(cards.map((card) => card.id));
      let splitPairs = 0;
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        const buried = group.filter((card) => ids.has(card.id)).length;
        if (buried === 1) splitPairs += 1;
      }
      return {
        cards,
        voids: sideSuits.filter((item) => item.cards.length > 0 &&
          item.cards.every((card) => ids.has(card.id))).length,
        points: E.countPoints(cards),
        trumps: cards.filter((card) => E.effSuit(card, view.trump) === 'T').length,
        splitPairs,
        cost: cards.reduce((sum, card) => sum + discardCost(card, view.trump, groups, features), 0),
      };
    }
    const baseDescription = describe(base);
    let best = baseDescription;
    for (let mask = 1; mask < (1 << sideSuits.length); mask += 1) {
      const selected = [];
      for (let i = 0; i < sideSuits.length; i += 1) {
        if (mask & (1 << i)) selected.push(...sideSuits[i].cards);
      }
      if (selected.length > target || E.countPoints(selected) > features.discardVoidPointBudget) continue;
      const ids = new Set(selected.map((card) => card.id));
      for (const card of sorted) {
        if (selected.length >= target) break;
        if (!ids.has(card.id)) {
          selected.push(card);
          ids.add(card.id);
        }
      }
      if (selected.length !== target) continue;
      const candidate = describe(selected);
      if (candidate.voids > best.voids ||
          (candidate.voids === best.voids && candidate.points < best.points) ||
          (candidate.voids === best.voids && candidate.points === best.points &&
            candidate.trumps < best.trumps) ||
          (candidate.voids === best.voids && candidate.points === best.points &&
            candidate.trumps === best.trumps && candidate.splitPairs < best.splitPairs) ||
          (candidate.voids === best.voids && candidate.points === best.points &&
            candidate.trumps === best.trumps && candidate.splitPairs === best.splitPairs &&
            candidate.cost < best.cost)) best = candidate;
    }
    if (best.voids > baseDescription.voids) return best.cards.slice();
  }
  if (features.voidFiveSingletonOnDiscard) {
    const bySuit = new Map();
    for (const card of view.hand) {
      const suit = E.effSuit(card, view.trump);
      if (suit === 'T') continue;
      if (!bySuit.has(suit)) bySuit.set(suit, []);
      bySuit.get(suit).push(card);
    }
    const fiveSingletons = [...bySuit.values()]
      .filter((cards) => cards.length === 1 && E.cardPoints(cards[0]) === 5)
      .map((cards) => cards[0])
      .sort((a, b) => E.ordIdx(a, view.trump) - E.ordIdx(b, view.trump) || byId(a, b));
    if (fiveSingletons.length > 0) {
      const selected = [fiveSingletons[0]];
      const selectedIds = new Set(selected.map((card) => card.id));
      for (const card of sorted) {
        if (selected.length >= target) break;
        if (!selectedIds.has(card.id)) {
          selected.push(card);
          selectedIds.add(card.id);
        }
      }
      return selected;
    }
  }
  if (features.voidFiveShortSuitOnDiscard) {
    const bySuit = new Map();
    for (const card of view.hand) {
      const suit = E.effSuit(card, view.trump);
      if (suit === 'T') continue;
      if (!bySuit.has(suit)) bySuit.set(suit, []);
      bySuit.get(suit).push(card);
    }
    const shortSuits = [...bySuit.values()].filter((cards) =>
      cards.length <= 2 && E.countPoints(cards) === 5)
      .sort((a, b) => a.length - b.length ||
        a.reduce((sum, card) => sum + E.ordIdx(card, view.trump), 0) -
          b.reduce((sum, card) => sum + E.ordIdx(card, view.trump), 0));
    if (shortSuits.length > 0) {
      const selected = shortSuits[0].slice();
      const selectedIds = new Set(selected.map((card) => card.id));
      for (const card of sorted) {
        if (selected.length >= target) break;
        if (!selectedIds.has(card.id)) {
          selected.push(card);
          selectedIds.add(card.id);
        }
      }
      return selected;
    }
  }
  if (features.avoidSplitPairOnDiscardBoundary) {
    let selected = sorted.slice(0, target);
    while (true) {
      const selectedIds = new Set(selected.map((card) => card.id));
      const selectedCounts = new Map();
      for (const card of selected) {
        const key = `${card.suit}:${card.rank}`;
        selectedCounts.set(key, (selectedCounts.get(key) || 0) + 1);
      }
      const splitCards = selected.filter((card) =>
        groups.get(`${card.suit}:${card.rank}`).length >= 2 &&
        selectedCounts.get(`${card.suit}:${card.rank}`) === 1 &&
        E.cardPoints(card) === 0 && E.effSuit(card, view.trump) !== 'T');
      const replacements = sorted.filter((card) => !selectedIds.has(card.id) &&
        groups.get(`${card.suit}:${card.rank}`).length === 1 &&
        E.cardPoints(card) === 0 && E.effSuit(card, view.trump) !== 'T');
      if (splitCards.length === 0) break;
      let best = null;
      for (const removed of splitCards) {
        for (const added of replacements) {
          const delta = discardCost(added, view.trump, groups, features) -
            discardCost(removed, view.trump, groups, features);
          if (!best || delta < best.delta ||
              (delta === best.delta && added.id < best.added.id)) {
            best = { removed, added, delta };
          }
        }
        const mate = sorted.find((card) => !selectedIds.has(card.id) &&
          card.suit === removed.suit && card.rank === removed.rank);
        if (mate) {
          const recoverable = selected.filter((card) =>
            groups.get(`${card.suit}:${card.rank}`).length === 1 &&
            E.cardPoints(card) === 0 && E.effSuit(card, view.trump) !== 'T');
          for (const recovered of recoverable) {
            const delta = discardCost(mate, view.trump, groups, features) -
              discardCost(recovered, view.trump, groups, features);
            if (!best || delta < best.delta ||
                (delta === best.delta && mate.id < best.added.id)) {
              best = { removed: recovered, added: mate, delta };
            }
          }
        }
      }
      if (!best) break;
      selected = selected.filter((card) => card.id !== best.removed.id);
      selected.push(best.added);
    }
    return selected;
  }
  if (!features.voidOnDiscard) return sorted.slice(0, target);

  const bySuit = new Map();
  for (const card of view.hand) {
    const suit = E.effSuit(card, view.trump);
    if (suit === 'T') continue;
    if (!bySuit.has(suit)) bySuit.set(suit, []);
    bySuit.get(suit).push(card);
  }
  const voidable = [...bySuit.values()].filter((suitCards) =>
    suitCards.length <= target && suitCards.every((card) => E.cardPoints(card) === 0));
  let best = [];
  for (let mask = 1; mask < (1 << voidable.length); mask += 1) {
    const chosen = [];
    let voids = 0;
    for (let i = 0; i < voidable.length; i += 1) {
      if (mask & (1 << i)) {
        chosen.push(...voidable[i]);
        voids += 1;
      }
    }
    if (chosen.length > target) continue;
    if (voids > (best.voids || 0) ||
        (voids === (best.voids || 0) && chosen.length > (best.cards || []).length)) {
      best = { voids, cards: chosen };
    }
  }
  const selected = best.cards ? best.cards.slice() : [];
  const selectedIds = new Set(selected.map((card) => card.id));
  for (const card of sorted) {
    if (selected.length >= target) break;
    if (!selectedIds.has(card.id)) {
      selected.push(card);
      selectedIds.add(card.id);
    }
  }
  return selected;
}

function playCost(card, trump, groups, features) {
  let cost = E.ordIdx(card, trump);
  if (E.cardPoints(card)) cost += 40 + E.cardPoints(card);
  if (E.effSuit(card, trump) === 'T') cost += 30;
  if (features.protectPairsOnLead && groups.get(`${card.suit}:${card.rank}`).length >= 2) cost += 18;
  return cost;
}

function chooseRiskLead(view, features) {
  const baseFeatures = Object.assign({}, features, { riskLeadPolicy: false });
  const baseCards = chooseLead(view, baseFeatures);
  const actions = new Map();
  function add(cards, isBase = false, splitPair = false) {
    if (!cards || cards.length === 0) return;
    const key = cards.map((card) => card.id).sort((a, b) => a - b).join(',');
    if (!actions.has(key)) actions.set(key, { cards: cards.slice(), isBase, splitPair });
    else {
      if (isBase) actions.get(key).isBase = true;
      if (!splitPair) actions.get(key).splitPair = false;
    }
  }
  add(baseCards, true);
  const cardGroups = groupCards(view.hand);
  for (const group of cardGroups.values()) {
    if (group.length === 1) add([group[0]]);
    if (group.length >= 2) {
      add(group.slice(0, 2));
      if (features.riskLeadAllowSplitPairs) add([group[0]], false, true);
    }
  }
  const bySuit = new Map();
  for (const card of view.hand) {
    const suit = E.effSuit(card, view.trump);
    if (!bySuit.has(suit)) bySuit.set(suit, []);
    bySuit.get(suit).push(card);
  }
  for (const suitCards of bySuit.values()) {
    for (const comp of E.decompose(suitCards, view.trump)) {
      if (comp.type === 'tractor') add(comp.cards);
    }
  }
  const voids = knownVoidsFromHistory(view.history, view.trump);
  const defenderPoints = (features.riskLeadDefThresholdBonus ||
    features.riskLeadDeclThresholdPenalty) ? defenderPointsFromHistory(view) : 0;
  let partnerReturnSuit = null;
  let selfContinueSuit = null;
  if (view.history.length >= 4) {
    const priorLead = view.history[view.history.length - 4];
    const priorClass = E.classify(priorLead.cards, view.trump);
    if (priorClass) {
      if (priorLead.seat === view.seat) selfContinueSuit = priorClass.suit;
      else if (priorLead.seat % 2 === view.myTeam) partnerReturnSuit = priorClass.suit;
    }
  }
  for (const action of actions.values()) {
    const play = E.classify(action.cards, view.trump);
    const unknown = unknownCardsOfSuit(view, play.suit);
    const threats = play.type === 'throw' ? play.comps.reduce((sum, comp) =>
      sum + componentThreatCount(unknown, comp, view.trump), 0) :
      componentThreatCount(unknown, play, view.trump);
    const suitLen = bySuit.get(play.suit).length;
    const role = view.myTeam === view.declSeat % 2 ? 'declarer' : 'defender';
    const knownVoidOpponents = play.suit === 'T' ? 0 : [1, 3].filter((offset) =>
      voids[(view.seat + offset) % 4].has(play.suit)).length;
    const harmlessVoidOpponents = play.suit === 'T' ? 0 : [1, 3].filter((offset) => {
      const seatVoids = voids[(view.seat + offset) % 4];
      return seatVoids.has(play.suit) && seatVoids.has('T');
    }).length;
    const partnerKnownVoid = play.suit !== 'T' &&
      voids[(view.seat + 2) % 4].has(play.suit);
    const actionPoints = E.countPoints(action.cards);
    const crossesThreshold = actionPoints > 0 && scoreOutcomeKey(defenderPoints) !==
      scoreOutcomeKey(defenderPoints + actionPoints);
    action.play = play;
    action.score = (action.isBase ? features.riskLeadBase : 0) -
      features.riskLeadRisk * Math.log2(1 + threats) +
      features.riskLeadLen * (action.cards.length - 1) +
      features.riskLeadSuitLen * suitLen + features.riskLeadTop * play.top +
      (play.suit === 'T' ? features.riskLeadTrump : 0) +
      (play.type === 'pair' ? features.riskLeadPair : 0) +
      (play.type === 'tractor' ? features.riskLeadTractor : 0) +
      (play.type === 'throw' ? features.riskLeadThrow : 0) +
      features.riskLeadPoints * E.countPoints(action.cards) -
      features.riskLeadKnownVoid * knownVoidOpponents +
      (features.riskLeadOpponentNoTrumpVoidRole === 'all' ||
        features.riskLeadOpponentNoTrumpVoidRole === role ?
        features.riskLeadOpponentNoTrumpVoidBonus * harmlessVoidOpponents : 0) +
      (partnerKnownVoid && (!features.riskLeadPartnerVoidSafeOnly ||
        knownVoidOpponents === 0) ? features.riskLeadPartnerVoid : 0) +
      (partnerReturnSuit !== null && play.suit === partnerReturnSuit ?
        features.riskLeadPartnerReturn : 0) +
      (selfContinueSuit !== null && play.suit === selfContinueSuit ?
        features.riskLeadSelfContinue : 0) +
      (role === 'defender' && view.trickNo >= 5 && view.trickNo < 15 &&
        play.suit !== 'T' && play.type === 'single' && play.top > 4 && play.top <= 9 ?
        -features.riskLeadDefMiddleMidSingle : 0) +
      (role === 'defender' && crossesThreshold ? features.riskLeadDefThresholdBonus : 0) +
      (role === 'declarer' && crossesThreshold ? -features.riskLeadDeclThresholdPenalty : 0) +
      (action.splitPair ? -features.riskLeadSplitPairPenalty : 0) +
      (role === 'defender' && view.trickNo < 5 && action.cards.length > 1 ?
        features.riskLeadDefEarlyMulti : 0);
  }
  return [...actions.values()].sort((a, b) => b.score - a.score ||
    b.cards.length - a.cards.length || b.play.top - a.play.top ||
    byId(a.cards[0], b.cards[0]))[0].cards.slice();
}

function chooseLead(view, features = FEATURES) {
  if (features.riskLeadPolicy) return chooseRiskLead(view, features);
  const groups = groupCards(view.hand);
  const hasTractorForLead = E.SUITS.concat('T').some((suit) =>
    E.decompose(view.hand.filter((card) => E.effSuit(card, view.trump) === suit), view.trump)
      .some((comp) => comp.type === 'tractor'));
  const drawTrumpLimit = features.declarerDrawTrumpFive ? 5 :
    (features.declarerDrawTrumpTwo ? 2 : 3);
  const hasPairForLead = [...groups.values()].some((group) => group.length >= 2);
  if (features.declarerDrawTrumpEarly && view.myTeam === view.declSeat % 2 &&
      view.trickNo < drawTrumpLimit &&
      (!features.preferCombosOverEarlyDraw || !hasPairForLead)) {
    const drawCards = view.hand.filter((card) =>
      E.effSuit(card, view.trump) === 'T' && E.cardPoints(card) === 0 &&
      groups.get(`${card.suit}:${card.rank}`).length === 1);
    if (drawCards.length > 0) {
      drawCards.sort((a, b) => E.ordIdx(a, view.trump) - E.ordIdx(b, view.trump) || byId(a, b));
      if (features.declarerRiskComboOverDraw) {
        const bySuit = new Map();
        for (const card of view.hand) {
          const suit = E.effSuit(card, view.trump);
          if (!bySuit.has(suit)) bySuit.set(suit, []);
          bySuit.get(suit).push(card);
        }
        const candidates = [];
        for (const group of groups.values()) {
          if (group.length >= 2) candidates.push(group.slice(0, 2));
        }
        for (const suitCards of bySuit.values()) {
          for (const comp of E.decompose(suitCards, view.trump)) {
            if (comp.type === 'tractor') candidates.push(comp.cards);
          }
        }
        function riskScore(cards, isBase) {
          const play = E.classify(cards, view.trump);
          const unknown = unknownCardsOfSuit(view, play.suit);
          const threats = componentThreatCount(unknown, play, view.trump);
          const suitLen = bySuit.get(play.suit).length;
          return (isBase ? 10 : 0) - 5 * Math.log2(1 + threats) +
            7 * (cards.length - 1) - 2 * suitLen - play.top +
            (play.suit === 'T' ? 5 : 0) + (play.type === 'pair' ? 5 : 0);
        }
        const baseScore = riskScore([drawCards[0]], true);
        const better = candidates.map((cards) => ({ cards, score: riskScore(cards, false) }))
          .filter((candidate) => candidate.score > baseScore)
          .sort((a, b) => b.score - a.score || b.cards.length - a.cards.length ||
            byId(a.cards[0], b.cards[0]));
        if (better.length > 0) return better[0].cards.slice();
      }
      return [drawCards[0]];
    }
  }
  if (features.leadProvenThrow &&
      !(features.preferTractorOverProvenThrow && hasTractorForLead)) {
    const bySuit = new Map();
    for (const card of view.hand) {
      const suit = E.effSuit(card, view.trump);
      if (!bySuit.has(suit)) bySuit.set(suit, []);
      bySuit.get(suit).push(card);
    }
    const knownVoids = knownVoidsFromHistory(view.history, view.trump);
    const throws = [];
    for (const [suit, suitCards] of bySuit) {
      if (features.avoidLateSideThrow && suit !== 'T' && view.trickNo >= 15) continue;
      const opponentKnownVoid = suit !== 'T' && [1, 3].some((offset) =>
        knownVoids[(view.seat + offset) % 4].has(suit));
      if (opponentKnownVoid && (!features.allowKnownVoidSideThrow ||
          (features.avoidDefenderKnownVoidMiddleThrow &&
            view.myTeam !== view.declSeat % 2 && view.trickNo >= 5 && view.trickNo < 15))) continue;
      const unknown = unknownCardsOfSuit(view, suit);
      const components = E.decompose(suitCards, view.trump);
      const safe = components.filter((comp) => !E.canBeatComp(unknown, comp, view.trump));
      let selected = safe.slice();
      if (features.limitThrowComponentsTwo && selected.length > 2) {
        selected = selected.slice().sort((a, b) => b.top - a.top).slice(0, 2);
      }
      if (features.allowOneThreatThrow) {
        const nearSafe = components.filter((comp) => !safe.includes(comp) &&
          componentThreatCount(unknown, comp, view.trump) === 1)
          .sort((a, b) => b.top - a.top);
        if (nearSafe.length > 0) selected.push(nearSafe[0]);
      }
      if (selected.length < 2) continue;
      const cards = selected.flatMap((comp) => comp.cards);
      const play = E.classify(cards, view.trump);
      if (play && play.type === 'throw') throws.push(play);
    }
    if (throws.length > 0) {
      throws.sort((a, b) => (features.preferTrumpThrow ?
        ((b.suit === 'T' ? 1 : 0) - (a.suit === 'T' ? 1 : 0)) : 0) ||
        b.cards.length - a.cards.length || b.top - a.top ||
        byId(a.cards[0], b.cards[0]));
      return throws[0].cards.slice();
    }
  }
  const bossPhase = view.trickNo < 5 ? 'early' : view.trickNo < 15 ? 'middle' : 'late';
  if ((features.cashDeclarerBossPoints && view.myTeam === view.declSeat % 2 &&
       (features.cashDeclarerBossPhase === 'all' ||
        features.cashDeclarerBossPhase === bossPhase)) ||
      ((features.cashDefenderBossPoints || features.cashDefenderBossThreshold) &&
        view.myTeam !== view.declSeat % 2 &&
        (features.cashDefenderBossPhase === 'all' ||
          features.cashDefenderBossPhase === bossPhase ||
          (features.cashDefenderBossPhase === 'afterEarly' && view.trickNo >= 5)))) {
    const candidates = view.hand.filter((card) =>
      E.effSuit(card, view.trump) !== 'T' && E.cardPoints(card) > 0 &&
      groups.get(`${card.suit}:${card.rank}`).length === 1);
    let bosses = candidates.filter((candidate) =>
      pointLeadThreatCount(candidate, view, features.cashBossUseBuriedKnown) <=
        features.cashDeclarerPointThreatLimit);
    if (view.myTeam !== view.declSeat % 2) {
      bosses = bosses.filter((candidate) =>
        E.cardPoints(candidate) >= features.cashDefenderBossMinPoints);
    }
    if (features.cashBossKnownVoidMode !== 'none') {
      const knownVoids = knownVoidsFromHistory(view.history, view.trump);
      bosses = bosses.filter((candidate) => {
        const suit = E.effSuit(candidate, view.trump);
        const nextVoid = knownVoids[(view.seat + 1) % 4].has(suit);
        const lastVoid = knownVoids[(view.seat + 3) % 4].has(suit);
        if (features.cashBossKnownVoidMode === 'next') return !nextVoid;
        if (features.cashBossKnownVoidMode === 'last') return !lastVoid;
        return !nextVoid && !lastVoid;
      });
    }
    if (features.cashDefenderBossThreshold && !features.cashDefenderBossPoints &&
        view.myTeam !== view.declSeat % 2) {
      const currentPoints = defenderPointsFromHistory(view);
      bosses = bosses.filter((candidate) => scoreOutcomeKey(currentPoints) !==
        scoreOutcomeKey(currentPoints + E.cardPoints(candidate)));
    }
    if (bosses.length > 0) {
      bosses.sort((a, b) =>
        (features.cashBossPointsFirst ? E.cardPoints(b) - E.cardPoints(a) : 0) ||
        (features.cashBossShortSuitFirst ?
          (view.hand.filter((card) => E.effSuit(card, view.trump) ===
            E.effSuit(a, view.trump)).length -
           view.hand.filter((card) => E.effSuit(card, view.trump) ===
            E.effSuit(b, view.trump)).length) : 0) ||
        E.ordIdx(b, view.trump) - E.ordIdx(a, view.trump) || byId(a, b));
      return [bosses[0]];
    }
  }
  if (features.cashTractors) {
    const bySuit = new Map();
    for (const card of view.hand) {
      const suit = E.effSuit(card, view.trump);
      if (!bySuit.has(suit)) bySuit.set(suit, []);
      bySuit.get(suit).push(card);
    }
    const tractors = [];
    for (const suitCards of bySuit.values()) {
      tractors.push(...E.decompose(suitCards, view.trump)
        .filter((comp) => comp.type === 'tractor'));
    }
    if (tractors.length > 0) {
      tractors.sort((a, b) =>
        (features.preferSideTractors ?
          ((E.effSuit(a.cards[0], view.trump) === 'T' ? 1 : 0) -
            (E.effSuit(b.cards[0], view.trump) === 'T' ? 1 : 0)) : 0) ||
        b.len - a.len || b.top - a.top || byId(a.cards[0], b.cards[0]));
      const chosenTractor = tractors[0];
      if (features.capTractorLengthTwo && chosenTractor.len > 2) {
        return chosenTractor.cards.slice((chosenTractor.len - 2) * 2);
      }
      return chosenTractor.cards.slice();
    }
  }
  if (features.leadBossSidePairs || (features.leadSafeBossPairsEarly && view.trickNo < 5)) {
    const bossPairs = [...groups.values()].filter((group) => {
      if (group.length < 2 || E.effSuit(group[0], view.trump) === 'T') return false;
      if (features.leadSafeBossPairsEarly && !features.leadBossSidePairs &&
          E.cardPoints(group[0]) > 0) return false;
      const suit = group[0].suit;
      let maxSideOrder = -1;
      for (let rank = 2; rank <= 14; rank += 1) {
        const probe = { suit, rank };
        if (E.effSuit(probe, view.trump) === suit) {
          maxSideOrder = Math.max(maxSideOrder, E.ordIdx(probe, view.trump));
        }
      }
      return E.ordIdx(group[0], view.trump) === maxSideOrder;
    });
    if (bossPairs.length > 0) {
      bossPairs.sort((a, b) => E.cardPoints(b[0]) - E.cardPoints(a[0]) ||
        E.ordIdx(b[0], view.trump) - E.ordIdx(a[0], view.trump) || byId(a[0], b[0]));
      return bossPairs[0].slice(0, 2);
    }
  }
  const defenderPairDelay = features.defenderDelayPairsThree ? 3 :
    (features.defenderDelayPairsEight ? 8 : 5);
  if (features.leadBestPair && features.defenderDelayPairsEarly &&
      features.defenderAllowControlledPairsEarly &&
      view.myTeam !== view.declSeat % 2 && view.trickNo < defenderPairDelay) {
    const controlledPairs = [...groups.values()].filter((group) => group.length >= 2 &&
      pairThreatCount(group[0], view) <= features.defenderEarlyPairThreatLimit);
    if (controlledPairs.length > 0) {
      controlledPairs.sort((a, b) =>
        E.ordIdx(b[0], view.trump) - E.ordIdx(a[0], view.trump) || byId(a[0], b[0]));
      return controlledPairs[0].slice(0, 2);
    }
  }
  if (features.leadBestPair && !(features.defenderDelayPairsEarly &&
      view.myTeam !== view.declSeat % 2 && view.trickNo < defenderPairDelay) &&
      !(features.declarerDelayPairsEarly && view.myTeam === view.declSeat % 2 &&
        view.trickNo < 5) &&
      !(features.declarerDelayPairsMiddle && view.myTeam === view.declSeat % 2 &&
        view.trickNo >= 5 && view.trickNo < 15)) {
    const pairs = [...groups.values()].filter((group) => group.length >= 2);
    if (pairs.length > 0) {
      pairs.sort((a, b) =>
        (features.pairThreatOrdering ? pairThreatCount(a[0], view) -
          pairThreatCount(b[0], view) : 0) ||
        (features.leadPointPairsFirst ? E.cardPoints(b[0]) - E.cardPoints(a[0]) : 0) ||
        (features.declarerPreferTrumpPairs && view.myTeam === view.declSeat % 2 ?
          ((E.effSuit(b[0], view.trump) === 'T' ? 1 : 0) -
            (E.effSuit(a[0], view.trump) === 'T' ? 1 : 0)) : 0) ||
        E.ordIdx(b[0], view.trump) - E.ordIdx(a[0], view.trump) ||
        byId(a[0], b[0]));
      const role = view.myTeam === view.declSeat % 2 ? 'declarer' : 'defender';
      if (features.leadLongLowSingletonOverPair &&
          (features.longLowSingletonRole === 'all' ||
            features.longLowSingletonRole === role)) {
        const suitLengths = new Map();
        for (const card of view.hand) {
          const suit = E.effSuit(card, view.trump);
          suitLengths.set(suit, (suitLengths.get(suit) || 0) + 1);
        }
        const pair = pairs[0];
        const pairSuit = E.effSuit(pair[0], view.trump);
        const pairScore = 12 - E.ordIdx(pair[0], view.trump) + suitLengths.get(pairSuit);
        const singletons = view.hand.filter((card) =>
          groups.get(`${card.suit}:${card.rank}`).length === 1)
          .map((card) => ({
            card,
            score: suitLengths.get(E.effSuit(card, view.trump)) - E.ordIdx(card, view.trump),
          }))
          .sort((a, b) => b.score - a.score || byId(a.card, b.card));
        if (singletons.length > 0 && singletons[0].score > pairScore) {
          return [singletons[0].card];
        }
      }
      return pairs[0].slice(0, 2);
    }
  }
  if (features.cashHighSidePairs) {
    const pairGroups = [...groups.values()].filter((group) =>
      group.length >= 2 && E.effSuit(group[0], view.trump) !== 'T' &&
      E.cardPoints(group[0]) === 0 && E.ordIdx(group[0], view.trump) >= 8);
    if (pairGroups.length > 0) {
      pairGroups.sort((a, b) => E.ordIdx(b[0], view.trump) - E.ordIdx(a[0], view.trump) ||
        byId(a[0], b[0]));
      return pairGroups[0].slice(0, 2);
    }
  }
  if (features.cashHighSideSingles) {
    let cashable = view.hand.filter((card) =>
      E.effSuit(card, view.trump) !== 'T' && E.cardPoints(card) === 0 &&
      groups.get(`${card.suit}:${card.rank}`).length === 1);
    if ((features.avoidKnownOpponentVoidLead || features.declarerForceKnownVoid ||
        features.leadPartnerVoidSuit) &&
        cashable.length > 1) {
      const knownVoids = knownVoidsFromHistory(view.history, view.trump);
      if (features.leadPartnerVoidSuit) {
        const partnerSuit = cashable.filter((card) =>
          knownVoids[(view.seat + 2) % 4].has(E.effSuit(card, view.trump)));
        if (partnerSuit.length > 0) cashable = partnerSuit;
      } else if (features.declarerForceKnownVoid && view.myTeam === view.declSeat % 2) {
        const forcing = cashable.filter((card) => {
          const suit = E.effSuit(card, view.trump);
          return [1, 3].some((offset) => knownVoids[(view.seat + offset) % 4].has(suit));
        });
        if (forcing.length > 0) cashable = forcing;
      } else if (features.avoidKnownOpponentVoidLead) {
        const safe = cashable.filter((card) => {
          const suit = E.effSuit(card, view.trump);
          return [1, 3].every((offset) => !knownVoids[(view.seat + offset) % 4].has(suit));
        });
        if (safe.length > 0) cashable = safe;
      }
    }
    if (cashable.length > 0) {
      const suitCounts = new Map();
      for (const card of view.hand) {
        const suit = E.effSuit(card, view.trump);
        if (suit !== 'T') suitCounts.set(suit, (suitCounts.get(suit) || 0) + 1);
      }
      cashable.sort((a, b) =>
        ((features.preferShortSuitCash ||
          (features.defenderPreferShortSuitMiddle && view.myTeam !== view.declSeat % 2 &&
            view.trickNo >= 5 && view.trickNo < 15)) ?
          (suitCounts.get(a.suit) - suitCounts.get(b.suit)) : 0) ||
        (useSingleThreatOrdering(view, features) ? singleThreatCount(a, view) -
          singleThreatCount(b, view) : 0) ||
        E.ordIdx(b, view.trump) - E.ordIdx(a, view.trump) || byId(a, b));
      if (features.defenderDuckMidSinglesEarly && view.myTeam !== view.declSeat % 2 &&
          view.trickNo < 5 && E.ordIdx(cashable[0], view.trump) <= 9) {
        cashable.sort((a, b) => E.ordIdx(a, view.trump) - E.ordIdx(b, view.trump) || byId(a, b));
      }
      if (features.defenderDuckMidSinglesMiddle && view.myTeam !== view.declSeat % 2 &&
          view.trickNo >= 5 && view.trickNo < 15 &&
          E.ordIdx(cashable[0], view.trump) <= 9) {
        cashable.sort((a, b) => E.ordIdx(a, view.trump) - E.ordIdx(b, view.trump) || byId(a, b));
      }
      return [cashable[0]];
    }
  }
  const sorted = view.hand.slice().sort((a, b) =>
    playCost(a, view.trump, groups, features) - playCost(b, view.trump, groups, features) ||
    byId(a, b));
  if (features.defenderAvoidMidTrumpLead && view.myTeam !== view.declSeat % 2 &&
      view.trickNo >= 5 && view.trickNo < 15 &&
      E.effSuit(sorted[0], view.trump) === 'T') {
    const sideSingles = view.hand.filter((card) =>
      E.effSuit(card, view.trump) !== 'T' &&
      groups.get(`${card.suit}:${card.rank}`).length === 1)
      .sort((a, b) => E.cardPoints(a) - E.cardPoints(b) ||
        E.ordIdx(a, view.trump) - E.ordIdx(b, view.trump) || byId(a, b));
    if (sideSingles.length > 0) return [sideSingles[0]];
  }
  return [sorted[0]];
}

function addCards(selected, selectedIds, cards) {
  for (const card of cards) {
    if (!selectedIds.has(card.id)) {
      selected.push(card);
      selectedIds.add(card.id);
    }
  }
}

function lowCardOrder(a, b, trump) {
  const at = E.effSuit(a, trump) === 'T' ? 1 : 0;
  const bt = E.effSuit(b, trump) === 'T' ? 1 : 0;
  return E.cardPoints(a) - E.cardPoints(b) || at - bt ||
    E.ordIdx(a, trump) - E.ordIdx(b, trump) || byId(a, b);
}

function chooseLegalFollow(hand, leadInput, trump, rules = E.DEFAULT_RULES) {
  const lead = Array.isArray(leadInput) ? E.classify(leadInput, trump) : leadInput;
  const n = lead.cards.length;
  const suitCards = hand.filter((card) => E.effSuit(card, trump) === lead.suit);
  const selected = [];
  const selectedIds = new Set();

  if (suitCards.length <= n) {
    addCards(selected, selectedIds, suitCards);
    const rest = hand.filter((card) => !selectedIds.has(card.id))
      .sort((a, b) => lowCardOrder(a, b, trump));
    addCards(selected, selectedIds, rest.slice(0, n - selected.length));
    return selected;
  }

  if (rules.strictTractorFollow !== false && lead.type === 'tractor') {
    const tractors = E.decompose(suitCards, trump)
      .filter((comp) => comp.type === 'tractor')
      .sort((a, b) => b.len - a.len || a.top - b.top);
    const longest = tractors.length ? tractors[0].len : 0;
    let required = 0;
    if (longest >= lead.len) required = lead.len;
    else if (rules.partialTractorFollow !== false && longest >= 2) required = longest;
    if (required > 0) {
      const source = tractors.find((comp) => comp.len >= required);
      addCards(selected, selectedIds, source.cards.slice(0, required * 2));
    }
  }

  const mustPairs = Math.min(E.pairNeed(lead), E.countPairsIn(suitCards));
  const groups = [...groupCards(suitCards).values()]
    .filter((group) => group.length >= 2)
    .sort((a, b) => lowCardOrder(a[0], b[0], trump));
  for (const group of groups) {
    if (E.countPairsIn(selected) >= mustPairs) break;
    if (selected.length + 2 <= n) addCards(selected, selectedIds, group.slice(0, 2));
  }

  const rest = suitCards.filter((card) => !selectedIds.has(card.id))
    .sort((a, b) => lowCardOrder(a, b, trump));
  addCards(selected, selectedIds, rest.slice(0, n - selected.length));

  if (!E.isLegalFollow(hand, lead, selected, trump, rules)) {
    // This path should be unreachable for a valid lead. Keeping a conservative
    // fallback prevents an exception from turning a recoverable hand into a penalty.
    return suitCards.slice(0, n);
  }
  return selected;
}

function chooseHighPointLegalFollow(hand, leadInput, trump, rules = E.DEFAULT_RULES) {
  const lead = Array.isArray(leadInput) ? E.classify(leadInput, trump) : leadInput;
  const n = lead.cards.length;
  const suitCards = hand.filter((card) => E.effSuit(card, trump) === lead.suit);
  const selected = [];
  const selectedIds = new Set();
  const highPointOrder = (a, b) => E.cardPoints(b) - E.cardPoints(a) ||
    lowCardOrder(a, b, trump);

  if (suitCards.length <= n) {
    addCards(selected, selectedIds, suitCards);
    const rest = hand.filter((card) => !selectedIds.has(card.id)).sort(highPointOrder);
    addCards(selected, selectedIds, rest.slice(0, n - selected.length));
    return selected;
  }

  if (rules.strictTractorFollow !== false && lead.type === 'tractor') {
    const tractors = E.decompose(suitCards, trump)
      .filter((comp) => comp.type === 'tractor');
    const longest = tractors.reduce((value, comp) => Math.max(value, comp.len), 0);
    let required = 0;
    if (longest >= lead.len) required = lead.len;
    else if (rules.partialTractorFollow !== false && longest >= 2) required = longest;
    if (required > 0) {
      const windows = [];
      for (const comp of tractors) {
        if (comp.len < required) continue;
        for (let start = 0; start + required <= comp.len; start += 1) {
          windows.push(comp.cards.slice(start * 2, (start + required) * 2));
        }
      }
      windows.sort((a, b) => E.countPoints(b) - E.countPoints(a) ||
        E.ordIdx(a[0], trump) - E.ordIdx(b[0], trump) || byId(a[0], b[0]));
      if (windows.length > 0) addCards(selected, selectedIds, windows[0]);
    }
  }

  const mustPairs = Math.min(E.pairNeed(lead), E.countPairsIn(suitCards));
  const groups = [...groupCards(suitCards).values()]
    .filter((group) => group.length >= 2 && !selectedIds.has(group[0].id))
    .sort((a, b) => E.countPoints(b.slice(0, 2)) - E.countPoints(a.slice(0, 2)) ||
      lowCardOrder(a[0], b[0], trump));
  for (const group of groups) {
    if (E.countPairsIn(selected) >= mustPairs) break;
    if (selected.length + 2 <= n) addCards(selected, selectedIds, group.slice(0, 2));
  }

  const rest = suitCards.filter((card) => !selectedIds.has(card.id)).sort(highPointOrder);
  addCards(selected, selectedIds, rest.slice(0, n - selected.length));
  return E.isLegalFollow(hand, lead, selected, trump, rules) ? selected :
    chooseLegalFollow(hand, lead, trump, rules);
}

function partialWinner(plays, trump) {
  const lead = E.classify(plays[0].cards, trump);
  if (!lead) return plays[0].seat;
  const structure = E.structureKey(lead);
  let best = lead;
  let winner = plays[0].seat;
  for (let i = 1; i < plays.length; i += 1) {
    const candidate = E.classify(plays[i].cards, trump);
    if (!candidate || E.structureKey(candidate) !== structure) continue;
    if (candidate.suit === best.suit) {
      if (candidate.top > best.top) {
        best = candidate;
        winner = plays[i].seat;
      }
    } else if (candidate.suit === 'T') {
      best = candidate;
      winner = plays[i].seat;
    }
  }
  return winner;
}

function defenderPointsFromHistory(view) {
  const completedLength = view.history.length - (view.history.length % 4);
  let points = 0;
  for (let i = 0; i < completedLength; i += 4) {
    const trick = view.history.slice(i, i + 4);
    const resolved = E.resolveTrick(trick, view.trump);
    if (resolved.winner % 2 !== view.declSeat % 2) points += resolved.points;
  }
  return points;
}

function scoreOutcomeKey(points) {
  const score = E.scoreRound(Math.max(0, Math.min(200, points)), [], false, 1);
  return `${score.declarerWon ? 'D' : 'F'}:${score.up}`;
}

function useTakeWithPointsSecond(view, plays, features) {
  if (!features.takeWithPointsSecond || plays.length !== 1) return false;
  const role = view.myTeam === view.declSeat % 2 ? 'declarer' : 'defender';
  const trick = E.countPoints(plays[0].cards) > 0 ? 'points' : 'empty';
  return (features.takeWithPointsSecondRole === 'all' ||
      features.takeWithPointsSecondRole === role) &&
    (features.takeWithPointsSecondTrick === 'all' ||
      features.takeWithPointsSecondTrick === trick);
}

function usePreservePairPointTake(plays, features) {
  if (!features.preservePairBeforePointTake) return false;
  const position = plays.length === 3 ? 'last' : plays.length === 1 ? 'second' : 'other';
  return features.preservePairPointTakePosition === 'all' ||
    features.preservePairPointTakePosition === position;
}

function unknownCanBeatCurrent(plays, view, allowThrow = false, allowSingle = false) {
  const winner = partialWinner(plays, view.trump);
  const winningPlay = plays.find((item) => item.seat === winner);
  const winningClass = winningPlay && E.classify(winningPlay.cards, view.trump);
  if (!winningClass || (winningClass.type !== 'pair' && winningClass.type !== 'tractor' &&
      !(allowThrow && winningClass.type === 'throw') &&
      !(allowSingle && winningClass.type === 'single'))) {
    return true;
  }
  const knownIds = new Set(view.hand.map((card) => card.id));
  for (const item of view.history) {
    for (const card of item.cards) knownIds.add(card.id);
  }
  for (const card of view.buriedKnown || []) knownIds.add(card.id);
  const unknown = E.makeDeck().filter((card) => !knownIds.has(card.id));
  const components = winningClass.type === 'throw' ? winningClass.comps : [winningClass];
  const sameSuit = unknown.filter((card) =>
    E.effSuit(card, view.trump) === winningClass.suit);
  if (components.some((comp) => E.canBeatComp(sameSuit, comp, view.trump))) return true;
  if (winningClass.suit !== 'T') {
    const trumps = unknown.filter((card) => E.effSuit(card, view.trump) === 'T');
    if (components.some((comp) =>
      E.canBeatComp(trumps, Object.assign({}, comp, { top: -1 }), view.trump))) return true;
  }
  return false;
}

function unknownSameSuitCanBeatCurrent(plays, view) {
  const winner = partialWinner(plays, view.trump);
  const winningPlay = plays.find((item) => item.seat === winner);
  const winningClass = winningPlay && E.classify(winningPlay.cards, view.trump);
  if (!winningClass) return true;
  const unknown = unknownCardsOfSuit(view, winningClass.suit);
  const components = winningClass.type === 'throw' ? winningClass.comps : [winningClass];
  return components.some((comp) => E.canBeatComp(unknown, comp, view.trump));
}

function sameSuitThreatCountCurrent(plays, view) {
  const winner = partialWinner(plays, view.trump);
  const winningPlay = plays.find((item) => item.seat === winner);
  const winningClass = winningPlay && E.classify(winningPlay.cards, view.trump);
  if (!winningClass) return Infinity;
  const unknown = unknownCardsOfSuit(view, winningClass.suit);
  const components = winningClass.type === 'throw' ? winningClass.comps : [winningClass];
  return components.reduce((sum, comp) =>
    sum + componentThreatCount(unknown, comp, view.trump), 0);
}

function unknownCanBuildBeatingThrowExact(plays, view) {
  const winner = partialWinner(plays, view.trump);
  const winningPlay = plays.find((item) => item.seat === winner);
  const winningClass = winningPlay && E.classify(winningPlay.cards, view.trump);
  if (!winningClass || winningClass.type !== 'throw') return true;
  const unknown = unknownCardsOfSuit(view, winningClass.suit);
  const groups = [...groupCards(unknown).values()];
  const remaining = Array(groups.length + 1).fill(0);
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    remaining[i] = remaining[i + 1] + groups[i].length;
  }
  const n = winningClass.cards.length;
  const structure = E.structureKey(winningClass);
  let leaves = 0;
  let found = false;
  function visit(index, selected) {
    if (found || selected.length > n || selected.length + remaining[index] < n) return;
    if (selected.length === n) {
      leaves += 1;
      if (leaves > 12000) {
        found = true;
        return;
      }
      const candidate = E.classify(selected, view.trump);
      if (candidate && E.structureKey(candidate) === structure &&
          candidate.top > winningClass.top) found = true;
      return;
    }
    if (index >= groups.length) return;
    const group = groups[index];
    if (group.length >= 2 && selected.length + 2 <= n) {
      visit(index + 1, selected.concat(group.slice(0, 2)));
    }
    if (selected.length + 1 <= n) visit(index + 1, selected.concat(group[0]));
    visit(index + 1, selected);
  }
  visit(0, []);
  return found;
}

function chooseWinningThrowFollow(view, plays, preferPoints = false) {
  const lead = E.classify(plays[0].cards, view.trump);
  if (!lead || lead.type !== 'throw') return null;
  const n = lead.cards.length;
  const inSuit = view.hand.filter((card) => E.effSuit(card, view.trump) === lead.suit);
  let source;
  if (inSuit.length >= n) source = inSuit;
  else if (inSuit.length === 0 && lead.suit !== 'T') {
    source = view.hand.filter((card) => E.effSuit(card, view.trump) === 'T');
    if (source.length < n) return null;
  } else return null;

  const groups = [...groupCards(source).values()].sort((a, b) =>
    E.ordIdx(b[0], view.trump) - E.ordIdx(a[0], view.trump) || byId(a[0], b[0]));
  const remaining = Array(groups.length + 1).fill(0);
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    remaining[i] = remaining[i + 1] + groups[i].length;
  }
  let leaves = 0;
  let best = null;
  let bestCost = Infinity;
  function visit(index, selected) {
    if (leaves >= 12000 || selected.length > n ||
        selected.length + remaining[index] < n) return;
    if (selected.length === n) {
      leaves += 1;
      const play = E.classify(selected, view.trump);
      if (!play || E.structureKey(play) !== E.structureKey(lead) ||
          !E.isLegalFollow(view.hand, lead, selected, view.trump, E.DEFAULT_RULES) ||
          partialWinner([...plays, { seat: view.seat, cards: selected }], view.trump) !==
            view.seat) return;
      const cost = selected.reduce((sum, card) => sum + E.ordIdx(card, view.trump) +
        E.cardPoints(card) * (preferPoints ? -100 : 2) +
        (E.effSuit(card, view.trump) === 'T' ? 12 : 0), 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = selected.slice();
      }
      return;
    }
    if (index >= groups.length) return;
    const group = groups[index];
    if (group.length >= 2 && selected.length + 2 <= n) {
      visit(index + 1, selected.concat(group.slice(0, 2)));
    }
    if (selected.length + 1 <= n) visit(index + 1, selected.concat(group[0]));
    visit(index + 1, selected);
  }
  visit(0, []);
  return best;
}

function chooseTacticalFollow(view, plays, features = FEATURES) {
  const lead = E.classify(plays[0].cards, view.trump);
  const low = chooseLegalFollow(view.hand, lead, view.trump, E.DEFAULT_RULES);
  if (!features.takeWhenNeeded) return low;
  const winner = partialWinner(plays, view.trump);
  if (features.feedPartnerMultiLast && lead.cards.length > 1 && plays.length === 3 &&
      winner % 2 === view.myTeam) {
    return chooseHighPointLegalFollow(view.hand, lead, view.trump, E.DEFAULT_RULES);
  }
  if (features.feedPartnerMultiProvenThird && lead.cards.length > 1 && plays.length === 2 &&
      winner % 2 === view.myTeam &&
      !unknownCanBeatCurrent(plays, view, features.feedPartnerThrowProvenThird)) {
    return chooseHighPointLegalFollow(view.hand, lead, view.trump, E.DEFAULT_RULES);
  }
  if (features.feedPartnerBossPairThird && lead.type === 'pair' && plays.length === 2 &&
      winner % 2 === view.myTeam && !unknownSameSuitCanBeatCurrent(plays, view)) {
    const knownVoids = knownVoidsFromHistory(view.history, view.trump);
    const lastSeat = (view.seat + 1) % 4;
    if (lead.suit === 'T' || !knownVoids[lastSeat].has(lead.suit)) {
      return chooseHighPointLegalFollow(view.hand, lead, view.trump, E.DEFAULT_RULES);
    }
  }
  if (features.feedPartnerPairOneThreatThird && lead.type === 'pair' && plays.length === 2 &&
      winner % 2 === view.myTeam && sameSuitThreatCountCurrent(plays, view) <= 1) {
    const knownVoids = knownVoidsFromHistory(view.history, view.trump);
    const lastSeat = (view.seat + 1) % 4;
    if (lead.suit === 'T' || !knownVoids[lastSeat].has(lead.suit)) {
      return chooseHighPointLegalFollow(view.hand, lead, view.trump, E.DEFAULT_RULES);
    }
  }
  if (features.feedPartnerPairAlwaysThird && lead.type === 'pair' && plays.length === 2 &&
      winner % 2 === view.myTeam) {
    return chooseHighPointLegalFollow(view.hand, lead, view.trump, E.DEFAULT_RULES);
  }
  if (features.feedPartnerBossThrowThird && lead.type === 'throw' && plays.length === 2 &&
      winner % 2 === view.myTeam && !unknownSameSuitCanBeatCurrent(plays, view)) {
    const knownVoids = knownVoidsFromHistory(view.history, view.trump);
    const lastSeat = (view.seat + 1) % 4;
    if (lead.suit === 'T' || !knownVoids[lastSeat].has(lead.suit)) {
      return chooseHighPointLegalFollow(view.hand, lead, view.trump, E.DEFAULT_RULES);
    }
  }
  if (features.feedPartnerExactThrowThird && lead.type === 'throw' && plays.length === 2 &&
      winner % 2 === view.myTeam && !unknownCanBuildBeatingThrowExact(plays, view)) {
    const knownVoids = knownVoidsFromHistory(view.history, view.trump);
    const lastSeat = (view.seat + 1) % 4;
    if (lead.suit === 'T' || !knownVoids[lastSeat].has(lead.suit)) {
      return chooseHighPointLegalFollow(view.hand, lead, view.trump, E.DEFAULT_RULES);
    }
  }
  if (features.feedPartnerThrowAlwaysThird && lead.type === 'throw' && plays.length === 2 &&
      winner % 2 === view.myTeam &&
      (features.feedPartnerThrowAlwaysThirdRole === 'all' ||
        features.feedPartnerThrowAlwaysThirdRole ===
          (view.myTeam === view.declSeat % 2 ? 'declarer' : 'defender'))) {
    const high = chooseHighPointLegalFollow(view.hand, lead, view.trump, E.DEFAULT_RULES);
    if (E.countPoints(high) - E.countPoints(low) >= features.feedPartnerThrowMinGain) {
      return high;
    }
  }
  if (features.feedPartnerThrowOneThreatThird && lead.type === 'throw' && plays.length === 2 &&
      winner % 2 === view.myTeam && sameSuitThreatCountCurrent(plays, view) <= 1) {
    const knownVoids = knownVoidsFromHistory(view.history, view.trump);
    const lastSeat = (view.seat + 1) % 4;
    if (lead.suit === 'T' || !knownVoids[lastSeat].has(lead.suit)) {
      return chooseHighPointLegalFollow(view.hand, lead, view.trump, E.DEFAULT_RULES);
    }
  }
  if (features.feedPartnerTractorAlwaysThird && lead.type === 'tractor' &&
      plays.length === 2 && winner % 2 === view.myTeam &&
      (features.feedPartnerTractorAlwaysThirdRole === 'all' ||
        features.feedPartnerTractorAlwaysThirdRole ===
          (view.myTeam === view.declSeat % 2 ? 'declarer' : 'defender'))) {
    const high = chooseHighPointLegalFollow(view.hand, lead, view.trump, E.DEFAULT_RULES);
    if (E.countPoints(high) - E.countPoints(low) >= features.feedPartnerTractorMinGain) {
      if (features.feedPartnerTractorAvoidKnownVoid && lead.suit !== 'T' &&
          knownVoidsFromHistory(view.history, view.trump)[(view.seat + 1) % 4]
            .has(lead.suit)) return low;
      return high;
    }
  }
  if (features.feedPartnerBossTractorThird && lead.type === 'tractor' && plays.length === 2 &&
      winner % 2 === view.myTeam && !unknownSameSuitCanBeatCurrent(plays, view)) {
    const knownVoids = knownVoidsFromHistory(view.history, view.trump);
    const lastSeat = (view.seat + 1) % 4;
    if (lead.suit === 'T' || !knownVoids[lastSeat].has(lead.suit)) {
      return chooseHighPointLegalFollow(view.hand, lead, view.trump, E.DEFAULT_RULES);
    }
  }
  if (lead.type === 'throw' && winner % 2 !== view.myTeam &&
      ((features.takeThrowsLast && plays.length === 3) ||
       (features.takeThrowsProvenThird && plays.length === 2))) {
    const winningThrow = chooseWinningThrowFollow(view, plays,
      features.takeThrowsWithPointsLast && plays.length === 3);
    if (winningThrow && (plays.length === 3 ||
        !unknownCanBeatCurrent([...plays, { seat: view.seat, cards: winningThrow }],
          view, true))) return winningThrow;
  }
  if (features.feedPartnerPairs && lead.type === 'pair' &&
      winner % 2 === view.myTeam) {
    const pointPairs = [...groupCards(view.hand).values()]
      .filter((group) => group.length >= 2 && E.cardPoints(group[0]) > 0)
      .map((group) => group.slice(0, 2))
      .filter((choice) => E.isLegalFollow(view.hand, lead, choice, view.trump, E.DEFAULT_RULES));
    if (pointPairs.length > 0) {
      pointPairs.sort((a, b) =>
        E.countPoints(b) - E.countPoints(a) ||
        (E.effSuit(a[0], view.trump) === 'T' ? 1 : 0) -
          (E.effSuit(b[0], view.trump) === 'T' ? 1 : 0) ||
        E.ordIdx(a[0], view.trump) - E.ordIdx(b[0], view.trump) || byId(a[0], b[0]));
      return pointPairs[0];
    }
  }
  if (features.takePairsWhenNeeded && lead.type === 'pair' &&
      winner % 2 !== view.myTeam) {
    if (features.conservePairOnEmptyTrick && plays.length < 3 &&
        plays.every((item) => E.countPoints(item.cards) === 0)) return low;
    const pairChoices = [...groupCards(view.hand).values()]
      .filter((group) => group.length >= 2)
      .map((group) => group.slice(0, 2))
      .filter((choice) => E.isLegalFollow(view.hand, lead, choice, view.trump, E.DEFAULT_RULES))
      .filter((choice) => partialWinner([...plays, { seat: view.seat, cards: choice }],
        view.trump) === view.seat);
    if (pairChoices.length > 0) {
      const pairPointRole = view.myTeam === view.declSeat % 2 ? 'declarer' : 'defender';
      const pairPointTrick = plays.some((item) => E.countPoints(item.cards) > 0) ?
        'points' : 'empty';
      const takePairPointsSecond = features.takePairsWithPointsSecond && plays.length === 1 &&
        (features.takePairsWithPointsSecondRole === 'all' ||
          features.takePairsWithPointsSecondRole === pairPointRole) &&
        (features.takePairsWithPointsSecondTrick === 'all' ||
          features.takePairsWithPointsSecondTrick === pairPointTrick);
      pairChoices.sort((a, b) =>
        ((features.takePairsWithPointsLast && plays.length === 3) || takePairPointsSecond ?
          E.countPoints(b) - E.countPoints(a) : E.countPoints(a) - E.countPoints(b)) ||
        (E.effSuit(a[0], view.trump) === 'T' ? 1 : 0) -
          (E.effSuit(b[0], view.trump) === 'T' ? 1 : 0) ||
        E.ordIdx(a[0], view.trump) - E.ordIdx(b[0], view.trump) || byId(a[0], b[0]));
      return pairChoices[0];
    }
  }
  if ((features.takeTractorsWhenNeeded || (features.takeTractorsLast && plays.length === 3) ||
      (features.takeTractorsProvenThird && plays.length === 2)) &&
      lead.type === 'tractor' &&
      winner % 2 !== view.myTeam) {
    const bySuit = new Map();
    for (const card of view.hand) {
      const suit = E.effSuit(card, view.trump);
      if (!bySuit.has(suit)) bySuit.set(suit, []);
      bySuit.get(suit).push(card);
    }
    const tractorChoices = [];
    for (const suitCards of bySuit.values()) {
      for (const comp of E.decompose(suitCards, view.trump)) {
        if (comp.type !== 'tractor' || comp.len < lead.len) continue;
        for (let start = 0; start + lead.len <= comp.len; start += 1) {
          const choice = comp.cards.slice(start * 2, (start + lead.len) * 2);
          if (!E.isLegalFollow(view.hand, lead, choice, view.trump, E.DEFAULT_RULES)) continue;
          const prospective = [...plays, { seat: view.seat, cards: choice }];
          if (partialWinner(prospective, view.trump) !== view.seat) continue;
          if (features.takeTractorsProvenThird && plays.length === 2 &&
              !features.takeTractorsWhenNeeded && unknownCanBeatCurrent(prospective, view)) continue;
          tractorChoices.push(choice);
        }
      }
    }
    if (tractorChoices.length > 0) {
      tractorChoices.sort((a, b) =>
        E.countPoints(a) - E.countPoints(b) ||
        (E.effSuit(a[0], view.trump) === 'T' ? 1 : 0) -
          (E.effSuit(b[0], view.trump) === 'T' ? 1 : 0) ||
        E.ordIdx(a[a.length - 1], view.trump) -
          E.ordIdx(b[b.length - 1], view.trump) || byId(a[0], b[0]));
      return tractorChoices[0];
    }
  }
  if (lead.cards.length !== 1) return low;
  const inSuit = view.hand.filter((card) => E.effSuit(card, view.trump) === lead.suit);
  const legalPool = inSuit.length ? inSuit : view.hand;
  if (winner % 2 === view.myTeam) {
    if (!features.feedPartnerPoints) return low;
    const pointCards = legalPool.filter((card) => E.cardPoints(card) > 0);
    if (pointCards.length === 0) return low;
    const feedRole = view.myTeam === view.declSeat % 2 ? 'declarer' : 'defender';
    if (features.avoidFeedKnownVoid && plays.length < 3 &&
        (features.avoidFeedKnownVoidRole === 'all' ||
          features.avoidFeedKnownVoidRole === feedRole) &&
        Math.max(...pointCards.map((card) => E.cardPoints(card))) >=
          features.avoidFeedKnownVoidMinPoints) {
      const knownVoids = knownVoidsFromHistory(view.history, view.trump);
      const remaining = 3 - plays.length;
      for (let offset = 1; offset <= remaining; offset += 1) {
        const seat = (view.seat + offset) % 4;
        if (seat % 2 !== view.myTeam && knownVoids[seat].has(lead.suit)) return low;
      }
    }
    if (features.cautiousPartnerFeed && plays.length < 3) {
      const winningPlay = plays.find((item) => item.seat === winner);
      const winningClass = winningPlay && E.classify(winningPlay.cards, view.trump);
      let maxOrder = lead.suit === 'T' ? 15 : -1;
      if (lead.suit !== 'T') {
        for (let rank = 2; rank <= 14; rank += 1) {
          const probe = { suit: lead.suit, rank };
          if (E.effSuit(probe, view.trump) === lead.suit) {
            maxOrder = Math.max(maxOrder, E.ordIdx(probe, view.trump));
          }
        }
      }
      if (!winningClass || winningClass.top < maxOrder) return low;
    }
    const pointGroups = groupCards(view.hand);
    const tractorFeedIds = new Set();
    if (features.preserveTractorBeforePointFeed) {
      const bySuit = new Map();
      for (const card of view.hand) {
        const suit = E.effSuit(card, view.trump);
        if (!bySuit.has(suit)) bySuit.set(suit, []);
        bySuit.get(suit).push(card);
      }
      for (const suitCards of bySuit.values()) {
        for (const comp of E.decompose(suitCards, view.trump)) {
          if (comp.type === 'tractor') {
            for (const card of comp.cards) tractorFeedIds.add(card.id);
          }
        }
      }
    }
    pointCards.sort((a, b) =>
      (features.preservePairBeforePointFeed ?
        ((pointGroups.get(`${a.suit}:${a.rank}`).length >= 2 ? 1 : 0) -
          (pointGroups.get(`${b.suit}:${b.rank}`).length >= 2 ? 1 : 0)) : 0) ||
      (features.preserveTractorBeforePointFeed ?
        ((tractorFeedIds.has(a.id) ? 1 : 0) - (tractorFeedIds.has(b.id) ? 1 : 0)) : 0) ||
      E.cardPoints(b) - E.cardPoints(a) ||
      (features.protectPairsOnSingleFeed ?
        ((pointGroups.get(`${a.suit}:${a.rank}`).length >= 2 ? 1 : 0) -
          (pointGroups.get(`${b.suit}:${b.rank}`).length >= 2 ? 1 : 0)) : 0) ||
      lowCardOrder(a, b, view.trump));
    return [pointCards[0]];
  }
  const winners = legalPool.filter((card) =>
    partialWinner([...plays, { seat: view.seat, cards: [card] }], view.trump) === view.seat);
  if (winners.length === 0) return low;
  if (features.conserveTrumpOnEmptyTrick && plays.length < 3 && lead.suit !== 'T' &&
      plays.every((item) => E.countPoints(item.cards) === 0) &&
      winners.every((card) => E.effSuit(card, view.trump) === 'T')) {
    const role = view.myTeam === view.declSeat % 2 ? 'declarer' : 'defender';
    const position = plays.length === 1 ? 'second' : 'third';
    if ((features.conserveTrumpOnEmptyRole === 'all' ||
        features.conserveTrumpOnEmptyRole === role) &&
        (features.conserveTrumpOnEmptyPosition === 'all' ||
          features.conserveTrumpOnEmptyPosition === position)) return low;
  }
  if (features.takeWithPointsProvenThird && plays.length === 2) {
    const safePointWinners = winners.filter((card) => E.cardPoints(card) > 0 &&
      !unknownCanBeatCurrent([...plays, { seat: view.seat, cards: [card] }],
        view, false, true));
    if (safePointWinners.length > 0) {
      safePointWinners.sort((a, b) => E.cardPoints(b) - E.cardPoints(a) ||
        lowCardOrder(a, b, view.trump));
      return [safePointWinners[0]];
    }
  }
  if (features.takeWithPointsBossThird && plays.length === 2) {
    const knownVoids = knownVoidsFromHistory(view.history, view.trump);
    const lastSeat = (view.seat + 1) % 4;
    const bossPointWinners = winners.filter((card) => E.cardPoints(card) > 0 &&
      !unknownSameSuitCanBeatCurrent([...plays, { seat: view.seat, cards: [card] }], view) &&
      (lead.suit === 'T' || !knownVoids[lastSeat].has(lead.suit)));
    if (bossPointWinners.length > 0) {
      bossPointWinners.sort((a, b) => E.cardPoints(b) - E.cardPoints(a) ||
        lowCardOrder(a, b, view.trump));
      return [bossPointWinners[0]];
    }
  }
  const secondPointCeiling = Math.max(...winners.map((card) => E.cardPoints(card)));
  const takeSecondPoints = useTakeWithPointsSecond(view, plays, features) &&
    secondPointCeiling >= features.takeWithPointsSecondMinPoints &&
    secondPointCeiling <= features.takeWithPointsSecondMaxPoints;
  if ((features.takeWithPointsLast && plays.length === 3) || takeSecondPoints) {
    let targetPoints = Math.max(...winners.map((card) => E.cardPoints(card)));
    if (usePreservePairPointTake(plays, features)) {
      const winnerGroups = groupCards(view.hand);
      const singletonWinners = winners.filter((card) =>
        winnerGroups.get(`${card.suit}:${card.rank}`).length === 1);
      if (singletonWinners.length > 0) {
        targetPoints = Math.max(...singletonWinners.map((card) => E.cardPoints(card)));
      }
    }
    if (features.conserveThresholdPointsLast && plays.length === 3 &&
        view.myTeam !== view.declSeat % 2) {
      const tablePoints = plays.reduce((sum, item) => sum + E.countPoints(item.cards), 0);
      const basePoints = defenderPointsFromHistory(view) + tablePoints;
      const targetOutcome = scoreOutcomeKey(basePoints + targetPoints);
      const sameOutcome = winners.map((card) => E.cardPoints(card))
        .filter((points) => scoreOutcomeKey(basePoints + points) === targetOutcome);
      targetPoints = Math.min(...sameOutcome);
    }
    const winnerGroups = features.protectPairsOnSecondPointTakeTie && plays.length === 1 ?
      groupCards(view.hand) : null;
    winners.sort((a, b) =>
      Math.abs(E.cardPoints(a) - targetPoints) - Math.abs(E.cardPoints(b) - targetPoints) ||
      (winnerGroups ?
        ((winnerGroups.get(`${a.suit}:${a.rank}`).length >= 2 ? 1 : 0) -
          (winnerGroups.get(`${b.suit}:${b.rank}`).length >= 2 ? 1 : 0)) : 0) ||
      lowCardOrder(a, b, view.trump));
  } else {
    winners.sort((a, b) => lowCardOrder(a, b, view.trump));
  }
  return [winners[0]];
}

function createStrategy(featureOverrides = {}) {
  const features = Object.assign({}, FEATURES, featureOverrides);
  return {
    onDeal(view) {
      return chooseDeclaration(view, features);
    },
    onRebel(view) {
      if (features.rebelOnlyBoth) {
        return Boolean(view.rebelReason && view.rebelReason.byPts && view.rebelReason.byTrump);
      }
      if (features.rebelRejectPts15Only && view.rebelReason && view.rebelReason.byPts &&
          !view.rebelReason.byTrump && view.rebelReason.pts === 15) return false;
      return true;
    },
    discard(view) {
      return chooseDiscard(view, features);
    },
    lead(view) {
      return chooseLead(view, features);
    },
    follow(view, plays) {
      return chooseTacticalFollow(view, plays, features);
    },
  };
}

module.exports = {
  FEATURES,
  declarationOptions,
  chooseDeclaration,
  chooseDiscard,
  chooseLead,
  chooseLegalFollow,
  chooseHighPointLegalFollow,
  unknownCanBeatCurrent,
  unknownSameSuitCanBeatCurrent,
  sameSuitThreatCountCurrent,
  unknownCanBuildBeatingThrowExact,
  chooseWinningThrowFollow,
  chooseTacticalFollow,
  defenderPointsFromHistory,
  useTakeWithPointsSecond,
  usePreservePairPointTake,
  knownVoidsFromHistory,
  pairThreatCount,
  unknownCardsOfSuit,
  componentThreatCount,
  singleThreatCount,
  pointLeadThreatCount,
  createStrategy,
};
