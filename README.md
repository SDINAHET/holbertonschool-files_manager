# holbertonschool-files_manager

# Task 0
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
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager#  npm run dev 0_main.js

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
> nodemon --exec babel-node --presets @babel/preset-env 0_main.js

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
![alt text](<image (58).png>)

```bash
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npm run dev 0_main.js

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

# Task1

db.mjs
```js
// utils/db.mjs
import mongodb from 'mongodb';
const { MongoClient } = mongodb;

class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';

    this.dbName = database;
    this.connected = false;
    this.db = null;

    const url = `mongodb://${host}:${port}`;
    this.client = new MongoClient(url, { useUnifiedTopology: true });

    this.client.connect()
      .then(() => {
        this.db = this.client.db(this.dbName);
        this.connected = true;
      })
      .catch((err) => {
        console.error('MongoDB client error:', err && err.message ? err.message : err);
        this.connected = false;
      });
  }

  isAlive() {
    return this.connected === true;
  }

  async nbUsers() {
    if (!this.db) return 0;
    return this.db.collection('users').countDocuments();
  }

  async nbFiles() {
    if (!this.db) return 0;
    return this.db.collection('files').countDocuments();
  }
}

const dbClient = new DBClient();

export { DBClient };
export default dbClient;
```

```bash
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npm run dev 1_main.js

> files_manager@1.0.0 dev
> nodemon --exec babel-node --presets @babel/preset-env 1_main.js

[nodemon] 2.0.22
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): *.*
[nodemon] watching extensions: js,mjs,json
[nodemon] starting `babel-node --presets @babel/preset-env 1_main.js`
false
true
0
0
```

db.mjs
```bash
// utils/db.mjs
import mongodb from 'mongodb';

const { MongoClient } = mongodb;

class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';

    this.dbName = database;
    this.connected = false;
    this.db = null;

    const url = `mongodb://${host}:${port}`;
    this.client = new MongoClient(url);

    this.client.connect()
      .then(() => {
        this.db = this.client.db(this.dbName);
        this.connected = true;
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        // console.error('MongoDB client error:', err?.message || err);
        console.error('MongoDB client error:', (err && err.message) ? err.message : err);
        this.connected = false;
      });
  }

  isAlive() {
    return this.connected;
  }

  async nbUsers() {
    if (!this.db) return 0;
    return this.db.collection('users').countDocuments();
  }

  async nbFiles() {
    if (!this.db) return 0;
    return this.db.collection('files').countDocuments();
  }
}

const dbClient = new DBClient();

export { DBClient };
export default dbClient;
```


```bash
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npm run dev 1_main.js

> files_manager@1.0.0 dev
> nodemon --exec babel-node --presets @babel/preset-env 1_main.js

[nodemon] 2.0.22
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): *.*
[nodemon] watching extensions: js,mjs,json
[nodemon] starting `babel-node --presets @babel/preset-env 1_main.js`
false
(node:3482) [MONGODB DRIVER] Warning: Current Server Discovery and Monitoring engine is deprecated, and will be removed in a future version. To use the new Server Discover and Monitoring engine, pass option { useUnifiedTopology: true } to the MongoClient constructor.
(Use `node --trace-warnings ...` to show where the warning was created)
true
0
0
^C
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npm list eslint
files_manager@1.0.0 /mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager
├─┬ eslint-config-airbnb-base@14.2.1
│ └── eslint@6.8.0 deduped
├─┬ eslint-plugin-import@2.32.0
│ └── eslint@6.8.0 deduped
├─┬ eslint-plugin-jest@22.21.0
│ ├─┬ @typescript-eslint/experimental-utils@1.13.0
│ │ └── eslint@6.8.0 deduped
│ └── eslint@6.8.0 deduped
└── eslint@6.8.0

root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npx eslint utils/db.mjs

/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager/utils/db.mjs
  25:52  error  Parsing error: Unexpected token .

