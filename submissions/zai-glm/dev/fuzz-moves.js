/* 模糊测试:随机局面下 forceLegalFollow 永远合法、legalFollows 非空且全合法 */
'use strict';
const E = require('../engine.js');
const M = require('../moves.js');
const G = require('./game.js');

let seed = 12345;
const rnd = G.mulberry32(seed);
const deck = E.makeDeck();

let bad = 0, emptyFollows = 0, tested = 0, holeCases = 0;
for (let iter = 0; iter < 20000; iter++) {
  // 随机 trump
  const trump = { suit: [null, 'S', 'H', 'D', 'C'][(rnd() * 5) | 0], rank: 2 + ((rnd() * 13) | 0) };
  // 随机一手领出(同门,可含对/拖拉机/甩)
  const pool = deck.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  // 选一个门
  const suit = ['S', 'H', 'D', 'C', 'T'][(rnd() * 5) | 0];
  const inSuit = pool.filter(c => E.effSuit(c, trump) === suit);
  const nLead = 1 + ((rnd() * Math.min(8, inSuit.length)) | 0);
  const leadCards = inSuit.slice(0, nLead);
  if (E.classify(leadCards, trump) === null) continue;
  const rest = pool.filter(c => !leadCards.includes(c));
  const hand = rest.slice(0, 5 + ((rnd() * 20) | 0));
  const lead = E.classify(leadCards, trump);
  if (!lead) continue;
  tested++;
  // 规则洞:伪码义务超过可用张数(如甩 3 单 vs 本门 2 对)→ 按 §S3 不存在合法跟牌,单独统计
  const S = hand.filter(c => E.effSuit(c, trump) === lead.suit);
  const k0 = Math.min(lead.cards.length, S.length);
  let need0 = lead.type === 'pair' ? 1 : lead.type === 'tractor' ? lead.len
    : lead.comps.reduce((a, c) => a + (c.type === 'tractor' ? c.len : 1), 0);
  if (Math.min(need0, E.countPairsIn(S)) > (k0 / 2) | 0) { holeCases++; continue; }
  if (hand.length < lead.cards.length) continue; // 真实对局不会发生(跟牌方必有≥领出张数)
  // forceLegalFollow 合法性(只有 hand >= lead 长度时才有意义)
  if (hand.length >= lead.cards.length) {
    const f = M.forceLegalFollow(hand.slice(), lead, trump);
    if (!E.isLegalFollow(hand, lead, f, trump)) {
      bad++;
      if (bad <= 3) console.log('forceLegalFollow 非法!', JSON.stringify({ trump, lead: leadCards.map(c => [c.suit, c.rank]), hand: hand.map(c => [c.suit, c.rank]) }));
    }
  }
  // legalFollows 非空且全合法
  const opts = M.legalFollows(hand.slice(), lead, trump, 120);
  if (!opts.length) { emptyFollows++; continue; }
  for (const o of opts) {
    if (!E.isLegalFollow(hand, lead, o, trump)) { bad++; break; }
  }
}
console.log(`tested ${tested} | 非法 ${bad} | legalFollows 空 ${emptyFollows} | 规则洞局面 ${holeCases}`);
if (bad === 0 && emptyFollows === 0) console.log('✓ 全部通过');
process.exit(bad === 0 && emptyFollows === 0 ? 0 : 1);
