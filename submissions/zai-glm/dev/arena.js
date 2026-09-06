/* 跑分器:同一批牌两边各打一遍(A 坐 team0 / A 坐 team1),配对合成一个数。
 * 用法: node dev/arena.js [n] [cfgA(JSON)] [cfgB(JSON)]
 *   A/B 都是 makeAI 的配置;不传 B 则 B=A 的默认(校准用)。
 * A 的工厂 = require('../index.js')(cfgA);B 同理。 */
'use strict';
const G = require('./game.js');

function mean(a) { return a.reduce((x, y) => x + y, 0) / (a.length || 1); }
function sem(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1) / a.length);
}

/* 打 n 个配对局。返回 {lvlDiff(每局), netPts, stats} */
function roundArena(mkA, mkB, n, seedBase, verbose) {
  const lvl = [], pts = [];
  const lvlSem = () => sem(lvl);
  let violA = 0, violB = 0, penA = 0, penB = 0, fbA = 0, fbB = 0, throws = 0;
  // 内部兜底计数(AI 自己 try/catch 吞掉的异常 —— 不为 0 说明代码坏了,不是策略差)
  let intFbA = {}, intFbB = {};
  const collect = (ais, agg) => {
    for (const a of ais) if (a && a.fallbacks)
      for (const k of Object.keys(a.fallbacks)) agg[k] = (agg[k] || 0) + a.fallbacks[k];
  };
  const wrapA = () => mkA(), wrapB = () => mkB();
  for (let i = 0; i < n; i++) {
    const seed = (seedBase || 1) + i;
    // 同一批牌打两遍:同一种子,交换阵营
    const ais1 = [wrapA(), wrapB(), wrapA(), wrapB()];
    const m1 = G.playMatch(ais1, seed);
    const ais2 = [wrapB(), wrapA(), wrapB(), wrapA()];
    const m2 = G.playMatch(ais2, seed);
    collect([ais1[0], ais1[2], ais2[1], ais2[3]], intFbA);
    collect([ais1[1], ais1[3], ais2[0], ais2[2]], intFbB);
    // 配对:场2 里 B 是 team0,翻转视角
    const l1 = matchLevel(m1, 0), l2 = matchLevel(m2, 1);
    lvl.push(l1 + l2);
    pts.push(matchPts(m1, 0) + matchPts(m2, 1));
    for (const st of [m1, m2]) {
      for (let s = 0; s < 4; s++) {
        const isA = (st === m1 ? s % 2 === 0 : s % 2 === 1);
        if (isA) { violA += st.violations[s]; fbA += st.fallbacks[s]; }
        else { violB += st.violations[s]; fbB += st.fallbacks[s]; }
      }
    }
  }
  return {
    n, lvlDiff: mean(lvl), lvlSem: sem(lvl), ptsDiff: mean(pts), ptsSem: sem(pts),
    sigma: sem(lvl) > 0 ? mean(lvl) / sem(lvl) : 0,
    violA, violB, fbA, fbB, intFbA, intFbB,
  };
}

/* 整场折算:胜场 + 净胜级 + 每局净分 → 从 teamA 视角 */
function matchLevel(m, teamASeat) {
  // 净胜级:finalLevels 差,赢场记 +15 权重?先用「级差 + 胜场加成」
  const lv = m.finalLevels[teamASeat] - m.finalLevels[1 - teamASeat];
  const won = m.winner === teamASeat ? 15 : m.winner === 1 - teamASeat ? -15 : 0;
  return lv + won;
}
function matchPts(m, teamASeat) {
  // 每局:我方(相对对手)拿到的分差,按「我=闲家时正,我=庄家时负对手视角」
  // 简化口径:每局 (declSeat%2!==teamASeat ? defTotal : 200-defTotal-0)... 用净分:
  let s = 0;
  for (const r of m.rounds) {
    const iAmDef = r.declSeat % 2 !== teamASeat;
    s += iAmDef ? r.defTotal : -(r.defTotal);
  }
  return s / (m.rounds.length || 1);
}

module.exports = { roundArena, mean, sem };

/* 命令行入口 */
if (require.main === module) {
  const n = parseInt(process.argv[2] || '100', 10);
  const mk = require('../index.js');
  const mkA = () => mk(), mkB = () => mk();
  const t0 = Date.now();
  const r = roundArena(mkA, mkB, n, 12345);
  const dt = (Date.now() - t0) / 1000;
  console.log(`配对 n=${n} | 级差 ${r.lvlDiff.toFixed(4)} ±${r.lvlSem.toFixed(4)} (${r.sigma.toFixed(1)}σ) | ` +
    `净分 ${r.ptsDiff.toFixed(1)} ±${r.ptsSem.toFixed(1)} | 违规 A/B ${r.violA}/${r.violB} | 兜底 A/B ${r.fbA}/${r.fbB} | ${dt.toFixed(1)}s`);
  if (Math.abs(r.lvlDiff) < 1e-12 && r.violA === 0 && r.violB === 0) console.log('✓ 同版本对打:配对差值恰好为 0');
}