✖ 1 problem (1 error, 0 warnings)

root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager#



root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npm run dev 1_main.js

> files_manager@1.0.0 dev
> nodemon --exec babel-node --presets @babel/preset-env 1_main.js

[nodemon] 2.0.22
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): *.*
[nodemon] watching extensions: js,mjs,json
[nodemon] starting `babel-node --presets @babel/preset-env 1_main.js`
false
(node:3754) [MONGODB DRIVER] Warning: Current Server Discovery and Monitoring engine is deprecated, and will be removed in a future version. To use the new Server Discover and Monitoring engine, pass option { useUnifiedTopology: true } to the MongoClient constructor.
(Use `node --trace-warnings ...` to show where the warning was created)
true
0
0
^C
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npx eslint utils/db.mjs

/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager/utils/db.mjs
  2:1  error  Expected 1 empty line after import statement not followed by another import  import/newline-after-import

✖ 1 problem (1 error, 0 warnings)
  1 error and 0 warnings potentially fixable with the `--fix` option.

root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npx eslint utils/db.mjs
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager#
```

# Task2

server.js
```js
// server.js
import express from 'express';
// import routes from './routes/index.js';
import routes from './routes/index';

const app = express();

// routes
app.use('/', routes);

const port = process.env.PORT || 5000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on port ${port}`);
});

export default app;

```

routes/index.js
```js
// routes/index.js
import { Router } from 'express';
// import AppController from '../controllers/AppController.js';
import AppController from '../controllers/AppController';

const router = Router();

router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);

export default router;

```

controllers/AppController.js
```js
// controllers/AppController.js
// import dbClient from '../utils/db.mjs';
// import redisClient from '../utils/redis.mjs';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AppController {
  static getStatus(req, res) {
    return res.status(200).json({
      redis: redisClient.isAlive(),
      db: dbClient.isAlive(),
    });
  }

  static async getStats(req, res) {
    try {
      const users = await dbClient.nbUsers();
      const files = await dbClient.nbFiles();
      return res.status(200).json({ users, files });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Stats error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default AppController;

```

Terminal1
```bash
npm run start-server
# -> Server running on port 5000

root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npm run start-server
# -> Server running on port 5000

> files_manager@1.0.0 start-server
> nodemon --exec babel-node --presets @babel/preset-env ./server.js

[nodemon] 2.0.22
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): *.*
[nodemon] watching extensions: js,mjs,json
[nodemon] starting `babel-node --presets @babel/preset-env ./server.js`
(node:4361) [MONGODB DRIVER] Warning: Current Server Discovery and Monitoring engine is deprecated, and will be removed in a future version. To use the new Server Discover and Monitoring engine, pass option { useUnifiedTopology: true } to the MongoClient constructor.
(Use `node --trace-warnings ...` to show where the warning was created)
Server running on port 5000
```

Terminal2
```bash
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# curl 0.0.0.0:5000/status
{"redis":true,"db":true}
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# curl 0.0.0curl 0.0.0.0:5000/stats
{"users":0,"files":0}
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager#

root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager#  curl 0.0.0.0:5000/status ; echo ""5000/status ; echo ""
{"redis":true,"db":true}
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# curl 0.0.0.0:5000/stats ; echo ""
{"users":0,"files":0}
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager#
```

Pour tester uniquement les 3 fichiers (server.js, routes/index.js, controllers/AppController.js) avec ESLint, il te suffit de lancer :

```bash
npx eslint server.js routes/index.js controllers/AppController.js
```
Si tu veux aussi corriger automatiquement les erreurs simples :
```bash
npx eslint server.js routes/index.js controllers/AppController.js
```

