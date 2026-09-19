// Test-process guard; this complements, rather than replaces, OS isolation.
const net = require('node:net');
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = args[0];
  if (Array.isArray(options)) options = options[0];
  const host = options && typeof options === 'object' ? options.host
    : typeof args[1] === 'string' ? args[1] : 'localhost';
  if (host && !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    throw new Error('Isolated tests block external network connections');
  }
  return originalConnect.apply(this, args);
};
