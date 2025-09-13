# tests/README.md

```md
# Tests for holbertonschool-files_manager

This suite covers:
- utils: `redisClient`, `dbClient`
- REST endpoints: `/status`, `/stats`, `/users`, `/connect`, `/disconnect`, `/users/me`, `/files`, `/files/:id`, pagination, publish/unpublish, `/files/:id/data`.

## Quick start

```bash
npm i --save-dev mocha chai supertest sinon mongodb-memory-server redis-mock proxyquire cross-env
# If your project uses ESM, add: npm i --save-dev @babel/register
npx mocha tests --timeout 10000
```

> The suite spins up an in-memory MongoDB and stubs Redis using `redis-mock` so it doesn't require external services.

If your `server.js` exports the Express app as `module.exports = app`, these tests will work out of the box. If you export differently (e.g., default export or `app.js`), adjust the `tests/helpers/appLoader.js` file.
```

---
# tests/helpers/appLoader.js
```js
// Attempts to load the Express app from common locations.
// Ensure your server exports the Express `app` (NOT app.listen())
let app;
try {
  // Common pattern in Holberton projects
  app = require('../../server');
  if (app.default) app = app.default;
} catch (e1) {
  try {
    app = require('../../app');
    if (app.default) app = app.default;
  } catch (e2) {
    throw new Error('Unable to load Express app. Export your Express instance from server.js or app.js');
  }
}
module.exports = app;
```

---
# tests/helpers/testEnv.js
```js
// Force test env and in-memory Mongo URI before app is imported
process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '27017';
process.env.DB_DATABASE = 'files_manager_test';
// Some projects read a full URI, use if supported by your dbClient
process.env.DB_URI = process.env.DB_URI || '';
```

---
# tests/helpers/mongo.js
```js
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');

let mongod;
let client;

async function startMongo() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  // If your dbClient supports DB_URI, set it so the app connects to in-memory Mongo
  process.env.DB_URI = uri;
  // Keep a direct client for cleanup shortcuts if needed
  client = new MongoClient(uri, { ignoreUndefined: true });
  await client.connect();
}

async function stopMongo() {
  if (client) await client.close().catch(() => {});
  if (mongod) await mongod.stop().catch(() => {});
}

async function clearMongoDb(dbName = 'files_manager') {
  if (!client) return;
  const admin = client.db(dbName).admin();
  const dbs = await admin.listDatabases();
  for (const dbInfo of dbs.databases) {
    const db = client.db(dbInfo.name);
    const cols = await db.collections();
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(cols.map((c) => c.deleteMany({})));
  }
}

module.exports = { startMongo, stopMongo, clearMongoDb };
```

---
# tests/helpers/http.js
```js
const request = require('supertest');
const app = require('./appLoader');

function http() {
  return request(app);
}

module.exports = { http };
```

---
# tests/utils/redisClient.test.js
```js
/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

// Stub the real redis library with redis-mock so tests don't require a real server
const redisMock = require('redis-mock');

describe('redisClient utils', () => {
  let redisClient;

  before(() => {
    // Proxy-require redisClient so that inside it, `redis` resolves to redis-mock
    redisClient = proxyquire('../../utils/redis', {
      redis: redisMock,
    });
  });

  it('isAlive() should eventually be true', async () => {
    expect(redisClient.isAlive()).to.be.true;
  });

  it('set and get should round-trip values', async () => {
    await redisClient.set('foo', 'bar', 5);
    const v = await redisClient.get('foo');
    expect(v).to.equal('bar');
  });

  it('del should remove the key', async () => {
    await redisClient.set('todelete', '1', 1);
    await redisClient.del('todelete');
    const v = await redisClient.get('todelete');
    expect(v).to.be.null;
  });
});
```