```bash
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npx eslint server.js routes/index.js controllers/AppController.js

/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager/server.js
  3:20  error  Unexpected use of file extension "js" for "./routes/index.js"  import/extensions

/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager/routes/index.js
  3:27  error  Unexpected use of file extension "js" for "../controllers/AppController.js"  import/extensions

/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager/controllers/AppController.js
  2:22  error  Unexpected use of file extension "mjs" for "../utils/db.mjs"     import/extensions
  3:25  error  Unexpected use of file extension "mjs" for "../utils/redis.mjs"  import/extensions

✖ 4 problems (4 errors, 0 warnings)

root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npx eslint server.js routes/index.js controllers/AppController.js --fix

/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager/server.js
  3:20  error  Unexpected use of file extension "js" for "./routes/index.js"  import/extensions

/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager/routes/index.js
  3:27  error  Unexpected use of file extension "js" for "../controllers/AppController.js"  import/extensions

/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager/controllers/AppController.js
  2:22  error  Unexpected use of file extension "mjs" for "../utils/db.mjs"     import/extensions
  3:25  error  Unexpected use of file extension "mjs" for "../utils/redis.mjs"  import/extensions

✖ 4 problems (4 errors, 0 warnings)
```
```bash
correction
❌ Mauvais :

import routes from './routes/index.js';
import dbClient from '../utils/db.mjs';


✅ Correct :

import routes from './routes/index';
import dbClient from '../utils/db';
```

```bash
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npx eslint server.js routes/index.js controllers/AppController.js --fix
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager#
```

# Task3

routes/index.js
```bash
// routes/index.js
import { Router } from 'express';
import AppController from '../controllers/AppController';
import UsersController from '../controllers/UsersController';  // <-- ajouté task3

const router = Router();

router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);
router.post('/users', UsersController.postNew); // <-- ajouté task3

export default router;

```

controllers/UsersController.js
```bash
// controllers/UsersController.js
import crypto from 'crypto';
import dbClient from '../utils/db';

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body || {};

    if (!email) return res.status(400).json({ error: 'Missing email' });
    if (!password) return res.status(400).json({ error: 'Missing password' });

    try {
      if (!dbClient.db) return res.status(500).json({ error: 'Database not initialized' });

      const usersCol = dbClient.db.collection('users');

      const existing = await usersCol.findOne({ email });
      if (existing) return res.status(400).json({ error: 'Already exist' });

      const hashed = crypto.createHash('sha1').update(password).digest('hex');

      const result = await usersCol.insertOne({ email, password: hashed });

      return res.status(201).json({ id: result.insertedId.toString(), email });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('UsersController.postNew error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default UsersController;

```

server.js
```bash
// server.js
import express from 'express';
import routes from './routes/index';

const app = express();

// routes
app.use(express.json()); // <-- nécessaire pour lire req.body JSON  task3
app.use('/', routes);

const port = process.env.PORT || 5000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on port ${port}`);
});

export default app;

```


```bash
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npm run start-server
# Server running on port 5000

> files_manager@1.0.0 start-server
> nodemon --exec babel-node --presets @babel/preset-env ./server.js

[nodemon] 2.0.22
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): *.*
[nodemon] watching extensions: js,mjs,json
[nodemon] starting `babel-node --presets @babel/preset-env ./server.js`
(node:5720) [MONGODB DRIVER] Warning: Current Server Discovery and Monitoring engine is deprecated, and will be removed in a future version. To use the new Server Discover and Monitoring engine, pass option { useUnifiedTopology: true } to the MongoClient constructor.
(Use `node --trace-warnings ...` to show where the warning was created)
Server running on port 5000

```

```bash
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# curl 0.0.0.0:5000/users -XPOST -H "Content-Type: application/json" -d '{ "email": "bob@dylan.com", "password": "toto1234!" }' ; echo ""
{"id":"68b853b17fa64416588891c1","email":"bob@dylan.com"}
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# echo 'db.users.find()' | mongo files_manager
Command 'mongo' not found, did you mean:
  command 'mono' from deb mono-runtime (6.8.0.105+dfsg-3.2)
Try: apt install <deb name>
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager#

