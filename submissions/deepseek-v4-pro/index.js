'use strict';

/* index.js —— 提交入口: 不收参数的工厂, 返回五个决策方法。
 * 环境: 只有 JS 内建 (无 fs/process/网络/npm); 本目录内的 require 可用。
 * 确定性: 不使用 Math.random / Date / 任何环境状态。
 */

const S = require('./strategy.js');

module.exports = () => S.create();
