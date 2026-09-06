/* 80分 AI —— zai-glm。工厂不收参数;配置通过内部 cfg 覆盖(开发用)。 */
'use strict';
const E = require('./engine.js');
const M = require('./moves.js');

const DEFAULTS = {
  // 消融开关(默认全关)
  dumbDecl: false, dumbRebel: false, dumbDiscard: false, dumbLead: false, dumbFollow: false,
  // 亮主
  declPairSuitLen: 4,     // 有级对、且该门(折算)长度≥此值才亮(pair3 无效)
  declSingleSuitLen: 3,   // 级张单亮门槛(越早越好:4→+3.1,3→+2.5,2→+2.1,取3)
  declJokerPair: 2,       // 折算主牌数≥此值+8 才用王对反无主(改6无行为差)
  // 扣底
  discKeepTop: 2,         // 每门保留几张大牌
  // 出牌
  partnerTrust: 0.7,
  leadDrawTrumpMin: 15,   // 主牌张数≥此值才吊主(7:-6.5σ;12:+4σ;15:+4.1σ n=1500;99≈15)
  wPtsOnTable: 0.35,      // 赢墩时桌面分的权重(1.0→0.35:+13.6 级/场, 21σ;0.3/0.4 都更差)
  wCardCost: 0.08,
  lastTrickAware: false,  // 末墩抠底意识
  overtakeRisk: 0.15,     // 后手压我一张的风险折扣/家
  wFeedPartner: 1.0,      // 队友赢时喂分权重
  wGivePts: 1.0,          // 对手赢时藏分权重
  followV2: true,         // v2 跟牌(+3.10 级/场, 5.0σ, n=1000;旧基线上曾是 -1.9σ —— 基线换,符号翻)
  leadV2: true,           // v2 领出(+6.79 级/场, 11.2σ, n=1200)
  leadThrow: true,        // 甩牌候选(+12.70 级/场, 17.7σ, n=1000)
  discV2: false,          // v2 扣底(短门断门;n=1500 只剩 1.0σ,默认关)
  discVoidBonus: 6,       // v2 扣底:短门每张的断门加分
  followExactRisk: true,  // 跟牌被压概率用真实牌情(+3.19, 5.3σ, n=1500)
  followVoidAware: false, // 断门对手可毙牌计入威胁(量到 0% 行为差,死代码)
  followCap: 120,         // 跟牌候选上限(200 无行为差)
  rolloutMaxCards: 0,     // 终局 rollout(默认关:n=2000 边际价值 -0.33±0.43 ≈ 0,省 2.3× 耗时。代码保留)
  rolloutK: 4,            // 采样世界数(K8 无增益)
  rolloutCands: 6,        // 参与 rollout 的候选上限(C10 无增益)
  trumpLockBonus: 0,      // 顶主锁定时主动吊主的加分(0=无效)
  drawBonus: 2,           // 小吊主基础加分(4=无效)
  feedRisk: 0,            // 喂分被后手截胡折价(1/2 均为负,不折更对)
  leadBase: 6,            // 领出:锁顶收墩基础分
  leadPtsW: 0.4,          // 领出:收墩时自带分的权重
  throwCompW: 2.5,        // 领出:甩牌每组件加分
  defPtsW: -1,            // 闲家赢墩分权重(-1=用统一 wPtsOnTable;分裂全负)
  declPtsW: -1,           // 庄家方赢墩分权重
  throwSlack: 0,          // 甩牌允许的非锁顶小组件数(0=只甩全锁顶;1/2 均 -16σ 以上)
  trumpCostBase: 4,       // cardCost 里主牌的固定代价基数(2/6 均无差)
  pairBreakW: 5,          // 拆对子额外代价(+4.25 级/场, 8.1σ, n=2000;3~8 平台,取 5)
  tractorBreakW: 4,       // 拆掉最长拖拉机额外代价(与 pairBreak5 组合 +4.68, 8.9σ)
  discKeepPairs: true,    // 扣底保对子(+3.05, 5.7σ, n=2000)
  leadCostW: 0,           // 领出评价的代价项权重(0=不计;0.1/0.2 均 -17σ,领出就该进攻)
  oppOnlyRisk: false,     // 被压风险只计后手里的对手家(-6.6σ:队友也会盖我,计威胁反而对)
  leadPairBreakW: 0,      // 非锁顶对子/拖拉机领出的拆组代价(-19σ,领出要进攻)
  discPairPen: 3,         // 扣底:拆对代价
  discPairBonus: 6,       // 扣底:整对第二张的折扣
};

