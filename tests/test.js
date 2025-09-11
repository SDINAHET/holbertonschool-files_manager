// tests/test.js
/* eslint-disable no-unused-expressions */
require('@babel/register'); // enable ES module import in project files

const { expect } = require('chai');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const redisMock = require('redis-mock');
const proxyquire = require('proxyquire');
const path = require('path');
const fs = require('fs');
const express = require('express');

let app;
let dbClient;      // actual instance loaded by the app
let redisClient;   // actual instance loaded by the app (with redis mocked)
let mongod;

/* ------------------------------ Helpers ------------------------------ */

// Base64
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const b64data = (s) => Buffer.from(s, 'utf8').toString('base64');

/**
 * Recursively find first file matching regex under a root directory.
 */
function findFirstMatch(rootDir, regex) {
  const stack = [rootDir];
  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch (e) { /* ignore unreadable dirs */ }
    for (let i = 0; i < entries.length; i += 1) {
      const ent = entries[i];
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.isFile() && regex.test(full)) {
        return full;
      }
    }
  }
  return null;
}

/**
 * Try requiring server/app and return exported Express app if any.
 * Redis is mocked globally via proxyquire when we require these entry files.
 */
function tryLoadExportedApp() {
  const candidates = ['../server.js', '../server', '../app.js', '../app'];
  for (let i = 0; i < candidates.length; i += 1) {
    try {
      // Stub the 'redis' package everywhere this module graph requires it
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const mod = proxyquire(candidates[i], { redis: redisMock });
      const maybeApp = (mod && mod.default) ? mod.default : mod;
      if (maybeApp && typeof maybeApp === 'function' && typeof maybeApp.use === 'function') {
        return maybeApp; // looks like an Express app
      }
    } catch (e) {
      // try next candidate
    }
  }
  return null;
}

/**
 * Build an Express app by wiring routes/index.* onto a fresh app instance.
 * Works even if server.js doesn't export the app.
 */
function buildAppFromRoutes() {
  const projectRoot = path.resolve(__dirname, '..');
  const routesPath = findFirstMatch(
    projectRoot,
    new RegExp(`${path.sep}routes${path.sep}index\\.(js|cjs|mjs)$`, 'i'),
  );
  if (!routesPath) {
    throw new Error('Could not locate routes/index.js to build the Express app');
  }

  // Ensure utils/redis is cached with redis-mock before loading routes/controllers
  const utilsRoot = path.join(projectRoot, 'utils');
  const redisUtilPath = findFirstMatch(utilsRoot, /redis.*\.js$/i);
  const dbUtilPath = findFirstMatch(utilsRoot, /db.*\.js$/i);

  if (redisUtilPath) {
    // prime cache with mocked redis for this module
    // eslint-disable-next-line import/no-dynamic-require, global-require
    redisClient = proxyquire(redisUtilPath, { redis: redisMock });
  }
  if (dbUtilPath) {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    dbClient = require(dbUtilPath);
  }

  // Now load routes (controllers will import utils/*, hitting the cache we primed)
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const routesMod = require(routesPath);
  const router = (routesMod && routesMod.default) ? routesMod.default : routesMod;

  const a = express();
  a.use(express.json({ limit: '50mb' }));
  a.use(express.urlencoded({ extended: true }));

  // Support both router (app.use) and mapping function (router(app))
  if (typeof router === 'function' && typeof router.use !== 'function') {
    // likely a (app) => { app.get(...); }
    router(a);
  } else {
    // likely an Express.Router()
    a.use('/', router);
  }
  return a;
}

/* -------------------------- Global setup/teardown -------------------------- */

before(async function initSuite() {
  this.timeout(30000);

  // Mongo in-memory
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.DB_URI = uri;
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '27017';
  process.env.DB_DATABASE = 'files_manager_test';
  process.env.NODE_ENV = 'test';

  // 1) Try to get exported app (server.js/app.js). If not, build from routes.
  app = tryLoadExportedApp();
  if (!app) {
    app = buildAppFromRoutes();
  }

  // If utils were not found during build, attempt to grab them from cache now
  if (!redisClient || !dbClient) {
    const keys = Object.keys(require.cache || {});
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (!redisClient && /[\\/]+utils[\\/].*redis.*\.js$/i.test(k)) {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        redisClient = require(k);
      }
      if (!dbClient && /[\\/]+utils[\\/].*db.*\.js$/i.test(k)) {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        dbClient = require(k);
      }
    }
  }

  if (!redisClient) {
    throw new Error('Could not resolve utils/redis*.js (with redis mocked)');
  }
  if (!dbClient) {
    throw new Error('Could not resolve utils/db*.js');
  }
});

after(async () => {
  if (mongod) {
    try { await mongod.stop(); } catch (e) { /* noop */ }
  }
});

/* ------------------------------ redisClient ------------------------------ */

describe('redisClient', () => {
  it('isAlive() returns true', () => {
    expect(redisClient.isAlive()).to.be.true;
  });

  it('set/get roundtrip', async () => {
    await redisClient.set('keyA', 'valA', 5);
    const v = await redisClient.get('keyA');
    expect(v).to.equal('valA');
  });

  it('del removes the key', async () => {
    await redisClient.set('toDel', '1', 5);
    await redisClient.del('toDel');
    const v = await redisClient.get('toDel');
    expect(v).to.be.null;
  });
});