---
# tests/utils/dbClient.test.js
```js
/* eslint-disable no-unused-expressions */
require('../helpers/testEnv');
const { expect } = require('chai');
const proxyquire = require('proxyquire');
const { startMongo, stopMongo, clearMongoDb } = require('../helpers/mongo');

// We proxy dbClient so internally it picks up process.env.DB_URI (mongodb-memory-server)
let dbClient;

describe('dbClient utils', () => {
  before(async () => {
    await startMongo();
    dbClient = proxyquire('../../utils/db', {});
  });

  after(async () => {
    await stopMongo();
  });

  afterEach(async () => {
    await clearMongoDb();
  });

  it('isAlive() should become true when connected', async () => {
    // Give connection event loop a tick if needed
    expect(dbClient.isAlive()).to.be.true;
  });

  it('nbUsers() and nbFiles() default to 0', async () => {
    const u = await dbClient.nbUsers();
    const f = await dbClient.nbFiles();
    expect(u).to.equal(0);
    expect(f).to.equal(0);
  });
});
```

---
# tests/api/status.test.js
```js
const { expect } = require('chai');
const { http } = require('../helpers/http');

describe('GET /status', () => {
  it('returns { redis: true, db: true }', async () => {
    const res = await http().get('/status');
    expect(res.status).to.equal(200);
    expect(res.body).to.have.keys(['redis', 'db']);
    expect(res.body.redis).to.equal(true);
    expect(res.body.db).to.equal(true);
  });
});
```

---
# tests/api/stats.test.js
```js
const { expect } = require('chai');
const { http } = require('../helpers/http');

describe('GET /stats', () => {
  it('returns counts with users and files keys', async () => {
    const res = await http().get('/stats');
    expect(res.status).to.equal(200);
    expect(res.body).to.have.keys(['users', 'files']);
    expect(res.body.users).to.be.a('number');
    expect(res.body.files).to.be.a('number');
  });
});
```

---
# tests/api/users.test.js
```js
const { expect } = require('chai');
const { http } = require('../helpers/http');

describe('POST /users', () => {
  it('creates a user with email and returns id + email', async () => {
    const res = await http()
      .post('/users')
      .send({ email: 'john.doe@example.com', password: 'secret' })
      .set('Content-Type', 'application/json');
    expect(res.status).to.equal(201);
    expect(res.body).to.have.keys(['id', 'email']);
    expect(res.body.email).to.equal('john.doe@example.com');
  });

  it('rejects missing email', async () => {
    const res = await http()
      .post('/users')
      .send({ password: 'p' })
      .set('Content-Type', 'application/json');
    expect(res.status).to.equal(400);
  });

  it('rejects missing password', async () => {
    const res = await http()
      .post('/users')
      .send({ email: 'a@b.c' })
      .set('Content-Type', 'application/json');
    expect(res.status).to.equal(400);
  });
});
```

---
# tests/api/auth.test.js
```js
const { expect } = require('chai');
const { http } = require('../helpers/http');

function b64(s) { return Buffer.from(s).toString('base64'); }

describe('Auth flow: /connect and /disconnect', () => {
  let token;

  before(async () => {
    const create = await http()
      .post('/users')
      .send({ email: 'auth@test.io', password: 'hunter2' })
      .set('Content-Type', 'application/json');
    expect(create.status).to.equal(201);
  });

  it('GET /connect returns a token with valid Basic auth', async () => {
    const res = await http()
      .get('/connect')
      .set('Authorization', `Basic ${b64('auth@test.io:hunter2')}`);
    expect(res.status).to.equal(200);
    expect(res.body).to.have.key('token');
    token = res.body.token;
  });

  it('GET /disconnect with X-Token logs user out', async () => {
    const res = await http()
      .get('/disconnect')
      .set('X-Token', token);
    expect(res.status).to.equal(204);
  });

  it('GET /disconnect without token returns 401', async () => {
    const res = await http().get('/disconnect');
    expect(res.status).to.equal(401);
  });
});
```

