require('../scripts/testing/block-external-network.cjs');
const net = require('node:net');
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (typeof args[0] === 'number') {
    if (typeof args[1] === 'string') args[1] = '127.0.0.1';
    else args.splice(1, 0, '127.0.0.1');
  } else if (args[0] && typeof args[0] === 'object' && 'port' in args[0]) {
    args[0] = {...args[0], host:'127.0.0.1'};
  }
  return listen.apply(this,args);
};
