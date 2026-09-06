# PROGRESS.md — kimi-k3 迭代日志

## 现在在哪
- **已交付,任务完成。** 三条停止标准全部满足:① §S5 自测 96/96 全过;② robust.js 100 场 = 3188 局,0 违规、0 甩牌被吃、0 异常(单座场均 6.7ms);③ R31–R38 连续 8 轮无量到进步,横跨全部五个决策点,且 R30 后做过 analyze.js 全局复盘确认非局部微调。
- 交付自查(dev/deliver-check.js)全过:隔离加载 index.js,五方法 × 多情形(有主/无主/绝门/拖拉机/长甩牌/残手)输出全部合法。
- 交付物 = `submissions/kimi-k3/` 的 index.js + engine.js + strategy.js + NOTES.md + PROGRESS.md。
- ⚠️ repo 预置的 `submissions/claude-opus-5/`(moves.js、dev/、旧 NOTES.md 等)**不是我写的,没有读过内容、没有使用**;排查时误看其 moves.js 头 20 行,已在 NOTES.md 文末声明。任务早期交付物曾按任务书写进该目录,发现预置内容后已整体迁至 `submissions/kimi-k3/`,claude-opus-5 全部文件用 git 恢复原样。我的 require 链只有 index→strategy→engine。
- ⚠️ 顶层 `dev/` 是我的开发工具(未跟踪);README 规定 PR 别动 submissions/ 以外的文件,提 PR 时别把 dev/ 包进去。

## 文件布局
- `submissions/kimi-k3/engine.js` — 规则引擎(§S3 八判定 + findLegalFollow + 亮主/造反/定庄/关卡推进)。裁判与策略共用,无依赖纯 JS。
- `submissions/kimi-k3/strategy.js` — AI。CFG 开关制,默认值=当前 baseline;`index.js` 入口 = strategy 工厂,name='kimi-k3'。
- `dev/selftest.js` — §S5 全部向量,96 断言。
- `dev/runner.js` — 对局循环。deck=hash(seed,round,redeal);切牌、逐张发牌亮主(发完后最多4圈窗口,从 firstTaker 起)、造反(只问庄家对方队、从庄家下家起、maxRedeal=3、重发按无庄局)、扣底(非法罚40)、打墩打到手牌耗尽(非法跟牌罚 5×张数并替出 findLegalFollow;非法领出罚 5×尝试张数替出最小单张;甩牌被吃只出最小组不罚)、结算(罚分进闲家总分后 clamp [0,200])、advanceMatch(gates [2,5,10,13])。
- `dev/scorer.js` — pairedCompare(A,B,seeds):每 seed 打两场(A在team0/B在team1 + 交换),diff=[fA1+fA2]-[fB1+fB2];输出 dLevel/dWin 均值±SE、胜率、罚分/局、行为不同率、耗时。
- `dev/compare.js` — 用法:`cd dev && node compare.js '<A的overridesJson>' <seeds> '<B的overridesJson>'`。
- `dev/robust.js` — 随机种子压力跑,查违规/异常。
- `dev/analyze.js` — 自我对打损失来源统计(分丢在哪个阶段/牌型/身份/墩)。

