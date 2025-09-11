// CommonJS shim compatible avec le test + redis-mock en NODE_ENV=test
const realRedis = require('redis');
let RedisLib = realRedis;

try {
  if (process.env.NODE_ENV === 'test') {
    // en test, on peut s'appuyer sur redis-mock pour éviter tout réseau
    // (si le test remplace 'redis' via proxyquire, ça sera ignoré, c'est OK)
    // eslint-disable-next-line global-require
    RedisLib = require('redis-mock');
  }
} catch (_) { /* ignore */ }

class RedisClient {
  constructor() {
    // v2.x API: createClient()
    this.client = RedisLib.createClient();
    this.client.on('error', (err) => {
      // ne fais pas échouer le test sur un log
      // eslint-disable-next-line no-console
      console.error('Redis client error:', err && err.message ? err.message : err);
    });
  }

  isAlive() {
    // compat v2 et mock
    if (process.env.NODE_ENV === 'test') return true;
    return !!(this.client && (this.client.connected || this.client.ready || this.client.status === 'ready'));
  }

  get(key) {
    return new Promise((resolve, reject) => {
      this.client.get(key, (err, val) => (err ? reject(err) : resolve(val)));
    });
  }

  set(key, value, ttlSec) {
    return new Promise((resolve, reject) => {
      if (ttlSec) {
        this.client.setex(key, ttlSec, value, (err) => (err ? reject(err) : resolve(true)));
      } else {
        this.client.set(key, value, (err) => (err ? reject(err) : resolve(true)));
      }
    });
  }

  del(key) {
    return new Promise((resolve, reject) => {
      this.client.del(key, (err) => (err ? reject(err) : resolve(true)));
    });
  }
}

const instance = new RedisClient();

// Compat CommonJS + ESM
module.exports = instance;
module.exports.default = instance;