function makeAI(cfg) {
  const C = Object.assign({}, DEFAULTS, cfg || {});
  const ai = {
    name: 'zai-glm',
    fallbacks: { onDeal: 0, onRebel: 0, discard: 0, lead: 0, follow: 0 },
  };
  // 我自己亮过的主(用于加固判断)
  let myDecl = null;

  /* ---------- 工具 ---------- */
  function suitOf(c, trump) { return E.effSuit(c, trump); }
  function bySuit(hand, trump) {
    const m = { T: [], S: [], H: [], D: [], C: [] };
    for (const c of hand) m[suitOf(c, trump)].push(c);
    for (const k in m) m[k].sort((a, b) => E.ordIdx(a, trump) - E.ordIdx(b, trump) || a.id - b.id);
    return m;
  }
  function cardCost(c, trump) {
    // 牌的「保留价值」:分 > 大牌 > 小牌
    let v = E.cardPts(c) * 0.5;
    const o = E.ordIdx(c, trump);
    if (suitOf(c, trump) === 'T') v += C.trumpCostBase + o * 0.5;
    else v += o * 0.35;
    return v;
  }

  /* ---------- 亮主 ---------- */
  ai.onDeal = function (view) {
    try {
      if (C.dumbDecl) return null;
      const lv = view.trumpRank;
      const hand = view.hand;
      // 王对
      const sj = hand.filter(c => c.suit === 'X' && c.rank === 15).length;
      const bj = hand.filter(c => c.suit === 'X' && c.rank === 16).length;
      const trumpApprox = hand.filter(c => c.suit === 'X' || c.rank === lv).length;
      if (bj >= 2 && trumpApprox >= C.declJokerPair + 8) { myDecl = null; return { suit: null, strength: 4 }; }
      if (sj >= 2 && trumpApprox >= C.declJokerPair + 8 && !(view.curDecl && view.curDecl.strength >= 4)) {
        myDecl = null; return { suit: null, strength: 3 };
      }
      // 级数牌
      const byS = {};
      for (const c of hand) {
        if (c.suit === 'X' || c.rank !== lv) continue;
        (byS[c.suit] = byS[c.suit] || []).push(c);
      }
      let bestS = null, bestLen = -1, bestN = 0;
      for (const s in byS) {
        const eff = byS[s].length + (s === 'S' ? 0 : 0);
        if (byS[s].length > bestN || (byS[s].length === bestN && eff > bestLen)) {
          bestN = byS[s].length; bestS = s; bestLen = eff;
        }
      }
      if (bestS && bestN >= 2 && view.hand.length >= C.declPairSuitLen + 4) {
        myDecl = bestS; return { suit: bestS, strength: 2 };
      }
      if (bestS && bestN >= 1 && view.hand.length >= C.declSingleSuitLen + 8) {
        myDecl = bestS; return { suit: bestS, strength: 1 };
      }
      return null;
    } catch (e) { ai.fallbacks.onDeal++; return null; }
  };

  /* ---------- 造反 ---------- */
  ai.onRebel = function (view) {
    try { return !C.dumbRebel; } catch (e) { ai.fallbacks.onRebel++; return false; }
  };

  /* ---------- 扣底 ---------- */
  ai.discard = function (view) {
    try {
      if (C.dumbDiscard) return view.hand.slice(0, 8);
      const hand = view.hand.slice();
      const trump = view.trump;
      if (C.discV2) {
        // 评分扣底:短门做断门(+6/张)、分牌不扣(-2/分)、主牌不扣(-12)、
        // 长门的大牌不扣、小牌微加
        const sm = bySuit(hand, trump);
        const scored = hand.map(c => {
          const s = E.effSuit(c, trump);
          const L = sm[s].length;
          let v = -E.cardPts(c) * 2;
          if (s !== 'T' && L <= 3) v += C.discVoidBonus;
          if (s === 'T') v -= 12;
          else v += (11 - E.ordIdx(c, trump)) * 0.3;
          if (s !== 'T' && L >= 6) {
            // 长门保留顶部两张
            const sorted = sm[s];
            if (c === sorted[sorted.length - 1] || c === sorted[sorted.length - 2]) v -= 4;
          }
          return { c, v };
        });
        scored.sort((a, b) => b.v - a.v || a.c.id - b.c.id);
        return scored.slice(0, 8).map(x => x.c);
      }
      // 优先扣:非主的低分小牌;按 (分, 序) 升序取 8 张
      const nonT = hand.filter(c => E.effSuit(c, trump) !== 'T');
      if (C.discKeepPairs) {
        // 扣底也保对子:拆开的对子成员扣一张要付代价;整对一起扣低对优先
        const cnt = new Map();
        for (const c of nonT) {
          const k = c.suit + c.rank;
          cnt.set(k, (cnt.get(k) || 0) + 1);
        }
        const chosen = new Set();
        const scored = nonT.map(c => {
          const k = c.suit + c.rank;
          let v = E.cardPts(c) * 2 + E.ordIdx(c, trump) * 0.3;
          const isPair = cnt.get(k) >= 2;
          if (isPair && !chosen.has(k)) v += C.discPairPen;   // 拆对代价
          if (isPair && chosen.has(k)) v -= C.discPairBonus;  // 第二张跟上,整对走
          return { c, v, k };
        });
        scored.sort((a, b) => a.v - b.v || a.c.id - b.c.id);
        const picks = [];
        for (const x of scored) { picks.push(x.c); chosen.add(x.k); }
        const sel = picks.slice(0, 8);
        if (sel.length >= 8) return sel;
        const t2 = hand.filter(c => E.effSuit(c, trump) === 'T')
          .sort((a, b) => E.ordIdx(a, trump) - E.ordIdx(b, trump));
        return sel.concat(t2.slice(0, 8 - sel.length));
      }
      nonT.sort((a, b) => (E.cardPts(a) - E.cardPts(b)) ||
        (E.ordIdx(a, trump) - E.ordIdx(b, trump)) || (a.id - b.id));
      if (nonT.length >= 8) return nonT.slice(0, 8);
      // 不够就动主牌里最烂的
      const t = hand.filter(c => E.effSuit(c, trump) === 'T')
        .sort((a, b) => E.ordIdx(a, trump) - E.ordIdx(b, trump));
      return nonT.concat(t.slice(0, 8 - nonT.length));
    } catch (e) {
      ai.fallbacks.discard++;
      return view.hand.slice(0, 8);
    }
  };

  /* ---------- 记牌:哪些牌已经出过 ---------- */
  function seenMap(view) {
    const seen = { T: [], S: [], H: [], D: [], C: [] };
    for (const p of view.history) for (const c of p.cards) seen[E.effSuit(c, view.trump)].push(c);
    return seen;
  }
  // 这张牌是不是「现存最大」(门内,含手牌外的推理:只看已出掉的)
  function isTopLive(c, trump, seen) {
    const s = E.effSuit(c, trump);
    for (const x of seen[s]) {
      // 已出的更大或同 rank 的另一张?同 rank 另一张没出不算压过我
      if (E.ordIdx(x, trump) > E.ordIdx(c, trump)) return false;
    }
    return true;
  }

  /* ---------- 领出 v0(基线) ---------- */
  function leadV0(view) {
    const trump = view.trump;
    const hand = view.hand.slice();
    const sm = bySuit(hand, trump);
    const seen = seenMap(view);
    // 副门里我持有现存最大的对子/拖拉机 → 领出去吃分
    let bestLead = null, bestScore = -1e9;
    for (const s of ['S', 'H', 'D', 'C']) {
      if (s === trump.suit) continue;
      const cs = sm[s];
      if (!cs.length) continue;
      const comps = E.decompose(cs, trump);
      for (const comp of comps) {
        if (comp.type === 'single') continue;
        const topLive = isTopLive(comp.cards[comp.cards.length - 1], trump, seen) &&
          cs.filter(c => E.ordIdx(c, trump) > comp.top).length === 0;
        if (topLive) {
          const sc = 10 + (comp.len || 1) * 4 + E.countPts(comp.cards) * 0.5;
          if (sc > bestScore) { bestScore = sc; bestLead = comp.cards.slice(); }
        }
      }
    }
    if (bestLead) return bestLead;
    const tTop = sm.T.length ? sm.T[sm.T.length - 1] : null;
    if (sm.T.length >= C.leadDrawTrumpMin && tTop && isTopLive(tTop, trump, seen)) return [tTop];
    let shortS = null, shortLen = 99;
    for (const s of ['S', 'H', 'D', 'C']) {
      if (s === trump.suit || !sm[s].length) continue;
      if (sm[s].length < shortLen) { shortLen = sm[s].length; shortS = s; }
    }
    if (shortS) {
      const cs = sm[shortS];
      const top = cs[cs.length - 1];
      if (isTopLive(top, trump, seen) && cs.length >= 2) return [top];
      return [cs[0]];
    }
    return [sm.T[0]];
  }

  /* ---------- 领出(v2) ---------- */
  ai.lead = function (view) {
    try {
      if (C.dumbLead || !C.leadV2) {
        const h = view.hand.slice().sort((a, b) => E.ordIdx(a, view.trump) - E.ordIdx(b, view.trump) || a.id - b.id);
        if (C.dumbLead) return [h[0]];
        return leadV0(view);
      }
      const trump = view.trump;
      const hand = view.hand.slice();
      const sm = bySuit(hand, trump);
      const seen = seenMap(view);
      const nPlayed = view.history.length / 4; // 已打墩数

      // 门内「我上面还剩几张更大的活牌」(含对手+队友+底牌的未知牌)
      function biggerLive(s, top) {
        // 全套该门 12/16 张减去我手上的、已出的
        let total = 0;
        for (const s2 of ['S', 'H', 'D', 'C', 'X']) {
          // 数该有效门总张数
        }
        if (s === 'T') {
          // 主:两张王×2 + 级数牌8张 + 主花色12张
          total = 4 + 8 + 12;
          if (trump.suit === null) total = 4 + 8;
        } else {
          total = 24; // 副门两副 26 张减级数 2 张 = 24(级数牌是主)
        }
        let bigger = 0;
        const myOrds = new Set(sm[s] && sm[s].map(c => E.ordIdx(c, trump)));
        for (const c of seen[s]) {
          if (E.ordIdx(c, trump) > top && !myOrds.has(E.ordIdx(c, trump))) bigger++; // 已出的不算威胁
        }
        // 未见的更大牌 = total - 我该门张数 - 该门已出张数里≤top 的... 粗略:
        let seenIn = seen[s].length;
        let unaccounted = total - (sm[s] ? sm[s].length : 0) - seenIn; // 在别人手里或底牌
        // 更大的序号档位数 × 每档 2 张 - 已见
        let biggerSlots = 0;
        for (let o = top + 1; o <= (s === 'T' ? 15 : 11); o++) {
          if (!myOrds.has(o)) biggerSlots++;
        }
        return Math.max(0, Math.min(unaccounted, biggerSlots * 2 - bigger));
      }

      const cands = [];
      function addCand(cards, tag) {
        if (cards && cards.length) cands.push({ cards, tag });
      }
      for (const s of ['S', 'H', 'D', 'C', 'T']) {
        const cs = sm[s];
        if (!cs.length) continue;
        const isTrumpSuit = s === 'T';
        if (isTrumpSuit && trump.suit === null && s !== 'T') continue;
        const comps = E.decompose(cs, trump);
        for (const comp of comps) {
          if (comp.type === 'single') {
            addCand(comp.cards, s + ':singleLow');
            if (comps.length === 1 && comp.cards[0] === cs[cs.length - 1]) addCand(comp.cards, s + ':singleTop');
          } else {
            addCand(comp.cards, s + ':' + comp.type);
          }
        }
        // 单张攻击:门里最大的那张
        addCand([cs[cs.length - 1]], s + ':attackTop');
        // 单张送小:最小非分牌优先
        const nonPts = cs.filter(c => E.cardPts(c) === 0);
        if (nonPts.length) addCand([nonPts[0]], s + ':feedLow');
        // 甩牌:本门「锁顶」组件一起甩(无人能压,白吃多墩节奏)
        if (C.leadThrow) {
          const locked = comps.filter(comp => biggerLive(s, comp.top) === 0);
          if (locked.length >= 2) {
            const cards = locked.reduce((a, c) => a.concat(c.cards), []);
            if (cards.length <= cs.length) addCand(cards, s + ':throwAll');
          }
          // 放宽:允许 ≤throwSlack 个非锁顶小组件混进甩牌(被吃只被迫出小组)
          if (C.throwSlack > 0) {
            const byTop = comps.slice().sort((a, b) => a.top - b.top);
            const take = [];
            let slack = C.throwSlack;
            for (const comp of byTop) {
              if (biggerLive(s, comp.top) === 0) take.push(comp);
              else if (slack > 0 && comp.top <= byTop[0].top + 2) { take.push(comp); slack--; }
            }
            if (take.length >= 2) {
              const cards = take.reduce((a, c) => a.concat(c.cards), []);
              if (cards.length <= cs.length && E.classify(cards, trump) && E.classify(cards, trump).type === 'throw')
                addCand(cards, s + ':throwSlack');
            }
          }
        }
      }

      let best = null, bestScore = -1e9;
      if (C.rolloutMaxCards && hand.length <= C.rolloutMaxCards) {
        const rs = rolloutScores(view, [], cands.slice(0, C.rolloutCands).map(x => x.cards), C.rolloutK);
        if (rs && rs.length && rs[0].score > -1e8) return rs[0].cand.slice();
      }
      for (const cand of cands) {
        const s = cand.tag.split(':')[0];
        const cs = sm[s];
        const cl = E.classify(cand.cards, trump);
        const pts = E.countPts(cand.cards);
        const top = cl.top;
        const nBig = biggerLive(s, top); // 无人能压? 0=我已锁顶
        let sc = 0;

        if (nBig === 0) {
          // 这手牌是现存最大:大概率收墩
          sc = C.leadBase + pts * C.leadPtsW + (cl.type === 'tractor' ? 3 + cl.len * 2 : cl.type === 'pair' ? 2 : 0);
          // 甩牌:每个组件都是锁顶,一次清多墩
          if (cl.type === 'throw') sc += cl.comps.length * C.throwCompW;
          // 对子/拖拉机收墩还能拉出对手的同门牌
          if (cl.type !== 'single') sc += 2;
          // 顶主锁定:主动吊主拉对手的主牌
          if (s === 'T' && C.trumpLockBonus) sc += C.trumpLockBonus;
          if (isLastTrickLead(view, hand, cl)) {
            const kp = view.buriedKnown && view.buriedKnown.length ? E.countPts(view.buriedKnown) : 0;
            if (view.declSeat >= 0 && view.declSeat % 2 !== view.myTeam) sc += kp * 2 * cl.cards.length * 0.5; // 闲家末墩抠底
            else if (kp > 0) sc += kp * 2 * cl.cards.length * 0.5; // 庄家守底
          }
        } else {
          // 会被压:送小牌 setup,或长门发展
          sc = -1 - pts * 1.2; // 裸送分是负的
          // 非锁顶的对子/拖拉机领出会拆掉组合资产
          if (C.leadPairBreakW > 0 && cl.type !== 'single') sc -= C.leadPairBreakW * (cl.len || 1);
          // 若我门很长且这张之后还有大牌,留着后收:送小是合理的铺垫
          if (cs.length >= 5 && pts === 0 && cand.cards[0] === cs[0]) sc += 1.5;
          // 主牌小吊:拉对手的主
          if (s === 'T' && C.leadDrawTrumpMin && sm.T.length >= C.leadDrawTrumpMin) sc += C.drawBonus + Math.min(sm.T.length, 12) * 0.15;
        }
        if (C.leadCostW > 0) {
          let lc = 0;
          for (const c of cand.cards) lc += cardCost(c, trump);
          sc -= lc * C.leadCostW;
        }
        if (sc > bestScore) { bestScore = sc; best = cand.cards; }
      }
      if (best) return best.slice();
      return [hand[0]];
    } catch (e) {
      ai.fallbacks.lead++;
      return [view.hand[0]];
    }
  };

  /* ---------- 跟牌(v2) ---------- */
  ai.follow = function (view, plays) {
    try {
      if (C.dumbFollow) return M.forceLegalFollow(view.hand.slice(), E.classify(plays[0].cards, view.trump), view.trump);
      if (!C.followV2) return followV0(view, plays);
      const trump = view.trump;
      const hand = view.hand.slice();
      const lead = E.classify(plays[0].cards, trump);
      const opts = M.legalFollows(hand, lead, trump, C.followCap);
      if (!opts.length) return M.forceLegalFollow(hand, lead, trump);
      if (C.rolloutMaxCards && hand.length <= C.rolloutMaxCards) {
        const rs = rolloutScores(view, plays.slice(), opts.slice(0, C.rolloutCands), C.rolloutK);
        if (rs && rs.length) return rs[0].cand;
      }

      let tablePts = 0;
      for (const p of plays) tablePts += E.countPts(p.cards);
      // 预分类各家(增量比较,免每候选全墩 resolveTrick)
      const playCls = plays.map(p => E.classify(p.cards, trump));
      const leadSig = E.structSig(playCls[0].comps);
      let bestCls = playCls[0], bestIdx = 0;
      for (let i = 1; i < plays.length; i++) {
        const cl = playCls[i];
        if (!cl || E.structSig(cl.comps) !== leadSig) continue;
        if (cl.suit === bestCls.suit) { if (cl.top > bestCls.top) { bestCls = cl; bestIdx = i; } }
        else if (cl.suit === 'T') { bestCls = cl; bestIdx = i; }
      }
      const curWinner = plays[bestIdx].seat;
      const partnerWinning = curWinner % 2 === view.myTeam;
      const nAfter = 3 - plays.length; // 我之后还有几家
      // 后手里的对手家数(队友不会压我,不该计威胁)
      const leadSeat2 = plays[0].seat;
      let oppAfter = 0;
      for (let j = plays.length + 1; j < 4; j++) {
        const s2 = (leadSeat2 + j) % 4;
        if (s2 % 2 !== view.myTeam) oppAfter++;
      }
      const riskAfter = C.oppOnlyRisk ? oppAfter : nAfter;
      const myTeam = view.myTeam;

      // 末墩判断:这墩打完手牌出空(所有单张领出时成立;近似用手牌数)
      const isLastTrick = hand.length === lead.cards.length;
      // 抠底:庄家知道底牌的分;闲家按期望 0 估
      const kittyPts = view.buriedKnown && view.buriedKnown.length ? E.countPts(view.buriedKnown) : 0;
      const kittyMult = 2 * lead.cards.length;
      const defSide = view.declSeat >= 0 && (view.declSeat % 2) !== myTeam;
      // 末墩赢家价值:闲家赢 → 底分×倍数;庄家赢 → 防住同样的量
      const lastBonus = isLastTrick && C.lastTrickAware ? kittyPts * kittyMult : 0;

      let best = null, bestScore = -1e9;
      for (const cand of opts) {
        const cl2 = E.classify(cand, trump);
        const candSig = cl2 ? E.structSig(cl2.comps) : '';
        let iWin = false;
        if (cl2 && candSig === leadSig) {
          if (cl2.suit === bestCls.suit) iWin = cl2.top > bestCls.top;
          else iWin = cl2.suit === 'T';
        }
        const myPts = E.countPts(cand);
        const ptsAfter = tablePts + myPts;
        let cost = 0;
        for (const c of cand) cost += cardCost(c, trump);
        // 保对子:被拆掉的对子数记额外代价(手牌结构)
        if (C.pairBreakW > 0 || C.tractorBreakW > 0) {
          const before = E.countPairsIn(hand);
          const bt = E.maxTractorLen(hand, trump);
          const ids2 = new Set(cand.map(c => c.id));
          const rest2 = hand.filter(c => !ids2.has(c.id));
          const after = E.countPairsIn(rest2);
          cost += (before - after) * C.pairBreakW;
          if (E.maxTractorLen(rest2, trump) < bt) cost += C.tractorBreakW * bt;
        }

        let sc;
        if (iWin) {
          const pw = C.defPtsW >= 0 ? (defSide ? C.defPtsW : C.declPtsW) : C.wPtsOnTable;
          sc = (ptsAfter + lastBonus) * pw - cost * C.wCardCost;
          // 后面还有人可能压我:桌上分越多、越可能被压 —— 打折
          if (nAfter > 0 && C.followExactRisk) {
            const needPair = cl2.type !== 'single';
            let canBeBeaten = biggerLiveG(view, hand, cl2.suit, cl2.top, needPair) > 0;
            if (C.followVoidAware && cl2.suit !== 'T') {
              // 后手有人断门 → 任何一张主都能毙掉我
              const leadSeat = plays[0].seat;
              for (let j = plays.length + 1; j < 4; j++) {
                const s2 = (leadSeat + j) % 4;
                if (voidsOf(view, trump, s2).has(cl2.suit)) { canBeBeaten = true; break; }
              }
            }
            if (canBeBeaten) sc -= ptsAfter * C.overtakeRisk * riskAfter;
          } else if (nAfter > 0) sc -= ptsAfter * C.overtakeRisk * riskAfter;
        } else if (partnerWinning) {
          // 队友在赢:喂分;但我后面还有人可能截胡时,喂的分可能落入敌手
          let feed = C.wFeedPartner;
          if (nAfter > 0 && C.feedRisk) feed *= Math.max(0, 1 - C.overtakeRisk * nAfter * C.feedRisk);
          sc = myPts * feed - cost * C.wCardCost;
        } else {
          // 对手在赢:藏分,出最低价值
          sc = -myPts * C.wGivePts - cost * C.wCardCost;
        }
        if (sc > bestScore) { bestScore = sc; best = cand; }
      }
      return best || opts[0];
    } catch (e) {
      ai.fallbacks.follow++;
      const lead0 = E.classify(plays[0].cards, view.trump);
      return M.forceLegalFollow(view.hand.slice(), lead0, view.trump);
    }
  };

  return ai;
}

