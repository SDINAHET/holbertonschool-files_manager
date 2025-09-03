# holbertonschool-files_manager

# Task 1
```bash
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npm run dev main.js

> files_manager@1.0.0 dev
> nodemon --exec babel-node --presets @babel/preset-env main.js

sh: 1: nodemon: not found
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npm install
npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
npm warn deprecated rimraf@2.6.3: Rimraf versions prior to v4 are no longer supported
npm warn deprecated har-validator@5.1.5: this library is no longer supported
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
npm warn deprecated debuglog@1.0.1: Package no longer supported. Contact Support at https://www.npmjs.com/support for more info.
npm warn deprecated glob@7.2.0: Glob versions prior to v9 are no longer supported
npm warn deprecated uuid@3.4.0: Please upgrade  to version 7 or higher.  Older versions may use Math.random() in certain circumstances, which is known to be problematic.  See https://v8.dev/blog/math-random for details.
npm warn deprecated request@2.88.2: request has been deprecated, see https://github.com/request/request/issues/3142
npm warn deprecated superagent@8.1.2: Please upgrade to superagent v10.2.2+, see release notes at https://github.com/forwardemail/superagent/releases/tag/v10.2.2 - maintenance is supported by Forward Email @ https://forwardemail.net
npm warn deprecated sinon@7.5.0: 16.1.1
npm warn deprecated eslint@6.8.0: This version is no longer supported. Please see https://eslint.org/version-support for other options.

added 691 packages, and audited 692 packages in 1m

137 packages are looking for funding
  run `npm fund` for details

17 vulnerabilities (4 low, 4 moderate, 7 high, 2 critical)

To address issues that do not require attention, run:
  npm audit fix

To address all issues possible (including breaking changes), run:
  npm audit fix --force

Some issues need review, and may require choosing
a different dependency.

Run `npm audit` for details.
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager#  npm run dev main.js

> files_manager@1.0.0 dev
> nodemon --exec babel-node --presets @babel/preset-env main.js

[nodemon] 2.0.22
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): *.*
[nodemon] watching extensions: js,mjs,json
[nodemon] starting `babel-node --presets @babel/preset-env main.js`
false
null
12
null
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager#  npm run dev main.js

> files_manager@1.0.0 dev
> nodemon --exec babel-node --presets @babel/preset-env main.js

[nodemon] 2.0.22
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): *.*
[nodemon] watching extensions: js,mjs,json
[nodemon] starting `babel-node --presets @babel/preset-env main.js`
false
null
12
null
```

redis.mjs
```bash
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
  isAlive() {
    return !!this.client && this.client.connected === true;
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

```


```bash
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npm run dev main.js

> files_manager@1.0.0 dev
> nodemon --exec babel-node --presets @babel/preset-env main.js

[nodemon] 2.0.22
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): *.*
[nodemon] watching extensions: js,mjs,json
[nodemon] starting `babel-node --presets @babel/preset-env main.js`
true
null
12
null
```
