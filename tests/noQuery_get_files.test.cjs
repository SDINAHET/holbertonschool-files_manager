/* eslint-env mocha */
/* eslint-disable jest/expect-expect, jest/prefer-expect-assertions, jest/lowercase-name */
import { strict as assert } from 'assert';
import { fetch } from 'undici';

const BASE = process.env.BASE_URL || 'http://localhost:5000';

async function createUserAndToken() {
  const email = `noquery_${Date.now()}@ex.com`;
  const password = 'pass123';

  // 1) créer l'utilisateur
  const resCreate = await fetch(`${BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(resCreate.status, 201, 'User creation should return 201');

  // 2) se connecter (Basic) pour obtenir le token
  const basic = Buffer.from(`${email}:${password}`).toString('base64');
  const resConnect = await fetch(`${BASE}/connect`, {
    method: 'GET',
    headers: { Authorization: `Basic ${basic}` },
  });
  assert.equal(resConnect.status, 200, 'Connect should return 200');
  const data = await resConnect.json();
  assert.ok(data && data.token, 'Connect should return a token');
  return data.token;
}

describe('GET /files sans parentId ni page', function () {
  this.timeout(10000);

  it('retourne 200 et un tableau', async () => {
    const token = await createUserAndToken(); // <-- vrai token

    const res = await fetch(`${BASE}/files`, {
      method: 'GET',
      headers: { 'X-Token': token },
    });

    assert.equal(res.status, 200, 'HTTP status doit être 200');
    const data = await res.json();
    assert.ok(Array.isArray(data), 'La réponse doit être un tableau []');
  });
});
