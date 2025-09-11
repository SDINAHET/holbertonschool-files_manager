// tests/test.js
/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const redisMock = require('redis-mock');
const proxyquire = require('proxyquire');
const { ObjectId } = require('mongodb');
const path = require('path');

let app;
let dbClient;      // proxy-required ../utils/db
let redisClient;   // proxy-required ../utils/redis (with redis-mock)
let mongod;

// ---------- Helpers (no optional chaining to satisfy older parsers) ----------
function getHeader(req, name) {
  if (req && req.header && typeof req.header === 'function') {
    return req.header(name);
  }
  if (req && req.headers && Object.prototype.hasOwnProperty.call(req.headers, name.toLowerCase())) {
    return req.headers[name.toLowerCase()];
  }
  return undefined;
}

function loadApp() {
  const candidates = ['../server', '../app'];
  for (let i = 0; i < candidates.length; i += 1) {
    try {
      const mod = require(candidates[i]); // eslint-disable-line global-require, import/no-dynamic-require
      return (mod && mod.default) ? mod.default : mod;
    } catch (err) {
      // continue to next candidate
    }
  }
  throw new Error('Unable to load Express app. Export your Express instance from server.js or app.js');
}

/**
 * Resolve current user from X-Token header (Redis: auth_<token> -> userId) then fetch in Mongo.
 * Returns the user document or null.
 */
async function getUserFromToken(req) {
  const token = getHeader(req, 'X-Token');
  if (!token) return null;

  const userId = await redisClient.get(`auth_${token}`);
  if (!userId) return null;

  const usersCol = dbClient.db.collection('users'); // adjust if your dbClient exposes differently
  const user = await usersCol.findOne({ _id: new ObjectId(userId) });
  return user || null;
}

// Base64 helpers
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const b64data = (s) => Buffer.from(s, 'utf8').toString('base64');

// ---------- Global setup / teardown ----------
before(async function initSuite() {
  this.timeout(20000);

  // Start in-memory Mongo
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.DB_URI = uri;
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '27017';
  process.env.DB_DATABASE = 'files_manager_test';
  process.env.NODE_ENV = 'test';

  // Load utils with redis mocked (do not require at top to avoid double instances)
  // redisClient = proxyquire('../utils/redis', { redis: redisMock });
  // dbClient = proxyquire('../utils/db', {});
    // ✅ par celles-ci (chemins robustes + extension .js)
  // --- Robust resolver for different file names/cases/structures ---
  function resolveFirstExisting(candidates) {
    for (let i = 0; i < candidates.length; i += 1) {
      const abs = path.resolve(__dirname, candidates[i]);
      try {
        // ensure it exists and is resolvable
        // eslint-disable-next-line import/no-dynamic-require, global-require
        require.resolve(abs);
        return abs;
      } catch (e) { /* try next */ }
    }
    throw new Error(`None of these modules could be resolved: ${candidates.join(', ')}`);
  }

  // Try common file name variants used in Holberton/ALX projects
  const redisCandidates = [
    '../utils/redis.js',
    '../utils/redis/index.js',
    '../utils/redisClient.js',
    '../utils/RedisClient.js',
  ];
  const dbCandidates = [
    '../utils/db.js',
    '../utils/db/index.js',
    '../utils/dbClient.js',
    '../utils/DBClient.js',
  ];

  const redisPath = resolveFirstExisting(redisCandidates);
  const dbPath = resolveFirstExisting(dbCandidates);

  // Load utils with redis mocked (no double instances)
  redisClient = proxyquire(redisPath, { redis: redisMock });
  dbClient = proxyquire(dbPath, {});

  // Load Express app
  app = loadApp();
});

after(async () => {
  if (mongod) {
    try { await mongod.stop(); } catch (e) { /* noop */ }
  }
});

// ------------------------
// Unit tests: redisClient
// ------------------------
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

// ------------------------
// Unit tests: dbClient
// ------------------------
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

// ------------------------
// API tests (endpoints)
// ------------------------
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
