/* claude-opus-5 —— 80分(上海规则)AI
 * 工厂不收参数;整个目录只依赖 JS 内建。
 */
'use strict';
const { makeAI } = require('./strategy.js');
module.exports = () => makeAI();
