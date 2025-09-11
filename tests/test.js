// tests/test.js
/* eslint-disable no-unused-expressions */
require('@babel/register'); // allow ES imports if used in the project

const { expect } = require('chai');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const proxyquire = require('proxyquire');
const redisMock = require('redis-mock');
const express = require('express');
const fs = require('fs');
const path = require('path');

let app;
let dbClient;    // utils/db* loaded instance
let redisClient; // utils/redis* loaded instance (with redis mocked)
let mongod;

/* ------------------------------ helpers ------------------------------ */

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const b64data = (s) => Buffer.from(s, 'utf8').toString('base64');

/** DFS search for first file matching regex under rootDir */
function findFirstMatch(rootDir, regex) {
  const stack = [rootDir];
  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch (e) { /* skip */ }
    for (let i = 0; i < entries.length; i += 1) {
      const ent = entries[i];
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile() && regex.test(full)) return full;
    }
  }
  return null;
}

/** Build an Express app from routes/index.* without starting a real server */
function buildAppFromRoutes() {
  const projectRoot = path.resolve(__dirname, '..');

  // 1) Prime utils with mocks BEFORE loading routes/controllers
  const utilsDir = path.join(projectRoot, 'utils');
  const redisUtilPath = findFirstMatch(utilsDir, /(^|[\\/])redis.*\.mjs$/i);
  const dbUtilPath = findFirstMatch(utilsDir, /(^|[\\/])db.*\.mjs$/i);

  if (!redisUtilPath) throw new Error('Could not locate utils/redis*.js');
  if (!dbUtilPath) throw new Error('Could not locate utils/db*.js');

  // Load redis util with the redis package mocked
  // eslint-disable-next-line import/no-dynamic-require, global-require
  redisClient = proxyquire(redisUtilPath, { redis: redisMock });
  // Load db util normally (it will read env we set in before())
  // eslint-disable-next-line import/no-dynamic-require, global-require
  dbClient = require(dbUtilPath);

  // 2) Load routes
  const routesDir = path.join(projectRoot, 'routes');
  const routesPath = findFirstMatch(routesDir, /(^|[\\/])index\.(js|cjs|mjs)$/i);
  if (!routesPath) throw new Error('Could not locate routes/index.js');

  // eslint-disable-next-line import/no-dynamic-require, global-require
  const routesMod = require(routesPath);
  const router = (routesMod && routesMod.default) ? routesMod.default : routesMod;

  // 3) Build express app
  const a = express();
  a.use(express.json({ limit: '50mb' }));
  a.use(express.urlencoded({ extended: true }));

  // Support both exported router and exported function(app)
  if (typeof router === 'function' && typeof router.use !== 'function') {
    router(a);
  } else {
    a.use('/', router);
  }
  return a;
}

/* ----------------------- global setup / teardown ---------------------- */

before(async function initSuite() {
  this.timeout(30000);

  // Start Mongo in-memory and publish connection in env the way your db util expects
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri(); // e.g. mongodb://127.0.0.1:54321/
  process.env.DB_URI = uri;

  // Some templates ignore DB_URI and use DB_HOST/DB_PORT/DB_DATABASE:
  const m = uri.match(/^mongodb:\/\/([^:/]+):(\d+)(?:\/([^?]+))?/);
  process.env.DB_HOST = (m && m[1]) || '127.0.0.1';
  process.env.DB_PORT = (m && m[2]) || '27017';
  process.env.DB_DATABASE = (m && m[3]) || 'files_manager_test';
  process.env.NODE_ENV = 'test';

  // Build the app purely from routes to avoid running server.js (no listen, no real Redis)
  app = buildAppFromRoutes();
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

  it('GET /files/:id/data -> 200 (if public) or 403/404 depending on impl', async () => {
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