root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# mongosh "mongodb://localhost:27017/files_manager"
Current Mongosh Log ID: 68b855de277e60b4aee94969
Connecting to:          mongodb://localhost:27017/files_manager?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+2.3.4
Using MongoDB:          8.0.4
Using Mongosh:          2.3.4
mongosh 2.5.0 is available for download: https://www.mongodb.com/try/download/shell

For mongosh info see: https://www.mongodb.com/docs/mongodb-shell/

------
   The server generated these startup warnings when booting
   2025-09-03T13:44:10.913+02:00: Using the XFS filesystem is strongly recommended with the WiredTiger storage engine. See http://dochub.mongodb.org/core/prodnotes-filesystem
   2025-09-03T13:44:12.826+02:00: Access control is not enabled for the database. Read and write access to data and configuration is unrestricted
   2025-09-03T13:44:12.826+02:00: For customers running the current memory allocator, we suggest changing the contents of the following sysfsFile
   2025-09-03T13:44:12.826+02:00: We suggest setting the contents of sysfsFile to 0.
   2025-09-03T13:44:12.826+02:00: vm.max_map_count is too low
   2025-09-03T13:44:12.827+02:00: We suggest setting swappiness to 0 or 1, as swapping can cause performance problems.
------

files_manager> db.users.find().pretty()
[
  {
    _id: ObjectId('68b853b17fa64416588891c1'),
    email: 'bob@dylan.com',
    password: '89cad29e3ebc1035b29b1478a8e70854f25fa2b2'
  }
]
files_manager>


root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# echo 'db.users.find()' | mongosh f
iles_manager
Current Mongosh Log ID: 68b85624a591327f85e94969
Connecting to:          mongodb://127.0.0.1:27017/files_manager?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+2.3.4
Using MongoDB:          8.0.4
Using Mongosh:          2.3.4
mongosh 2.5.7 is available for download: https://www.mongodb.com/try/download/shell

For mongosh info see: https://www.mongodb.com/docs/mongodb-shell/

------
   The server generated these startup warnings when booting
   2025-09-03T13:44:10.913+02:00: Using the XFS filesystem is strongly recommended with the WiredTiger storage engine. See http://dochub.mongodb.org/core/prodnotes-filesystem
   2025-09-03T13:44:12.826+02:00: Access control is not enabled for the database. Read and write access to data and configuration is unrestricted
   2025-09-03T13:44:12.826+02:00: For customers running the current memory allocator, we suggest changing the contents of the following sysfsFile
   2025-09-03T13:44:12.826+02:00: We suggest setting the contents of sysfsFile to 0.
   2025-09-03T13:44:12.826+02:00: vm.max_map_count is too low
   2025-09-03T13:44:12.827+02:00: We suggest setting swappiness to 0 or 1, as swapping can cause performance problems.
------

files_manager> db.users.find()
[
  {
    _id: ObjectId('68b853b17fa64416588891c1'),
    email: 'bob@dylan.com',
    password: '89cad29e3ebc1035b29b1478a8e70854f25fa2b2'
  }
]
files_manager> root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager#

 root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# curl 0.0.0.0:5000/users -XPOST -H "Content-Type: application/json" -d '{ "email": "bob@dylan.com", "password": "toto1234!" }' ; echo ""
{"error":"Already exist"}
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# curl 0.0.0.0:5000/users -XPOST -H "Content-Type: application/json" -d '{ "email": "bob@dylan.com" }' ; echo ""
{"error":"Missing password"}
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager#
```

# Task4

routes/index.js
```bash
// routes/index.js
import { Router } from 'express';
import AppController from '../controllers/AppController';
import UsersController from '../controllers/UsersController';
import AuthController from '../controllers/AuthController';

const router = Router();

router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);

router.post('/users', UsersController.postNew);

router.get('/connect', AuthController.getConnect);
router.get('/disconnect', AuthController.getDisconnect);
router.get('/users/me', UsersController.getMe);

