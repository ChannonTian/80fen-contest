/* zai-glm 第二赛季提交 —— 以官方公开的基线 AI(v0.7.14, Apache-2.0)为基座 fork。
 * 基座来自 ChannonTian/80fen index.html 块①,官方文档明示"参赛者的起点,直接 fork"。
 * 本目录在此之上做独立改进;改进点见 PROGRESS.md。 */
'use strict';
const AI = require('./core.js');
/* s2 晋级配置(vs 基座,官方 referee 配对):
 * R3 depth8:n=120 +1.81 t=4.4 —— 收官搜索 5→8 张,样本 60−8×(n−5)。
 * R6 exact2:n=60 +1.88 t=3.4 —— 搜索起点 ≤2 张时余墩完全信息 alpha-beta 精确解。
 * R7 wsampκ2:n=90 +2.61 t=6.6 —— 世界采样按软断门概率加权 (1−pVoid)^2(BDCI 思路)。
 * R8 kitty:头对头 +2.37 t=3.9 —— 防守方底牌按庄家扣底策略加权采样(不埋主/少埋分)。
 * 叠加(kandw):n=40 +4.26 t=6.3,77.5% 胜率,7.6s/场。其余开关(world/advu/ladder)中性或负,默认关。 */
AI.AIP.s2Depth = 8;
AI.AIP.s2SamplesBy = 8;
AI.AIP.s2Exact = 1;
AI.AIP.s2ExactMax = 2;
AI.AIP.s2Kitty = 1;
AI.AIP.s2Wsample = 1;
AI.AIP.s2Wkappa = 2;

const thaw = v => Object.assign({}, v);

module.exports = () => ({
  name: 'zai-glm',

  onDeal(view) {
    const ctx = {
      vis: view.hand, seat: view.seat, trumpRank: view.trumpRank,
      curDecl: view.curDecl, dealerKnown: view.dealerKnown, dealer: view.dealer,
      firstTaker: view.firstTaker, gates: view.gates, levels: view.levels,
    };
    if (AI.canReinforce2(view.curDecl, view.seat, view.hand, view.trumpRank, view.rebelHappened)) {
      const asPair = AI.scoreDeclOption(ctx, { suit: view.curDecl.suit, strength: 2 }).score;
      const asSingle = AI.scoreDeclOption(ctx, { suit: view.curDecl.suit, strength: 1, hasPair: true }).score;
      if (asPair > asSingle) return { suit: view.curDecl.suit, strength: 2 };
    }
    const d = AI.aiDeclDecide(ctx);
    return (d && d.pass) ? d.opt : null;
  },

  onRebel(view) { return true; },

  discard(view) {
    const opp = 1 - view.myTeam;
    const gateAhead = view.gates.includes(view.levels[opp]);
    return AI.aiDiscard(view.hand.slice(), view.trump, { gateAhead });
  },

  lead(view) { return AI.aiChooseLead(thaw(view)); },
  follow(view, plays) { return AI.aiChooseFollow(thaw(view), plays); },
});
