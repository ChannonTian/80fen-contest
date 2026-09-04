/* 重入审计。
 *
 * 提速时往 engine/moves/strategy 里加了不少**模块级可变状态**(版本戳表、
 * 下标表、复用的走子手牌缓冲)。它们全都依赖同一个前提:**对应的函数不会
 * 自嵌套**。这个前提一旦破了,不会崩、不会报错,只会静默算错 —— 丢掉合法
 * 候选、或者走子读到别人的手牌。这类 bug 能藏到联赛跑一半。
 *
 * 光在导出对象上包一层是不够的:模块内部调用走的是局部函数名,绕过包装。
 * 所以这里把三个文件复制一份、在**函数体内部**插入深度计数,再跑对局。
 *
 * 用法:node dev/reent.js [副数]     改完核心代码后重跑一遍。
 */
'use strict';
const fs = require('fs'); const path = require('path'); const cp = require('child_process');
const SRC = path.join(__dirname, '..');
const OUT = path.join(__dirname, '.reent-tmp');
const TARGETS = {
  'engine.js': ['decompose', 'countPairsIn', 'longestTractor', 'isLegalFollow', 'followCtx', 'classify', 'resolveTrick'],
  'moves.js': ['genFollowCandidates', 'genFills', 'genInSuitParts', 'forceLegalFollow',
               'quickFollowOptions', 'quickLeadOptions', 'cheapFollow'],
  'strategy.js': ['leadV2', 'followV2', 'playoutValue', 'quickMove', 'rolloutPick',
                  'sampleWorlds', 'analyze', 'truncPlayout'],
};
const PRELUDE = "'use strict';\nglobal.__D = global.__D || {}; global.__M = global.__M || {};\n" +
  "function __in(n){ __D[n]=(__D[n]||0)+1; if(__D[n]>(__M[n]||0)) __M[n]=__D[n]; }\n" +
  "function __out(n){ __D[n]--; }";

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'dev'), { recursive: true });
for (const f of ['engine.js', 'moves.js', 'strategy.js', 'index.js']) {
  fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
}
for (const f of fs.readdirSync(path.join(SRC, 'dev'))) {
  const p = path.join(SRC, 'dev', f);
  if (fs.statSync(p).isFile()) fs.copyFileSync(p, path.join(OUT, 'dev', f));
}
for (const sub of ['baseline', 'yardstick', 'frozen']) {
  const d = path.join(SRC, 'dev', sub);
  if (!fs.existsSync(d)) continue;
  fs.mkdirSync(path.join(OUT, 'dev', sub), { recursive: true });
  for (const f of fs.readdirSync(d)) fs.copyFileSync(path.join(d, f), path.join(OUT, 'dev', sub, f));
}
let missing = 0;
for (const [f, fns] of Object.entries(TARGETS)) {
  const p = path.join(OUT, f);
  let s = fs.readFileSync(p, 'utf8').replace("'use strict';", PRELUDE);
  for (const fn of fns) {
    const m = new RegExp('\\nfunction ' + fn + '\\([^)]*\\) \\{\\n').exec(s);
    if (!m) { console.log('  ⚠ 未找到 ' + f + ':' + fn + '(改过名?)'); missing++; continue; }
    const at = m.index + m[0].length;
    s = s.slice(0, at) + "  __in('" + fn + "'); try {\n" + s.slice(at);
    const end = s.indexOf('\n}\n', at);
    s = s.slice(0, end) + "\n } finally { __out('" + fn + "'); }" + s.slice(end);
  }
  fs.writeFileSync(p, s);
}
const N = parseInt(process.argv[2] || '50', 10);
const runner = "const A=require('./dev/arena.js'), S=require('./strategy.js');" +
  "for(let d=0;d<" + N + ";d++) A.runOne(()=>S.makeAI(),()=>S.makeAI(),d,1,true);" +
  "console.log(JSON.stringify(global.__M||{}));";
const out = cp.execSync('node -e ' + JSON.stringify(runner), { cwd: OUT, encoding: 'utf8' });
const M = JSON.parse(out.trim().split('\n').pop());
let bad = 0;
for (const k of Object.keys(M).sort()) {
  const nest = M[k] > 1; if (nest) bad++;
  console.log('  ' + k.padEnd(22) + '最大自嵌套深度 ' + M[k] + (nest ? '  ← 会重入!' : ''));
}
fs.rmSync(OUT, { recursive: true, force: true });
console.log(bad === 0 && missing === 0
  ? '\n✓ ' + Object.keys(M).length + ' 个函数全部无自嵌套 —— 模块级临时表与复用缓冲安全'
  : '\n✗ 有问题:自嵌套 ' + bad + ' 个,插桩失败 ' + missing + ' 个');
