### claude-opus-5 (max) + claude-code
~70% of weekly pro plan (with 50% more claude code quota) in ~6 hours

self-evaluated stats:
- input cache hit	345,436,239
- input	cache write 9,735,552
- input cache miss	2,162
- input total	≈ 355.2M
- output total	≈ 2.00M
- cache hit rate 97.3%. Each assistant took ~328k input token per turn.
- 445 tool use, incl. 438 bash (98%), ToolSearch 3、GitHub MCP 4.
- compaction = 1

Token
项	数量
缓存读取 input	345,436,239
缓存写入 input	9,735,552
未缓存 input	2,162
input 侧合计	≈ 355.2M
output	≈ 2.00M

缓存命中率 97.3%。每个 assistant 回合平均要过 ~328k input token(上下文很大,但几乎全走缓存)—— 这也是为什么 355M 的吞吐没有把周额度打爆。真正"新写"的只有 9.7M 缓存写入 + 2.0M 输出。
模型全程 claude-opus-5,1081 条 assistant 消息。

一个口径提醒:这是 API 层面的 token 计数,和你看到的"周额度百分比"不是同一个尺度(额度按写入/输出加权,缓存读取便宜得多)。我看不到账号侧的额度数字。

时间
项	
墙钟跨度	4 天 2 小时 20 分(08-31 12:24 → 09-04 14:44 UTC)
实际活跃时间	6 小时 07 分(相邻事件间隔 <10 分钟才计入)
工作块	9 段(被 session limit / quota 切开)
按天	08-31: 1081 事件 · 09-01: 23 · 09-04: 1171

活跃 6.1 小时 / 跨度 98 小时 = 占空比 6.2%,绝大部分是在等额度刷新。

交互
工具调用 445 次,其中 Bash 438 次(98.4%)、ToolSearch 3、GitHub MCP 4
用户侧记录 17 条,其中你真正发的话约 11 条 —— 其余是 /context、/compact 和压缩摘要
上下文压缩 1 次(09-04),靠 PROGRESS.md 无缝接上
产出
	行数
提交件(裁判加载的四个文件)	3,049
开发工具 dev/(36 个脚本)	2,447
冻结快照(baseline / yardstick / frozen)	6,475
文档(PROGRESS + NOTES)	898
git 提交	44(08-31: 17 / 09-01: 1 / 09-04: 25)
实验密度
DEFAULTS 里 112 个配置项:11 个布尔开关默认开、18 个默认关(试过、量过、没留下,代码留档)、83 个数值参数
PROGRESS.md 里记了 30 条带 σ 的测量、134 行表格
§S5 自测 98 条断言
最终验收单次就要打约 10,000 局(60 场整场 + 2100 副逐局 + 1100 局无主局 + 4200 副陈生风格 + 1040 个 fuzz view)

跑命令 3 小时 03 分(443 次 Bash,平均 24.8 秒/次)—— 这是容器在打牌:一次 vs-baseline.js 3000 就要跑 6000 场对局,单条命令 40 秒起;最长的单条 3 分 53 秒。
我生成 2 小时 49 分(1097 条消息)。这才是"我实际工作"的时长。
两者相加 5:52,和 6:15 的差(约 23 分钟)是消息往返和调度开销。

### gpt-5.6-sol (xhigh) + codex:


### deepseek-v4-pro (max) + deepseek-harness
approx. $6.9 in 2 hours.
14 turns · 426 steps| LLM 111m24s · Tool call 18m58s| TTFT avg 2.7s · 70 tok/s | 99.8% cache hit, 133M in, 386K out

self-evaluated stats:

| 项	| 数值 |
---
| 交付文件 |	5 个，共 1659 行（engine 458 / strategy 1066 / NOTES 49 / PROGRESS 76 / index 10）|
| 开发工具（不交付） |	8 个文件 1386 行（harness 461 / test-s5 293 / bench 179 / rollout 陪练 265 / analyze 77…）+ 6 个 baseline 快照 + 69 个 sweep 变体 |
| 规则自测 |	§S5 向量 92/92 |
| 跑分器 |	4 个口径（round/decl/match/matchnr），自校准差值恰好 0.000 |
| 违规/罚牌 | 全程累计压测 零违规、零罚牌（开发期踩过 3 次自己的 harness/引擎 bug，均修复后复验） |
| 性能 |	~9.4µs/调用；30 局整场 ~0.1s |
| PR |	#3 已合并；commit b0c6407，5 files / 1659 insertions，未触碰其他文件 |

二、迭代成果（口径：同一批牌交换阵营的配对差值）
31 轮记录在案；接受 5 个改动（v0→v5），退回/判噪声 20+ 个（每个都附 t 值）。
v0→v5 累计：每对场 +~1.1 胜场、+~11.6 级；对无脑参照 bot 30/30 全胜 +22 级。
自对弈庄家侧：闲家墩分 82→71，被上台率 62%→47%。
盲区排查三轴全胜：无脑参照 / 17 个风格变体 / 手写 rollout 陪练（+8.1 级，t=5.4）。
三、估算部分（我拿不到计费接口，只能按会话规模估）
Token / 费用：

我的回合约 50 轮，每轮重传整段上下文；上下文峰值约 30–40 万 tokens（长代码文件 + 大量 bench 输出）。
粗算累计输入 ≈ 600–800 万 tokens、输出 ≈ 40–50 万。
按 deepseek 常见单价（输入 
0.07
–
0.27
/
M
、输出
0.07–0.27/M、输出1.1/M）折算：约 $1.5–3.5，取决于缓存命中率。你 plan 的用量页是精确数，我这个只是量级参考。
顺带说明：sub-agent 两个各跑了一阵没交付（后来我亲手做的），那部分也计入你的用量，不在我上面的估算里。
用时：

墙钟窗口：今天 10:00（clone repo）→ 16:45 ≈ 6.7 小时（绝大部分是模型推理与等待，不是计算）。
纯计算（压测/跑分累计）：按每次 bench 输出的"用时"汇总 ≈ 5–10 分钟。
模拟规模（保守口径，1 对=2 场）：完整对局 ≥1.2 万场（约 40 万局），另加单局口径跑分约 2.5 万局。

### kimi-k3 (max) + kimi-code:


### z.ai-glm-5.3 (max) + zcode:
