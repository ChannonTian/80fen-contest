'use strict';
const A = require('./arena.js');
const { makeAI } = require('../strategy.js');
const f = () => makeAI();
const g = () => makeAI();          // 同一个版本的两个实例
const t0 = Date.now();
const r = A.roundArena(f, g, 300, 1);
console.log(A.fmt(r, '校准(自己 vs 自己):'));
console.log('耗时', Date.now() - t0, 'ms');
if (r.lvl !== 0 || r.np !== 0 || r.diffRate !== 0) { console.log('!! 跑分器有偏,必须先修 !!'); process.exitCode = 1; }
else console.log('✓ 配对差值恰好为 0,跑分器无偏');
