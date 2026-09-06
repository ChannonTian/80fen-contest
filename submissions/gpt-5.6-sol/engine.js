'use strict';

const DEFAULT_RULES = Object.freeze({
  levelStart: 2,
  handSize: 25,
  kittySize: 8,
  strictTractorFollow: true,
  partialTractorFollow: true,
  pointRebelThreshold: 15,
  trumpRebelThreshold: 3,
  maxRedeal: 3,
  gates: Object.freeze([2, 5, 10, 13]),
  speedRun: false,
  speedLadder: Object.freeze([2, 5, 10, 13, 14]),
});

const SUITS = Object.freeze(['S', 'H', 'D', 'C']);

function cardPoints(card) {
  if (card.rank === 5) return 5;
  if (card.rank === 10 || card.rank === 13) return 10;
  return 0;
}

function countPoints(cards) {
  let total = 0;
  for (const card of cards) total += cardPoints(card);
  return total;
}

function makeDeck() {
  const deck = [];
  let id = 0;
  for (let copy = 0; copy < 2; copy += 1) {
    for (const suit of SUITS) {
      for (let rank = 2; rank <= 14; rank += 1) {
        deck.push({ suit, rank, id });
        id += 1;
      }
    }
    deck.push({ suit: 'X', rank: 15, id });
    id += 1;
    deck.push({ suit: 'X', rank: 16, id });
    id += 1;
  }
  return deck;
}

function effSuit(card, trump) {
  if (card.suit === 'X') return 'T';
  if (card.rank === trump.rank) return 'T';
  if (trump.suit && card.suit === trump.suit) return 'T';
  return card.suit;
}

function ordIdx(card, trump) {
  if (card.rank === 16) return 15;
  if (card.rank === 15) return 14;
  if (card.rank === trump.rank) {
    if (trump.suit === null) return 13;
    return card.suit === trump.suit ? 13 : 12;
  }
  return card.rank < trump.rank ? card.rank - 2 : card.rank - 3;
}

function groupKey(card) {
  return `${card.suit}:${card.rank}`;
}

function componentOrder(a, b) {
  if (a.top !== b.top) return a.top - b.top;
  const typeOrder = { single: 0, pair: 1, tractor: 2 };
  if (typeOrder[a.type] !== typeOrder[b.type]) {
    return typeOrder[a.type] - typeOrder[b.type];
  }
  const ac = a.cards[0];
  const bc = b.cards[0];
  if (ac.suit !== bc.suit) return String(ac.suit).localeCompare(String(bc.suit));
  if (ac.rank !== bc.rank) return ac.rank - bc.rank;
  return (ac.id ?? 0) - (bc.id ?? 0);
}

function decompose(cards, trump) {
  const groups = new Map();
  for (const card of cards) {
    const key = groupKey(card);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }

  const pairs = [];
  const singles = [];
  for (const group of groups.values()) {
    const sorted = group.slice().sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    if (sorted.length >= 2) {
      const pairCards = sorted.slice(0, 2);
      pairs.push({
        type: 'pair',
        cards: pairCards,
        top: ordIdx(pairCards[0], trump),
      });
      for (let i = 2; i < sorted.length; i += 1) {
        singles.push({ type: 'single', cards: [sorted[i]], top: ordIdx(sorted[i], trump) });
      }
    } else {
      singles.push({ type: 'single', cards: [sorted[0]], top: ordIdx(sorted[0], trump) });
    }
  }

  pairs.sort(componentOrder);
  const components = [];
  let run = [];
  function flushRun() {
    if (run.length >= 2) {
      components.push({
        type: 'tractor',
        len: run.length,
        cards: run.flatMap((pair) => pair.cards),
        top: run[run.length - 1].top,
      });
    } else if (run.length === 1) {
      components.push(run[0]);
    }
    run = [];
  }

  for (const pair of pairs) {
    if (run.length === 0 || pair.top - run[run.length - 1].top === 1) {
      run.push(pair);
    } else {
      flushRun();
      run.push(pair);
    }
  }
  flushRun();
  components.push(...singles);
  components.sort(componentOrder);
  return components;
}

