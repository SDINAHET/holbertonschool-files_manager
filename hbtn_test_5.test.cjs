/* eslint-env mocha */
/* eslint-disable jest/lowercase-name, jest/no-standalone-expect, jest/valid-expect, jest/prefer-expect-assertions, func-names, no-await-in-loop */
const { expect } = require('chai');

// const BASE = 'http://0.0.0.0:5000';
const BASE = 'http://127.0.0.1:5000';

// Helpers
async function httpJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch (e) { body = text; }
  return { status: res.status, body, headers: res.headers };
}

function authHeaderBasic(email, password) {
  const token = Buffer.from(`${email}:${password}`, 'utf8').toString('base64');
  return { Authorization: `Basic ${token}` };
}

describe('GET /files', function () {
  this.timeout(30000);

  let token;
  let rootFileIds = [];
  let folderId;

  before(async () => {
    // 1) Create a user (idempotent in most student solutions)
    await httpJson(`${BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bob@dylan.com', password: 'toto1234!' }),
    });

    // 2) Connect to get X-Token
    const { status, body } = await httpJson(`${BASE}/connect`, {
      headers: authHeaderBasic('bob@dylan.com', 'toto1234!'),
    });
    expect(status).to.equal(200);
    expect(body).to.have.property('token');
    token = body.token;

    // 3) Seed some files at root ( > 20 to test pagination )
    rootFileIds = [];
    for (let i = 0; i < 25; i += 1) {
      const r = await httpJson(`${BASE}/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Token': token,
        },
        body: JSON.stringify({
          name: `root_${i}.txt`,
          type: 'file',
          data: Buffer.from(`content ${i}`).toString('base64'),
        }),
      });
      expect(r.status).to.equal(201);
      rootFileIds.push(r.body.id);
    }

    // 4) Create a folder and one image inside it
    {
      const r = await httpJson(`${BASE}/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Token': token,
        },
        body: JSON.stringify({
          name: 'images',
          type: 'folder',
        }),
      });
      expect(r.status).to.equal(201);
      folderId = r.body.id;
    }
    {
      const r = await httpJson(`${BASE}/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Token': token,
        },
        body: JSON.stringify({
          name: 'image.png',
          type: 'image',
          isPublic: true,
          parentId: folderId,
          data: Buffer.from('PNGDATA').toString('base64'),
        }),
      });
      expect(r.status).to.equal(201);
    }
  });

  it('GET /files invalid token -> 401', async () => {
    const r = await httpJson(`${BASE}/files`, { headers: { 'X-Token': 'bad' } });
    expect(r.status).to.equal(401);
    expect(r.body).to.deep.equal({ error: 'Unauthorized' });
  });

  it('GET /files with no parentId and no page', async () => {
    const r = await httpJson(`${BASE}/files`, { headers: { 'X-Token': token } });
    expect(r.status).to.equal(200);
    expect(r.body).to.be.an('array');
    // page size max 20
    expect(r.body.length).to.be.at.most(20);
  });

  it('GET /files with wrong parentId and no page -> []', async () => {
    const wrong = 'ffffffffffffffffffffffff';
    const r = await httpJson(`${BASE}/files?parentId=${wrong}`, { headers: { 'X-Token': token } });
    expect(r.status).to.equal(200);
    expect(r.body).to.be.an('array');
    expect(r.body.length).to.equal(0);
  });

  it('GET /files with a valid parentId and no page', async () => {
    const r = await httpJson(`${BASE}/files?parentId=${folderId}`, { headers: { 'X-Token': token } });
    expect(r.status).to.equal(200);
    expect(r.body).to.be.an('array');
    // we inserted one image in that folder
    expect(r.body.length).to.equal(1);
    expect(r.body[0]).to.include({ type: 'image', name: 'image.png' });
    expect(r.body[0]).to.have.property('parentId', folderId);
  });

  it('GET /files with no parentId and second page', async () => {
    const r1 = await httpJson(`${BASE}/files?page=0`, { headers: { 'X-Token': token } });
    const r2 = await httpJson(`${BASE}/files?page=1`, { headers: { 'X-Token': token } });
    expect(r1.status).to.equal(200);
    expect(r2.status).to.equal(200);
    // first page up to 20, second page should contain the remainder (we created 25 at root)
    expect(r1.body.length).to.be.at.most(20);
    expect(r2.body.length).to.be.at.least(1);
    expect(r2.body.length).to.be.at.most(20);
  });

  it('GET /files with no parentId and a page too far -> []', async () => {
    const r = await httpJson(`${BASE}/files?page=99`, { headers: { 'X-Token': token } });
    expect(r.status).to.equal(200);
    expect(r.body).to.be.an('array');
    expect(r.body.length).to.equal(0);
  });

  it('GET /files/:id of the owner', async () => {
    // take any file id we created at root
    const oneId = rootFileIds[0];
    const r = await httpJson(`${BASE}/files/${oneId}`, { headers: { 'X-Token': token } });
    expect(r.status).to.equal(200);
    expect(r.body).to.have.property('id', oneId);
    expect(r.body).to.have.property('userId');
    expect(r.body).to.have.property('name');
    expect(r.body).to.have.property('type');
  });

  it('GET /files/:id invalid token user -> 401', async () => {
    const oneId = rootFileIds[1];
    const r = await httpJson(`${BASE}/files/${oneId}`, { headers: { 'X-Token': 'bad' } });
    expect(r.status).to.equal(401);
  });
});