## 试过什么(一行一条;基线逐级滚动,留的进 CFG 默认值)
- R1 minWin(能赢时用最小赢牌):**留** +20.5±0.5。dWin +2.0。基线"最大牌压"烧牌太快。
- R2 partnerPoints(队友赢时添分):**留** +13.4±1.2。
- R3 discardV1(绝门/留A/留对子):**退**。40 seeds +1.0±1.35 → 150 seeds +0.22±0.66,量不出。
- R3b buryPoints(分埋底):**退** -0.3±1.2,底分被翻倍抠,方向错。
- R4 cheapDump(输墩垫非分):**留** +2.15±0.96。
- R5 leadV1(先副A+主强抽主):**退** -6.2±1.1;拆开 leadAce -3.9±1.1,leadTrumpPull +1.0±1.1 量不出。
- R6 leadV2(领拖拉机/大对子):**留** +8.6±1.2。⚠️ 此轮发现 runner 大 bug:§S2"25 墩"在多牌领出下不成立,改成打到手牌耗尽(规则书的洞,已记 NOTES)。
- R7 throwLead(安全甩牌,用 history 算对手剩余牌):**留** +9.35±1.05。
- R8 leadTrumpPull 新基线复测:**退** -2.4±1.1。
- R9a 关掉恒造反:**退** -2.75±1.1 → 恒造反是对的,保留。R9b 王对反无主(nT≤5):**退** -2.0±1.1。
- R10 pairLeadAny(任意对子都领):**留** +5.4±1.2。
- R11 throwRisk1(甩牌单张允许1天敌):**退** -2.4±1.4。
- R12 leadLowFromLong:**退** -0.35±1.33。R13 declareLen 4/6:**量不出**,维持5。
- R14 ruffMinPts=10(不毙小分墩):**退** -3.1±1.3。R15 safePoints(添分查保险):**退** -5.5±1.5。教训:这游戏奖励激进。
- R16 不亮单张:**量不出** -0.08±1.28。R17 对子反主要求门长≥4:**量不出** -0.08±0.30。
- R18 leadKnownWinners(必赢单张):**退** +0.5±1.07。R19 leadTrumpComps(主对子/拖拉机也领):**留** +4.4±1.4。
- R20 leadPartnerVoid(领队友绝门搭桥):**退** +0.6±1.0。R21 avoidOppVoid:**退** +0.55±0.95。
- R22 overRuffCare(防超毙):**退** -0.8±0.5。R23 dumpToVoid(垫最短门):**退** -1.1±1.1。R24 trumpLast(垫牌不动主):**留** +2.65±1.1。
- R25 partnerPointsLow(添分先给5):**退** -6.1±1.25。添分就要往大里添。
- R26 declareLenND=3(未定庄前降低单张亮主门长):**退** +0.15±1.04 噪声。
- R27 declareJokerND(未定庄前王对直接亮无主):**退** 0±0.1,几乎不触发。
- R28 minWinNoBreak(最小赢牌不拆对):**退** -0.08±0.75 噪声。
- R29 endgameLeadT(手牌≤2 领最大主守底):**退** -0.58±0.77。
- R30 discardV2(扣底:最短副门整门优先扣,suitLen asc→points asc→ord asc):**留** +6.9±1.28 @40 → 确认 **+6.7±0.74 @150**,胜率 73%,行为不同率 97%。
- R31 lastWinBig(末墩最大赢牌防超毙):**退**。构造性无效:每墩四家出同张数,末墩 hand.len===leadCl.len,全手牌被迫出,行为不同率 0%。教训:末墩结果在领出前已定,杠杆在倒数第二墩。
- R32 discardV3(扣底留A):**退** -2.15±1.48。留 A 破坏绝门,负。
- R33 discardV4(同长度门按门内总分先扣):**退** +0.05±0.51 @150,量不出。
- R34 leadTrumpOnlyDecl(主组件仅庄家方领):**退** +1.3±1.11 @40 → +0.48±0.65 @150,量不出。
- R35 leadShortLate(残局领最短副门造绝门):**退** -0.18±1.37,噪声偏负。
- R36 pairDeclareLen=6(新亮级数对要求门长):**退** +0.007±0.238 @150,量不出。
- R37 tractorLenFirst(拖拉机按长度领):**退**。行为不同率 3%,多拖拉机选择太稀有,量不到。
- R38 pairDeclareBest(多对级数对选最长门亮):**退**。行为不同率 0%,一手两张不同花级数对不存在。

## 当前 baseline(累计 9 留,即交付版)
CFG=true: minWin, partnerPoints, cheapDump, leadV2, throwLead, pairLeadAny, leadTrumpComps, trumpLast, discardV2。
其余全 false / 默认(declareLen=5, ruffMinPts=0)。
最终全局复盘(40 seeds,1311 局,19901 墩):闲家≥80 占 55%,A+0 占 39%;单张领出占 56% 胜率 23%;对子 26% 胜率 65%;甩牌 16% 胜率 87%;拖拉机 2% 胜率 95%;末墩闲家赢率 43%,底均 7.9 分,抠底发生时均进账 19.5 分;平均每局 15.2 墩。

## 下一步候选(停止标准已满足,以下仅供未来参考)
1. 倒数第二墩的守底/抢底布局(末墩本身无决策空间,见 R31)。
2. follow 评分化(候选打分取代规则分支)——但所有组件单独测均为负/噪声,预期收益低。

## 卡住的地方
- 单张领出选择(占 56% 墩,胜率 23%):试过 A 先出/必赢张/长门小牌/避绝门/残局守底/残局造绝门,全部量不出或为负。判定为局部最优。
- 教训汇总:这游戏奖励激进;保守打法(不毙小分、添分查保险、添小分、不拆对、留A扣底)全是负的。

## 规则书歧义记录(详写进 NOTES.md)
- §S5「整场推进」表与「必打关卡」表在同输入下期望矛盾 → 整场推进按关卡关闭理解。
- 「非亮主者不可加固」→ 单列 canReinforce 前置条件;实际对局中别家不可能持有同花级数对,两解等价。
- 非法领出的罚分口径(罚尝试张数 vs 替出张数)、罚分与抠底倍数的结算顺序(clamp [0,200])是猜的。
- §S2「打 25 墩」在多牌领出下不成立(对子/拖拉机让手牌提前耗尽)→ runner 改成打到手牌耗尽。
- 亮主窗口从 firstTaker 起绕圈、切牌同点同王 tiebreak 用 id:是实现选择。
- §S5 没覆盖:甩牌被吃后的跟牌张数(我按缩减后的领出算);也没抓出 findLegalFollow 在"全对子手牌跟长甩牌"时填不满的 bug(已修,keepPairs 每对只拆一张导致填充不足)。
