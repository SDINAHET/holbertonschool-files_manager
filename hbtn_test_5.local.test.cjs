/* eslint-env mocha */
/* global fetch */
/* eslint-disable no-unused-expressions */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable jest/valid-expect, jest/no-standalone-expect, jest/lowercase-name, jest/prefer-expect-assertions */
/* eslint-disable prefer-arrow-callback */

import { expect } from 'chai';

describe('GET /files', function getFilesSuite() {
  this.timeout(30000); // même timeout que le checker

  let token;

  before(async function beforeAll() {
    const r = await fetch('http://0.0.0.0:5000/connect', {
      headers: {
        Authorization: 'Basic Ym9iQGR5bGFuLmNvbTp0b3RvMTIzNCE=',
      },
    });
    const body = await r.json();
    token = body.token;
    expect(token).to.be.a('string');
  });

  it('GET /files with no parentId and no page', async () => {
    const r = await fetch('http://0.0.0.0:5000/files', {
      headers: { 'X-Token': token },
    });
    expect(r.status).to.equal(200);
    const arr = await r.json();
    expect(arr).to.be.an('array');
  });

  it('GET /files with wrong parentId and no page -> []', async () => {
    const r = await fetch('http://0.0.0.0:5000/files?parentId=notAnObjectId', {
      headers: { 'X-Token': token },
    });
    expect(r.status).to.equal(200);
    const arr = await r.json();
    expect(arr).to.be.an('array');
  });

  it('GET /files/:id invalid token user -> 401', async () => {
    const r = await fetch('http://0.0.0.0:5000/files/000000000000000000000000', {
      headers: { 'X-Token': 'invalid' },
    });
    expect(r.status).to.equal(401);
  });
});
