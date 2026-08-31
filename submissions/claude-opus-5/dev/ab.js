/* 同一份 strategy.js 内部的 A/B:只改开关 */
'use strict';
const A = require('./arena.js');
const S = require('../strategy.js');
const n = parseInt(process.argv[2] || '400', 10);
const cfgA = JSON.parse(process.argv[3] || '{}');
const cfgB = JSON.parse(process.argv[4] || '{}');
const t0 = Date.now();
const r = A.roundArena(() => S.makeAI(cfgA), () => S.makeAI(cfgB), n, 1);
console.log(A.fmt(r, 'A=' + JSON.stringify(cfgA) + ' vs B=' + JSON.stringify(cfgB)), '| ' + (Date.now() - t0) + 'ms');