export default router;

```

controllers/AuthController.js
```bash
// controllers/AuthController.js
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AuthController {
  static async getConnect(req, res) {
    try {
      const authHeader = req.header('Authorization') || '';
      if (!authHeader.startsWith('Basic ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const base64Creds = authHeader.split(' ')[1];
      let decoded = '';
      try {
        decoded = Buffer.from(base64Creds, 'base64').toString('utf-8');
      } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const colonIndex = decoded.indexOf(':');
      if (colonIndex === -1) return res.status(401).json({ error: 'Unauthorized' });

      const email = decoded.slice(0, colonIndex);
      const password = decoded.slice(colonIndex + 1);
      const hashed = crypto.createHash('sha1').update(password).digest('hex');

      const user = await dbClient.db.collection('users').findOne({ email, password: hashed });
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const token = uuidv4();
      const key = `auth_${token}`;
      // TTL 24h
      await redisClient.set(key, user._id.toString(), 24 * 60 * 60);

      return res.status(200).json({ token });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('AuthController.getConnect error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getDisconnect(req, res) {
    try {
      const token = req.header('X-Token');
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const key = `auth_${token}`;
      const userId = await redisClient.get(key);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      await redisClient.del(key);
      return res.status(204).send();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('AuthController.getDisconnect error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default AuthController;

```

controllers/UsersController.js
```bash
// controllers/UsersController.js
import crypto from 'crypto';
import mongodb from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const { ObjectId } = mongodb;

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Missing email' });
    if (!password) return res.status(400).json({ error: 'Missing password' });

    try {
      const usersCol = dbClient.db.collection('users');
      const existing = await usersCol.findOne({ email });
      if (existing) return res.status(400).json({ error: 'Already exist' });

      const hashed = crypto.createHash('sha1').update(password).digest('hex');
      const result = await usersCol.insertOne({ email, password: hashed });
      return res.status(201).json({ id: result.insertedId.toString(), email });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('UsersController.postNew error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getMe(req, res) {
    try {
      const token = req.header('X-Token');
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const key = `auth_${token}`;
      const userId = await redisClient.get(key);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      let _id;
      try {
        _id = new ObjectId(userId);
      } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const user = await dbClient.db.collection('users').findOne({ _id });
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      return res.status(200).json({ id: user._id.toString(), email: user.email });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('UsersController.getMe error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default UsersController;

```

server.js
```bash
// server.js
import express from 'express';
import routes from './routes/index';

const app = express();
app.use(express.json());
app.use('/', routes);

const port = process.env.PORT || 5000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on port ${port}`);
});

export default app;

```

Terminal 1
```bash
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npm run start-server

> files_manager@1.0.0 start-server
> nodemon --exec babel-node --presets @babel/preset-env ./server.js

[nodemon] 2.0.22
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): *.*
[nodemon] watching extensions: js,mjs,json
[nodemon] starting `babel-node --presets @babel/preset-env ./server.js`
(node:9027) [MONGODB DRIVER] Warning: Current Server Discovery and Monitoring engine is deprecated, and will be removed in a future version. To use the new Server Discover and Monitoring engine, pass option { useUnifiedTopology: true } to the MongoClient constructor.
(Use `node --trace-warnings ...` to show where the warning was created)
Server running on port 5000

```

Terminal 2
```bash
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager#  curl 0.0.0.0:5000/connect -H "Authorization: Basic Ym9iQGR5bGFuLmNvbTp0b3RvMTIzNCE=" ; echo ""
{"token":"a7872877-5f98-4157-a743-4c6cde6b63e0"}
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager#  curl 0.0.0.0:5000/users/me -H "X-Token: a7872877-5f98-4157-a743-4c6cde6b63e0" ; echo ""
{"id":"68b853b17fa64416588891c1","email":"bob@dylan.com"}
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# curl 0.0.0.0:5000/disconnect -H "X-Token: a7872877-5f98-4157-a743-4c6cde6b63e0" ; echo ""

root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# curl 0.0.0.0:5000/users/me -H "X-Token: a7872877-5f98-4157-a743-4c6cde6b63e0" ; echo ""
{"error":"Unauthorized"}
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager#

root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npx eslint controllers/UsersController.js routes/index.js --fix
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager#
```

# Task5

routes/index.js
```bash
// routes/index.js
import { Router } from 'express';
import AppController from '../controllers/AppController';
import UsersController from '../controllers/UsersController';
import AuthController from '../controllers/AuthController';
import FilesController from '../controllers/FilesController'; // <-- add

const router = Router();

router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);

router.post('/users', UsersController.postNew);

router.get('/connect', AuthController.getConnect);
router.get('/disconnect', AuthController.getDisconnect);
router.get('/users/me', UsersController.getMe);

router.post('/files', FilesController.postUpload); // <-- add

export default router;
```

controllers/FilesController.js
```bash
// controllers/FilesController.js
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import mongodb from 'mongodb';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const { ObjectId } = mongodb;
const VALID_TYPES = new Set(['folder', 'file', 'image']);

class FilesController {
  static async postUpload(req, res) {
    try {
      // 1) Auth via X-Token -> userId en Redis
      const token = req.header('X-Token');
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      const userIdStr = await redisClient.get(`auth_${token}`);
      if (!userIdStr) return res.status(401).json({ error: 'Unauthorized' });

      let userId;
      try {
        userId = new ObjectId(userIdStr);
      } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // 2) Inputs
      const {
        name,
        type,
        parentId = 0,
        isPublic = false,
        data,
      } = req.body || {};

      if (!name) return res.status(400).json({ error: 'Missing name' });
      if (!type || !VALID_TYPES.has(type)) {
        return res.status(400).json({ error: 'Missing type' });
      }
      if (type !== 'folder' && !data) {
        return res.status(400).json({ error: 'Missing data' });
      }

      // 3) parentId validations
      let parentRef = 0;
      if (parentId && parentId !== 0 && parentId !== '0') {
        let parentObjId;
        try {
          parentObjId = new ObjectId(parentId);
        } catch (e) {
          return res.status(400).json({ error: 'Parent not found' });
        }

        const parentDoc = await dbClient.db.collection('files').findOne({ _id: parentObjId });
        if (!parentDoc) return res.status(400).json({ error: 'Parent not found' });
        if (parentDoc.type !== 'folder') {
          return res.status(400).json({ error: 'Parent is not a folder' });
        }
        parentRef = parentObjId;
      }

      // 4) Si dossier -> insert direct
      if (type === 'folder') {
        const doc = {
          userId,
          name,
          type,
          isPublic: Boolean(isPublic),
          parentId: parentRef === 0 ? 0 : parentRef,
        };

        const result = await dbClient.db.collection('files').insertOne(doc);
        return res.status(201).json({
          id: result.insertedId.toString(),
          userId: userId.toString(),
          name,
          type,
          isPublic: Boolean(isPublic),
          parentId: parentRef === 0 ? 0 : parentRef.toString(),
        });
      }

      // 5) Sinon (file|image) -> écrire en disque puis insert
      const folderPath = process.env.FOLDER_PATH && process.env.FOLDER_PATH.trim()
        ? process.env.FOLDER_PATH.trim()
        : '/tmp/files_manager';

      // Crée le dossier si absent
      await fs.mkdir(folderPath, { recursive: true });

      const localName = uuidv4();
      const localPath = path.join(folderPath, localName);

      // data est en Base64 → écrire en clair
      const fileBuffer = Buffer.from(data, 'base64');
      await fs.writeFile(localPath, fileBuffer);

      const doc = {
        userId,
        name,
        type,
        isPublic: Boolean(isPublic),
        parentId: parentRef === 0 ? 0 : parentRef,
        localPath,
      };

      const result = await dbClient.db.collection('files').insertOne(doc);

      return res.status(201).json({
        id: result.insertedId.toString(),
        userId: userId.toString(),
        name,
        type,
        isPublic: Boolean(isPublic),
        parentId: parentRef === 0 ? 0 : parentRef.toString(),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('FilesController.postUpload error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default FilesController;
```

Terminal 1
```bash
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# npm run start-server

> files_manager@1.0.0 start-server
> nodemon --exec babel-node --presets @babel/preset-env ./server.js

[nodemon] 2.0.22
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): *.*
[nodemon] watching extensions: js,mjs,json
[nodemon] starting `babel-node --presets @babel/preset-env ./server.js`
(node:9483) [MONGODB DRIVER] Warning: Current Server Discovery and Monitoring engine is deprecated, and will be removed in a future version. To use the new Server Discover and Monitoring engine, pass option { useUnifiedTopology: true } to the MongoClient constructor.
(Use `node --trace-warnings ...` to show where the warning was created)
Server running on port 5000

```

Terminal 2
```bash
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# curl 0.0.0.0:5000/connect -H "Authorization: Basic Ym9iQGR5bGFuLmNvbTp0b3RvMTIzNCE=" ; echo ""
{"token":"a4053096-bb40-4940-8c62-e7cdc146c504"}
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# curl -XPOST 0.0.0.0:5000/files -H "X-Token: a4053096-bb40-4940-8c62-e7cdc146c504" -H "Content-Type: application/json" -d '{ "name": "myText.txt", "type":
"file", "data": "SGVsbG8gV2Vic3RhY2shCg==" }' ; echo ""
{"id":"68b8cba5005c9d250bd0231d","userId":"68b853b17fa64416588891c1","name":"myText.txt","type":"file","isPublic":false,"parentId":0}
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# ls /tmp/files_manager/
a913195c-33c8-46e6-9726-f89693eaddab
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# cat /tmp/files_manager/a913195c-33c8-46e6-9726-f89693eaddab
Hello Webstack!
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# curl -XPOST 0.0.0.0:5000/files -H "X-Token: a4053096-bb40-4940-8c62-e7cdc146c504" -H "Content-Type: application/json" -d '{ "name": "images", "type": "fol
der" }' ; echo ""
{"id":"68b8cc78005c9d250bd0231e","userId":"68b853b17fa64416588891c1","name":"images","type":"folder","isPublic":false,"parentId":0}
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# cat image_upload.py
cat: image_upload.py: No such file or directory
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# cat image_upload.py
import base64
import requests
import sys

file_path = sys.argv[1]
file_name = file_path.split('/')[-1]

file_encoded = None
with open(file_path, "rb") as image_file:
    file_encoded = base64.b64encode(image_file.read()).decode('utf-8')

r_json = { 'name': file_name, 'type': 'image', 'isPublic': True, 'data': file_encoded, 'parentId': sys.argv[3] }
r_headers = { 'X-Token': sys.argv[2] }

r = requests.post("http://0.0.0.0:5000/files", json=r_json, headers=r_headers)
print(r.json())
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# python image_upload.py image.png f21fb953-16f9-46ed-8d9c-84c6450ec80f 5f1e881cc7ba06511e683b23
Command 'python' not found, did you mean:
  command 'python3' from deb python3
  command 'python' from deb python-is-python3
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# python3 image_upload.py image.png
f21fb953-16f9-46ed-8d9c-84c6450ec80f 5f1e881cc7ba06511e683b23
Traceback (most recent call last):
  File "/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager/image_upload.py", line 9, in <module>
    with open(file_path, "rb") as image_file:
FileNotFoundError: [Errno 2] No such file or directory: 'image.png'
root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# 
```

# Task6

```bash

```

```bash

```

# Task7

```bash

```

```bash

```

# Task8

```bash

```

```bash

```

# Task9

```bash

```

```bash

```