/* -------------------------------- dbClient -------------------------------- */

describe('dbClient', () => {
  it('isAlive() returns true (connected)', () => {
    expect(dbClient.isAlive()).to.be.true;
  });

  it('nbUsers() & nbFiles() start at 0', async () => {
    const u = await dbClient.nbUsers();
    const f = await dbClient.nbFiles();
    expect(u).to.equal(0);
    expect(f).to.equal(0);
  });
});

/* ------------------------------- API tests -------------------------------- */

describe('API Endpoints', () => {
  let token;
  let userId;
  let fileId;

  it('GET /status -> { redis: true, db: true }', async () => {
    const res = await request(app).get('/status');
    expect(res.status).to.equal(200);
    expect(res.body).to.have.keys(['redis', 'db']);
    expect(res.body.redis).to.equal(true);
    expect(res.body.db).to.equal(true);
  });

  it('GET /stats -> { users, files } (numbers)', async () => {
    const res = await request(app).get('/stats');
    expect(res.status).to.equal(200);
    expect(res.body).to.have.keys(['users', 'files']);
    expect(res.body.users).to.be.a('number');
    expect(res.body.files).to.be.a('number');
  });

  it('POST /users -> 201 (creates user)', async () => {
    const res = await request(app)
      .post('/users')
      .set('Content-Type', 'application/json')
      .send({ email: 'test@example.com', password: 'secret123' });
    expect(res.status).to.equal(201);
    expect(res.body).to.have.keys(['id', 'email']);
    expect(res.body.email).to.equal('test@example.com');
    userId = res.body.id;
  });

  it('GET /connect -> 200 (returns token with Basic auth)', async () => {
    const res = await request(app)
      .get('/connect')
      .set('Authorization', `Basic ${b64('test@example.com:secret123')}`);
    expect(res.status).to.equal(200);
    expect(res.body).to.have.key('token');
    token = res.body.token;
  });

  it('GET /users/me -> 200 (returns id & email)', async () => {
    const res = await request(app)
      .get('/users/me')
      .set('X-Token', token);
    expect(res.status).to.equal(200);
    expect(res.body).to.include({ id: userId, email: 'test@example.com' });
  });

  it('POST /files -> 201 (type=file)', async () => {
    const res = await request(app)
      .post('/files')
      .set('X-Token', token)
      .set('Content-Type', 'application/json')
      .send({ name: 'hello.txt', type: 'file', data: b64data('Hello World') });
    expect(res.status).to.equal(201);
    expect(res.body).to.include.keys(['id', 'userId', 'name', 'type', 'isPublic']);
    expect(res.body.name).to.equal('hello.txt');
    expect(res.body.type).to.equal('file');
    fileId = res.body.id;
  });

  it('GET /files/:id -> 200 (metadata)', async () => {
    const res = await request(app)
      .get(`/files/${fileId}`)
      .set('X-Token', token);
    expect(res.status).to.equal(200);
    expect(res.body).to.include({ id: fileId, name: 'hello.txt' });
  });

  it('GET /files (pagination) -> 200 and different slice between pages', async () => {
    // create several files to exercise pagination
    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(app)
        .post('/files')
        .set('X-Token', token)
        .set('Content-Type', 'application/json')
        .send({ name: `file-${i}.txt`, type: 'file', data: b64data(`idx:${i}`) });
    }
    const page0 = await request(app).get('/files').set('X-Token', token).query({ page: 0 });
    const page1 = await request(app).get('/files').set('X-Token', token).query({ page: 1 });
    expect(page0.status).to.equal(200);
    expect(page1.status).to.equal(200);
    expect(page0.body).to.be.an('array');
    expect(page1.body).to.be.an('array');
    if (page0.body.length > 0 && page1.body.length > 0) {
      expect(page0.body[0].id).to.not.equal(page1.body[0].id);
    }
  });

  it('PUT /files/:id/publish -> 200 (isPublic=true)', async () => {
    const res = await request(app)
      .put(`/files/${fileId}/publish`)
      .set('X-Token', token);
    expect(res.status).to.equal(200);
    expect(res.body.isPublic).to.equal(true);
  });

  it('PUT /files/:id/unpublish -> 200 (isPublic=false)', async () => {
    const res = await request(app)
      .put(`/files/${fileId}/unpublish`)
      .set('X-Token', token);
    expect(res.status).to.equal(200);
    expect(res.body.isPublic).to.equal(false);
  });

  it('GET /files/:id/data -> 200 (if public) or 403/404 depending on impl)', async () => {
    // ensure public
    await request(app).put(`/files/${fileId}/publish`).set('X-Token', token);
    const res = await request(app).get(`/files/${fileId}/data`);
    expect([200, 403, 404]).to.include(res.status);
    if (res.status === 200) {
      expect(res.text).to.be.a('string');
    }
  });

  it('GET /disconnect -> 204', async () => {
    const res = await request(app).get('/disconnect').set('X-Token', token);
    expect(res.status).to.equal(204);
  });
});
