/* eslint-env mocha */
/* eslint-disable jest/expect-expect, jest/prefer-expect-assertions, jest/lowercase-name */
import { strict as assert } from 'assert';
import { fetch } from 'undici';

const BASE = process.env.BASE_URL || 'http://localhost:5000';

async function createUserAndToken() {
  const email = `noquery_${Date.now()}@ex.com`;
  const password = 'pass123';

  // 1) create user
  const r1 = await fetch(`${BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(r1.status, 201);

  // 2) connect -> token
  const basic = Buffer.from(`${email}:${password}`).toString('base64');
  const r2 = await fetch(`${BASE}/connect`, {
    method: 'GET',
    headers: { Authorization: `Basic ${basic}` },
  });
  assert.equal(r2.status, 200);
  const data = await r2.json();
  assert.ok(data && data.token, 'token manquant');
  return data.token;
}

describe('GET /files sans parentId ni page', function () {
  this.timeout(10000);

  it('retourne 200 et un tableau', async () => {
    const token = await createUserAndToken();

    const res = await fetch(`${BASE}/files`, {
      method: 'GET',
      headers: { 'X-Token': token },
    });

    assert.equal(res.status, 200, 'HTTP status doit être 200');
    const arr = await res.json();
    assert.ok(Array.isArray(arr), 'La réponse doit être un tableau []');
  });
});