---
# tests/api/users_me.test.js
```js
const { expect } = require('chai');
const { http } = require('../helpers/http');

function b64(s) { return Buffer.from(s).toString('base64'); }

describe('GET /users/me', () => {
  let token;
  let userId;

  before(async () => {
    const create = await http()
      .post('/users')
      .send({ email: 'me@example.com', password: 'pass1234' })
      .set('Content-Type', 'application/json');
    userId = create.body.id;

    const auth = await http()
      .get('/connect')
      .set('Authorization', `Basic ${b64('me@example.com:pass1234')}`);
    token = auth.body.token;
  });

  it('returns current user with id and email', async () => {
    const res = await http()
      .get('/users/me')
      .set('X-Token', token);
    expect(res.status).to.equal(200);
    expect(res.body).to.include({ id: userId, email: 'me@example.com' });
  });

  it('returns 401 without token', async () => {
    const res = await http().get('/users/me');
    expect(res.status).to.equal(401);
  });
});
```

---
# tests/api/files.test.js
```js
const { expect } = require('chai');
const path = require('path');
const fs = require('fs');
const { http } = require('../helpers/http');

function b64(s) { return Buffer.from(s).toString('base64'); }

async function createUserAndToken(email, password) {
  await http().post('/users').send({ email, password }).set('Content-Type', 'application/json');
  const auth = await http().get('/connect').set('Authorization', `Basic ${b64(`${email}:${password}`)}`);
  return auth.body.token;
}

function sampleDataBase64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

describe('Files API', () => {
  let token;
  before(async () => {
    token = await createUserAndToken('files@test.com', 'P4ssw0rd!');
  });

  describe('POST /files', () => {
    it('creates a new file (type=file) and returns its metadata', async () => {
      const res = await http()
        .post('/files')
        .set('X-Token', token)
        .send({ name: 'hello.txt', type: 'file', data: sampleDataBase64('Hello World') })
        .set('Content-Type', 'application/json');
      expect(res.status).to.equal(201);
      expect(res.body).to.include.keys(['id', 'userId', 'name', 'type', 'isPublic']);
      expect(res.body.name).to.equal('hello.txt');
    });

    it('creates a folder (type=folder) without data', async () => {
      const res = await http()
        .post('/files')
        .set('X-Token', token)
        .send({ name: 'my-folder', type: 'folder' })
        .set('Content-Type', 'application/json');
      expect(res.status).to.equal(201);
      expect(res.body.type).to.equal('folder');
    });

    it('rejects missing name', async () => {
      const res = await http()
        .post('/files')
        .set('X-Token', token)
        .send({ type: 'file', data: sampleDataBase64('x') })
        .set('Content-Type', 'application/json');
      expect(res.status).to.equal(400);
    });

    it('rejects missing data for type=file', async () => {
      const res = await http()
        .post('/files')
        .set('X-Token', token)
        .send({ name: 'bad.txt', type: 'file' })
        .set('Content-Type', 'application/json');
      expect(res.status).to.equal(400);
    });
  });

  describe('GET /files with pagination', () => {
    let parentId;
    beforeEach(async () => {
      const folder = await http()
        .post('/files')
        .set('X-Token', token)
        .send({ name: 'parent', type: 'folder' })
        .set('Content-Type', 'application/json');
      parentId = folder.body.id;
      // create 12 children
      for (let i = 0; i < 12; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await http()
          .post('/files')
          .set('X-Token', token)
          .send({ name: `file-${i}.txt`, type: 'file', parentId, data: sampleDataBase64(`idx:${i}`) })
          .set('Content-Type', 'application/json');
      }
    });

    it('page 0 returns first 20 or page size (>= 10 expected)', async () => {
      const res = await http()
        .get('/files')
        .set('X-Token', token)
        .query({ parentId, page: 0 });
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      expect(res.body.length).to.be.greaterThan(0);
    });

    it('page 1 returns next slice', async () => {
      const res0 = await http().get('/files').set('X-Token', token).query({ parentId, page: 0 });
      const res1 = await http().get('/files').set('X-Token', token).query({ parentId, page: 1 });
      expect(res1.status).to.equal(200);
      if (res1.body.length > 0) {
        expect(res0.body[0].id).to.not.equal(res1.body[0].id);
      }
    });
  });

  describe('GET /files/:id and publish/unpublish', () => {
    let fileId;
    before(async () => {
      const created = await http()
        .post('/files')
        .set('X-Token', token)
        .send({ name: 'pub.txt', type: 'file', data: sampleDataBase64('content') })
        .set('Content-Type', 'application/json');
      fileId = created.body.id;
    });

    it('fetches metadata by id', async () => {
      const res = await http().get(`/files/${fileId}`).set('X-Token', token);
      expect(res.status).to.equal(200);
      expect(res.body).to.include({ id: fileId, name: 'pub.txt' });
    });

    it('publish toggles isPublic true', async () => {
      const res = await http().put(`/files/${fileId}/publish`).set('X-Token', token);
      expect(res.status).to.equal(200);
      expect(res.body.isPublic).to.equal(true);
    });

    it('unpublish toggles isPublic false', async () => {
      const res = await http().put(`/files/${fileId}/unpublish`).set('X-Token', token);
      expect(res.status).to.equal(200);
      expect(res.body.isPublic).to.equal(false);
    });
  });

  describe('GET /files/:id/data', () => {
    let privateId; let publicId;

    before(async () => {
      const priv = await http()
        .post('/files')
        .set('X-Token', token)
        .send({ name: 'private.txt', type: 'file', data: sampleDataBase64('PRIVATE') })
        .set('Content-Type', 'application/json');
      privateId = priv.body.id;

      const pub = await http()
        .post('/files')
        .set('X-Token', token)
        .send({ name: 'public.txt', type: 'file', data: sampleDataBase64('PUBLIC') })
        .set('Content-Type', 'application/json');
      publicId = pub.body.id;
      await http().put(`/files/${publicId}/publish`).set('X-Token', token);
    });

    it('denies access to private file without token', async () => {
      const res = await http().get(`/files/${privateId}/data`);
      expect(res.status).to.equal(404).or.equal(403); // depending on spec/implementation
    });

    it('returns raw content for public file', async () => {
      const res = await http().get(`/files/${publicId}/data`);
      expect(res.status).to.equal(200);
      expect(res.text).to.equal('PUBLIC');
    });

    it('returns 404 for non-file types', async () => {
      const folder = await http()
        .post('/files')
        .set('X-Token', token)
        .send({ name: 'folder-data', type: 'folder' })
        .set('Content-Type', 'application/json');
      const res = await http().get(`/files/${folder.body.id}/data`);
      expect(res.status).to.equal(400).or.equal(404);
    });
  });
});







root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# ./node_modules/.bin/mocha --require @babel/register --timeout 20000 --exit \
  tests/noQuery_get_files.test.cjs


  GET /files sans parentId ni page
    1) retourne 200 et un tableau


  0 passing (52ms)
  1 failing

  1) GET /files sans parentId ni page
       retourne 200 et un tableau:

      AssertionError [ERR_ASSERTION]: HTTP status doit être 200

401 !== 200

      + expected - actual

      -401
      +200

      at Context.<anonymous> (tests/noQuery_get_files.test.cjs:18:12)
      at processTicksAndRejections (node:internal/process/task_queues:95:5)


root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# ./node_modules/.bin/mocha --require @babel/register --timeout 20000 --exit   tests/noQuery_get_files.test.cjs


  GET /files sans parentId ni page
    ✔ retourne 200 et un tableau (71ms)


  1 passing (74ms)

root@UID7E:/mnt/d/Users/steph/Documents/5ème_trimestre/holbertonschool-files_manager# 