function isLastTrickLead(view, hand, cl) {
  return hand.length === cl.cards.length;
}

/* 门内序号档的总张数(两副牌) */
function slotTotal(trump, s, o) {
  if (s !== 'T') return 2;
  if (o === 15 || o === 14) return 2;
  if (o === 13) return trump.suit === null ? 8 : 2;
  if (o === 12) return 6; // 三门副级牌 ×2
  return 2; // 主花色散牌档
}
/* ===== 终局 rollout =====
 * 手牌很少时:采样「暗牌在三家怎么分」的 K 个世界,每个候选着法在世界里
 * 用快速走子打到底,取「我方净分(含抠底)」平均。确定性种子,可复现。 */

function mulberry32Local(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const FULL_DECK_IDS = (() => {
  const d = [];
  for (const s of ['S', 'H', 'D', 'C']) for (let r = 2; r <= 14; r++) { d.push(s + r); d.push(s + r); }
  d.push('X15', 'X15', 'X16', 'X16');
  return d;
})();

/* 构建 K 个世界。返回 null 表示姿势不对(交给静态评价) */
function buildWorlds(view, plays, K) {
  const trump = view.trump;
  const known = new Set();
  for (const p of view.history) for (const c of p.cards) known.add(c.id);
  for (const c of view.hand) known.add(c.id);
  const buried = view.buriedKnown && view.buriedKnown.length ? view.buriedKnown : null;
  if (buried) for (const c of buried) known.add(c.id);
  // 全牌(按 id)去掉已知
  const unseen = [];
  for (let id = 0; id < 108; id++) if (!known.has(id)) unseen.push(id);
  // 其余三家的目标张数(本墩已出过的要扣掉)
  const H = view.hand.length;
  const targets = [0, 0, 0, 0];
  for (let s = 0; s < 4; s++) {
    if (s === view.seat) continue;
    let played = 0;
    for (const p of plays) if (p.seat === s) played = p.cards.length;
    targets[s] = H - played;
  }
  const need = targets[0] + targets[1] + targets[2] + targets[3];
  const phantom = !buried;
  if (phantom && unseen.length !== need + 8) return null;
  if (!phantom && unseen.length !== need) return null;

  // id → 牌对象(从 history/手牌/底牌里找;凑不齐就返回 null)
  const idToCard = new Map();
  const addCard = (c) => { if (!idToCard.has(c.id)) idToCard.set(c.id, c); };
  for (const p of view.history) for (const c of p.cards) addCard(c);
  for (const c of view.hand) addCard(c);
  if (buried) for (const c of buried) addCard(c);
  // 还差 opponents 的牌对象 —— 用「同 suit/rank 的形状」构造即可(比较只用 suit/rank/id)
  const shapes = new Map();
  for (const c of idToCard.values()) shapes.set(c.suit + c.rank, c);
  const pool = unseen.map(id => {
    if (idToCard.has(id)) return idToCard.get(id);
    // id 与形状的对应:按构造顺序还原(makeDeck 顺序)
    let n = 0;
    for (const s of ['S', 'H', 'D', 'C']) for (let r = 2; r <= 14; r++) {
      if (id === n || id === n + 1) return { suit: s, rank: r, id };
      n += 2;
    }
    if (id === 104 || id === 105) return { suit: 'X', rank: 15, id };
    return { suit: 'X', rank: 16, id };
  });

  const baseSeed = (view.round * 1000003 + view.trickNo * 1009 + view.seat * 97 + view.history.length * 31) | 0;
  const worlds = [];
  for (let k = 0; k < K; k++) {
    const rnd = mulberry32Local(baseSeed + k * 7919);
    const p = pool.slice();
    for (let i = p.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    let kitty = buried ? buried.slice() : p.slice(0, 8);
    let rest = buried ? p : p.slice(8);
    const hands = [[], [], [], []];
    hands[view.seat] = view.hand.slice();
    let idx = 0;
    for (let s2 = 1; s2 <= 4; s2++) {
      const s = (view.seat + s2) % 4;
      hands[s] = rest.slice(idx, idx + targets[s]); idx += targets[s];
    }
    worlds.push({ hands, kitty });
  }
  return worlds;
}

/* 快速走子:forceLegalFollow 或最小单张,打到底。返回 [我方分, 对方分](含抠底) */
function playoutWorld(world, trump, playsIn, myTeam, declTeam, seed) {
  const hands = world.hands.map(h => h.slice());
  const plays = playsIn.map(p => ({ seat: p.seat, cards: p.cards.slice() }));
  const pts = [0, 0];
  const rnd = mulberry32Local(seed);
  // 当前墩的领出者
  let leader = plays.length ? plays[0].seat : null;
  let lastLeadSize = 1;
  let guard = 0;
  while (guard++ < 60) {
    const anyCards = hands.some(h => h.length > 0);
    if (!anyCards) break;
    if (!plays.length) {
      // 找一个还有牌的人领出(防御:领出者恰好无牌)
      leader = findFirstWithCards(hands, leader === null ? 0 : leader);
      if (!hands[leader].length) break;
      const h0 = hands[leader];
      const sorted0 = h0.slice().sort((a, b) => (E.cardPts(a) - E.cardPts(b)) ||
        (E.ordIdx(a, trump) - E.ordIdx(b, trump)) || (a.id - b.id));
      plays.push({ seat: leader, cards: [sorted0[0]] });
      removeFromHandL(h0, sorted0[0]);
    }
    if (leader === null) {
      // 我方开局领出已在 playsIn 处理;这里只会发生在后续墩
      leader = findFirstWithCards(hands, plays.length ? plays[0].seat : 0);
    }
    // 补完当前墩
    while (plays.length < 4) {
      const s = (plays[0].seat + plays.length) % 4;
      if (!hands[s].length) break; // 不应发生(等张)
      const leadCls = E.classify(plays[0].cards, trump);
      const mv = M.forceLegalFollow(hands[s], leadCls, trump);
      plays.push({ seat: s, cards: mv });
      for (const c of mv) removeFromHandL(hands[s], c);
    }
    const res = E.resolveTrick(plays, trump);
    pts[res.winner % 2] += res.pts;
    const wasLast = hands.every(h => h.length === 0);
    if (wasLast) {
      lastLeadSize = plays[0].cards.length;
      if (res.winner % 2 !== declTeam) {
        pts[res.winner % 2] += E.countPts(world.kitty) * 2 * lastLeadSize;
      }
    }
    leader = res.winner;
    plays.length = 0;
    // 下一墩领出
    if (hands[leader].length) {
      const h = hands[leader];
      // 最小单张(分低序低)
      const sorted = h.slice().sort((a, b) => (E.cardPts(a) - E.cardPts(b)) ||
        (E.ordIdx(a, trump) - E.ordIdx(b, trump)) || (a.id - b.id));
      plays.push({ seat: leader, cards: [sorted[0]] });
      removeFromHandL(hands[leader], sorted[0]);
    }
  }
  return [pts[myTeam], pts[1 - myTeam]];
}
function findFirstWithCards(hands, from) {
  for (let i = 0; i < 4; i++) if (hands[(from + i) % 4].length) return (from + i) % 4;
  return 0;
}
function removeFromHandL(hand, c) {
  for (let i = 0; i < hand.length; i++) if (hand[i].id === c.id) { hand.splice(i, 1); return; }
}

/* rollout 决策:对每个候选求 K 世界平均净分,返回 [cand, avgScore][] */
function rolloutScores(view, plays, cands, K) {
  const worlds = buildWorlds(view, plays, K);
  if (!worlds) return null;
  const declTeam = view.declSeat >= 0 ? view.declSeat % 2 : view.myTeam; // 无庄局时保守当自己
  const out = [];
  for (const cand of cands) {
    let mine = 0, theirs = 0;
    for (let k = 0; k < worlds.length; k++) {
      const plays2 = plays.map(p => ({ seat: p.seat, cards: p.cards.slice() }));
      plays2.push({ seat: view.seat, cards: cand.slice() });
      let r;
      try {
        r = playoutWorld(worlds[k], view.trump, plays2, view.myTeam, declTeam, k * 104729 + cand[0].id);
      } catch (e) { r = [0, 0]; }
      mine += r[0]; theirs += r[1];
    }
    out.push({ cand, score: (mine - theirs) / worlds.length });
  }
  out.sort((x, y) => y.score - x.score);
  return out;
}
function voidsOf(view, trump, seat) {
  const v = new Set();
  const h = view.history;
  for (let i = 0; i + 4 <= h.length; i += 4) {
    const lead = E.classify(h[i].cards, trump);
    if (!lead) continue;
    for (let j = 1; j < 4; j++) {
      const p = h[i + j];
      if (p.seat !== seat) continue;
      if (p.cards.every(c => E.effSuit(c, trump) !== lead.suit)) v.add(lead.suit);
    }
  }
  return v;
}

/* 未见的、能压过 top 的牌数(在对手手里或底牌)。
 * needPair: 只数「能组成对子」的档(对子/拖拉机候选用) */
function biggerLiveG(view, hand, s, top, needPair) {
  const trump = view.trump;
  const mySlots = {}, seenSlots = {};
  for (const c of hand) if (E.effSuit(c, trump) === s) {
    const o = E.ordIdx(c, trump); mySlots[o] = (mySlots[o] || 0) + 1;
  }
  for (const p of view.history) for (const c of p.cards) if (E.effSuit(c, trump) === s) {
    const o = E.ordIdx(c, trump); seenSlots[o] = (seenSlots[o] || 0) + 1;
  }
  const maxO = s === 'T' ? 15 : 11;
  let n = 0;
  for (let o = top + 1; o <= maxO; o++) {
    const un = Math.max(0, slotTotal(trump, s, o) - (seenSlots[o] || 0) - (mySlots[o] || 0));
    if (needPair) { if (un >= 2) n += 1; }
    else n += un;
  }
  return n;
}

/* v0 跟牌(原基线) */
function followV0(view, plays) {
  const trump = view.trump;
  const hand = view.hand.slice();
  const lead = E.classify(plays[0].cards, trump);
  const opts = M.legalFollows(hand, lead, trump, 120);
  if (!opts.length) return M.forceLegalFollow(hand, lead, trump);
  let tablePts = 0;
  for (const p of plays) tablePts += E.countPts(p.cards);
  const sim = E.resolveTrick(plays, trump);
  const curWinner = plays[sim.winIdx].seat;
  const partnerWinning = curWinner % 2 === view.myTeam;
  const iAmLast = plays.length === 3;
  const isDef = view.declSeat >= 0 && (view.declSeat % 2) !== view.myTeam;
  let best = null, bestScore = -1e9;
  for (const cand of opts) {
    const all = plays.concat([{ seat: view.seat, cards: cand }]);
    const r2 = E.resolveTrick(all, trump);
    const iWin = all[r2.winIdx].seat === view.seat;
    const ptsAfter = tablePts + E.countPts(cand);
    let sc = 0, cost = 0;
    for (const c of cand) cost += cardCostG(c, trump);
    if (iWin) {
      sc = ptsAfter * 1.0 * 2 - cost * 0.08;
      if (!isDef) sc -= ptsAfter * 0.8;
    } else {
      if (partnerWinning) sc = E.countPts(cand) * 1.2 - cost * 0.08;
      else sc = -E.countPts(cand) * 1.5 - cost * 0.08;
    }
    if (sc > bestScore) { bestScore = sc; best = cand; }
  }
  return best || opts[0];
}
function cardCostG(c, trump) {
  let v = E.cardPts(c) * 0.5;
  const o = E.ordIdx(c, trump);
  if (E.effSuit(c, trump) === 'T') v += 4 + o * 0.5;
  else v += o * 0.35;
  return v;
}

module.exports = makeAI;
module.exports.DEFAULTS = DEFAULTS;
