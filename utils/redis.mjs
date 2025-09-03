// utils/redis.mjs
import redis from 'redis';
import { promisify } from 'util';

class RedisClient {
  constructor() {
    this.client = redis.createClient();

    // Log any Redis client errors
    this.client.on('error', (err) => {
      // Keep message succinct but useful
      console.error('Redis client error:', err && err.message ? err.message : err);
    });

    // Promisified commands
    this.getAsync = promisify(this.client.get).bind(this.client);
    this.setAsync = promisify(this.client.set).bind(this.client);
    this.delAsync = promisify(this.client.del).bind(this.client);
    this.expireAsync = promisify(this.client.expire).bind(this.client);
  }

  /**
   * Returns true if connected to Redis, otherwise false
   */
  // isAlive() {
  //   return !!this.client && this.client.connected === true;
  // }
  // Variante optionnelle (pas obligatoire pour Holberton)
  isAlive() {
    return !!this.client && (this.client.connected === true || this.client.ready === true);
  }

  /**
   * Get value for key
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  async get(key) {
    return this.getAsync(key);
  }

  /**
   * Set value for key with TTL (in seconds)
   * @param {string} key
   * @param {string|number} value
   * @param {number} duration seconds
   * @returns {Promise<void>}
   */
  async set(key, value, duration) {
    await this.setAsync(key, value);
    await this.expireAsync(key, Number(duration));
  }

  /**
   * Delete key
   * @param {string} key
   * @returns {Promise<void>}
   */
  async del(key) {
    await this.delAsync(key);
  }
}

const redisClient = new RedisClient();

export { RedisClient };
export default redisClient;