function classify(cards, trump) {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  const suit = effSuit(cards[0], trump);
  for (let i = 1; i < cards.length; i += 1) {
    if (effSuit(cards[i], trump) !== suit) return null;
  }

  if (cards.length === 1) {
    return {
      type: 'single',
      suit,
      top: ordIdx(cards[0], trump),
      cards: cards.slice(),
    };
  }

  const comps = decompose(cards, trump);
  if (comps.length === 1) {
    const comp = comps[0];
    return {
      type: comp.type,
      suit,
      top: comp.top,
      cards: cards.slice(),
      ...(comp.type === 'tractor' ? { len: comp.len } : {}),
    };
  }
  return {
    type: 'throw',
    suit,
    top: Math.max(...comps.map((comp) => comp.top)),
    cards: cards.slice(),
    comps,
  };
}

function countPairsIn(cards) {
  const groups = new Map();
  for (const card of cards) {
    const key = groupKey(card);
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  let count = 0;
  for (const n of groups.values()) count += Math.floor(n / 2);
  return count;
}

function pairNeed(play) {
  if (!play) return 0;
  if (play.type === 'pair') return 1;
  if (play.type === 'tractor') return play.len;
  if (play.type === 'throw') {
    let total = 0;
    for (const comp of play.comps) {
      if (comp.type === 'pair') total += 1;
      else if (comp.type === 'tractor') total += comp.len;
    }
    return total;
  }
  return 0;
}

function longestTractor(cards, trump) {
  let longest = 0;
  for (const comp of decompose(cards, trump)) {
    if (comp.type === 'tractor' && comp.len > longest) longest = comp.len;
  }
  return longest;
}

function selectionIsFromHand(hand, chosen) {
  const available = new Map();
  for (const card of hand) available.set(card.id, (available.get(card.id) || 0) + 1);
  const seen = new Set();
  for (const card of chosen) {
    if (!card || seen.has(card.id) || !available.has(card.id)) return false;
    seen.add(card.id);
  }
  return true;
}

function isLegalFollow(hand, leadInput, chosen, trump, options = DEFAULT_RULES) {
  const lead = Array.isArray(leadInput) ? classify(leadInput, trump) : leadInput;
  if (!lead || !Array.isArray(chosen)) return false;
  if (chosen.length !== lead.cards.length) return false;
  if (!selectionIsFromHand(hand, chosen)) return false;

  const suitInHand = hand.filter((card) => effSuit(card, trump) === lead.suit);
  const chosenInSuit = chosen.filter((card) => effSuit(card, trump) === lead.suit);
  if (chosenInSuit.length !== Math.min(lead.cards.length, suitInHand.length)) return false;

  const need = pairNeed(lead);
  if (need > 0) {
    const must = Math.min(need, countPairsIn(suitInHand));
    if (countPairsIn(chosenInSuit) < must) return false;
  }

  const strict = options.strictTractorFollow !== false;
  const partial = options.partialTractorFollow !== false;
  if (strict && lead.type === 'tractor') {
    const m = longestTractor(suitInHand, trump);
    const cm = longestTractor(chosenInSuit, trump);
    if (m >= lead.len && cm < lead.len) return false;
    if (partial && m >= 2 && m < lead.len && cm < m) return false;
  }
  return true;
}

function structureKey(play) {
  if (!play) return null;
  if (play.type === 'tractor') return `tractor:${play.len}`;
  if (play.type !== 'throw') return play.type;
  return play.comps
    .map((comp) => (comp.type === 'tractor' ? `tractor:${comp.len}` : comp.type))
    .sort()
    .join('|');
}

function resolveTrick(plays, trump) {
  if (!Array.isArray(plays) || plays.length !== 4) {
    throw new Error('resolveTrick requires exactly four plays');
  }
  const lead = classify(plays[0].cards, trump);
  if (!lead) throw new Error('lead play is not classifiable');
  const leadStructure = structureKey(lead);
  let best = lead;
  let winIdx = 0;

  for (let i = 1; i < plays.length; i += 1) {
    const candidate = classify(plays[i].cards, trump);
    if (!candidate || structureKey(candidate) !== leadStructure) continue;
    if (candidate.suit === best.suit) {
      if (candidate.top > best.top) {
        best = candidate;
        winIdx = i;
      }
    } else if (candidate.suit === 'T') {
      best = candidate;
      winIdx = i;
    }
  }

  return {
    winner: plays[winIdx].seat,
    points: plays.reduce((sum, play) => sum + countPoints(play.cards), 0),
    winIdx,
    winningPlay: plays[winIdx],
  };
}

function canBeatComp(sameSuitCards, comp, trump) {
  const components = decompose(sameSuitCards, trump);
  if (comp.type === 'single') {
    return sameSuitCards.some((card) => ordIdx(card, trump) > comp.top);
  }
  if (comp.type === 'pair') {
    return components.some((candidate) =>
      (candidate.type === 'pair' || candidate.type === 'tractor') && candidate.top > comp.top);
  }
  return components.some((candidate) =>
    candidate.type === 'tractor' && candidate.len >= comp.len && candidate.top > comp.top);
}

function checkThrow(hands, seat, cards, trump) {
  const lead = classify(cards, trump);
  if (!lead || lead.type !== 'throw') return { ok: true };
  for (const comp of lead.comps) {
    for (let player = 0; player < 4; player += 1) {
      if (player === seat) continue;
      const sameSuitCards = hands[player].filter((card) => effSuit(card, trump) === lead.suit);
      if (canBeatComp(sameSuitCards, comp, trump)) {
        let forced = lead.comps[0];
        for (let i = 1; i < lead.comps.length; i += 1) {
          if (lead.comps[i].top < forced.top) forced = lead.comps[i];
        }
        return { ok: false, forced, forcedCards: forced.cards.slice() };
      }
    }
  }
  return { ok: true };
}

function declarationOf(cards, trumpRank) {
  if (!Array.isArray(cards)) return null;
  if (cards.length === 1) {
    const card = cards[0];
    if (card.suit !== 'X' && card.rank === trumpRank) {
      return { suit: card.suit, strength: 1 };
    }
    return null;
  }
  if (cards.length !== 2) return null;
  const [a, b] = cards;
  if (a.suit !== b.suit || a.rank !== b.rank) return null;
  if (a.suit !== 'X' && a.rank === trumpRank) return { suit: a.suit, strength: 2 };
  if (a.suit === 'X' && a.rank === 15) return { suit: null, strength: 3 };
  if (a.suit === 'X' && a.rank === 16) return { suit: null, strength: 4 };
  return null;
}

function cardsForDeclaration(hand, trumpRank, option) {
  if (!option) return null;
  let matching;
  let needed;
  if (option.strength === 1 || option.strength === 2) {
    matching = hand.filter((card) => card.suit === option.suit && card.rank === trumpRank);
    needed = option.strength;
  } else if (option.strength === 3 || option.strength === 4) {
    const rank = option.strength === 3 ? 15 : 16;
    if (option.suit !== null) return null;
    matching = hand.filter((card) => card.suit === 'X' && card.rank === rank);
    needed = 2;
  } else {
    return null;
  }
  return matching.length >= needed ? matching.slice(0, needed) : null;
}

function canOverride(current, option, seat, rebelHappened = false) {
  if (!option) return false;
  if (!current) return true;
  if (current.seat === seat) {
    return !rebelHappened && current.strength === 1 && option.strength === 2 &&
      current.suit === option.suit;
  }
  // A same-suit single -> pair is reinforcement, which only the original
  // declarer may perform; a different suit pair remains a regular override.
  if (current.strength === 1 && option.strength === 2 && current.suit === option.suit) {
    return false;
  }
  return option.strength > current.strength;
}

function canFullRebel(hand, trump, rules = DEFAULT_RULES) {
  const byPoints = rules.pointRebelThreshold > 0 &&
    countPoints(hand) <= rules.pointRebelThreshold;
  const trumpCount = hand.filter((card) => effSuit(card, trump) === 'T').length;
  const byTrump = rules.trumpRebelThreshold >= 0 &&
    trumpCount <= rules.trumpRebelThreshold;
  return {
    allowed: byPoints || byTrump,
    pts: countPoints(hand),
    nT: trumpCount,
    byPts: byPoints,
    byTrump,
  };
}

function finalizeDeclaration({ dealerKnown, dealer, firstTaker, curDecl, levels }) {
  const declSeat = dealerKnown ? dealer : (curDecl ? curDecl.seat : firstTaker);
  const trumpRank = dealerKnown ? levels[dealer % 2] : levels[declSeat % 2];
  return {
    declSeat,
    trump: { suit: curDecl ? curDecl.suit : null, rank: trumpRank },
    trumpRank,
  };
}

function scoreRound(defPoints, kitty, defWonLastTrick, lastLeadSize) {
  const multiplier = 2 * lastLeadSize;
  const kittyPoints = countPoints(kitty);
  const total = defPoints + (defWonLastTrick ? kittyPoints * multiplier : 0);
  if (total < 80) {
    const up = total === 0 ? 3 : total < 40 ? 2 : 1;
    return {
      total,
      multiplier,
      kittyPoints,
      declarerWon: true,
      defendersWon: false,
      up,
    };
  }
  return {
    total,
    multiplier,
    kittyPoints,
    declarerWon: false,
    defendersWon: true,
    up: Math.floor((total - 80) / 40),
  };
}

function clampAtGate(from, to, gates = DEFAULT_RULES.gates) {
  if (to <= from || !Array.isArray(gates) || gates.length === 0) return to;
  let hit = null;
  for (const gate of gates) {
    if (gate > from && gate < to && (hit === null || gate < hit)) hit = gate;
  }
  return hit === null ? to : hit;
}

function advanceMatch(levelsInput, declSeat, score, gates = DEFAULT_RULES.gates,
  playedInput, options = DEFAULT_RULES) {
  const levels = levelsInput.slice();
  const played = playedInput ? playedInput.slice() : null;
  const declTeam = declSeat % 2;
  if (score.declarerWon && played) {
    played[declTeam] = Math.max(played[declTeam], levels[declTeam]);
  }

  const team = score.declarerWon ? declTeam : 1 - declTeam;
  const dealer = score.declarerWon ? (declSeat + 2) % 4 : (declSeat + 1) % 4;
  const from = levels[team];
  const up = score.up;
  let level = from;

  if (options.speedRun && up > 0) {
    const ladder = options.speedLadder || DEFAULT_RULES.speedLadder;
    const next = ladder.find((candidate) => candidate > from);
    level = next === undefined ? from + 1 : next;
  } else {
    level = clampAtGate(from, from + up, gates);
    if (up > 0 && played && gates.includes(from) && played[team] < from) level = from;
  }
  levels[team] = level;
  const winner = levels[0] > 14 ? 0 : levels[1] > 14 ? 1 : null;
  return { levels, played: played || playedInput, dealer, team, up, winner, finished: winner !== null };
}

function cutValue(card) {
  const suitOrder = { D: 0, C: 1, H: 2, S: 3, X: 4 };
  return card.rank * 5 + suitOrder[card.suit];
}

function cutForFirst(cuts) {
  let bestSeat = 0;
  let bestValue = cutValue(cuts[0]);
  for (let seat = 1; seat < cuts.length; seat += 1) {
    const value = cutValue(cuts[seat]);
    if (value > bestValue) {
      bestValue = value;
      bestSeat = seat;
    }
  }
  return bestSeat;
}

module.exports = {
  DEFAULT_RULES,
  SUITS,
  makeDeck,
  cardPoints,
  countPoints,
  effSuit,
  ordIdx,
  decompose,
  classify,
  countPairsIn,
  pairNeed,
  longestTractor,
  selectionIsFromHand,
  isLegalFollow,
  structureKey,
  resolveTrick,
  canBeatComp,
  checkThrow,
  declarationOf,
  cardsForDeclaration,
  canOverride,
  canFullRebel,
  finalizeDeclaration,
  scoreRound,
  clampAtGate,
  advanceMatch,
  cutValue,
  cutForFirst,
};
