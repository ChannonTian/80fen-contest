'use strict';

const { createStrategy } = require('./strategy');

module.exports = () => {
  const strategy = createStrategy();
  return {
    name: 'gpt-5.6-sol',
    onDeal: strategy.onDeal,
    onRebel: strategy.onRebel,
    discard: strategy.discard,
    lead: strategy.lead,
    follow: strategy.follow,
  };
};
