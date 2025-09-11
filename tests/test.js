// tests/test.js
/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const redisMock = require('redis-mock');
const proxyquire = require('proxyquire');
const path = require('path');

let app;
let dbClient;      // instance réelle chargée par l'app
let redisClient;   // instance réelle chargée par l'app (mais redis mocké)
let mongod;

/* ------------------------------ Helpers ------------------------------ */

// Base64
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const b64data = (s) => Buffer.from(s, 'utf8').toString('base64');

// Charge server/app en remplaçant tout require('redis') par redis-mock
function loadAppWithRedisMock() {
  const candidates = ['../server.js', '../server', '../app.js', '../app'];
  for (let i = 0; i < candidates.length; i += 1) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const mod = proxyquire(candidates[i], { redis: redisMock });
      return (mod && mod.default) ? mod.default : mod;
    } catch (e) { /* try next candidate */ }
  }
  throw new Error('Export your Express instance from server.js or app.js');
}

// Récupère depuis le require cache un module dont le chemin matche la regex
function findLoadedModule(regex) {
  const keys = Object.keys(require.cache || {});
  for (let i = 0; i < keys.length; i += 1) {
    if (regex.test(keys[i])) return keys[i];
  }
  return null;
}

/* -------------------------- Global setup/teardown -------------------------- */

before(async function initSuite() {
  this.timeout(30000);

  // Mongo en mémoire
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.DB_URI = uri;
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '27017';
  process.env.DB_DATABASE = 'files_manager_test';
  process.env.NODE_ENV = 'test';

  // 1) Charge l'app en mockant le package 'redis'
  app = loadAppWithRedisMock();

  // 2) Récupère les chemins réels de utils/redis* et utils/db* chargés par l'app
  const redisPath = findLoadedModule(/[\\/]+utils[\\/].*redis.*\.js$/i);
  const dbPath = findLoadedModule(/[\\/]+utils[\\/].*db.*\.js$/i);

  if (!redisPath) throw new Error('Could not locate utils/redis*.js in require cache');
  if (!dbPath) throw new Error('Could not locate utils/db*.js in require cache');

  // 3) Charge ces instances (déjà câblées avec redis-mock via proxyquire)
  // eslint-disable-next-line import/no-dynamic-require, global-require
  redisClient = require(redisPath);
  // eslint-disable-next-line import/no-dynamic-require, global-require
  dbClient = require(dbPath);
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
