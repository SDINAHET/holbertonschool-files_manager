// hbtn_test_3.test.cjs
/* eslint-env mocha */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable jest/lowercase-name, jest/prefer-expect-assertions, jest/valid-expect, jest/no-if */

const request = require('request');
const { expect } = require('chai');
const fs = require('fs');

const baseUrl = 'http://0.0.0.0:5000';
function reqP(opts) {
  return new Promise((resolve, reject) => {
    request(opts, (err, res, body) => {
      if (err) return reject(err);
      resolve({ res, body });
    });
  });
}

describe('GET /files/:id/data', function () {
  this.timeout(30000);
  let ownerToken, otherToken;
  let ownerFile, ownerPubFile, ownerFolder, ownerPubFolder;

  const ownerEmail = `owner_${Date.now()}@test.com`;
  const otherEmail = `other_${Date.now()}@test.com`;
  const password = 'toto1234!';
  const fileContent = 'Hello Holberton!';
  const fileB64 = Buffer.from(fileContent).toString('base64');

  before(async () => {
    // Créer owner
    await reqP({ method: 'POST', uri: `${baseUrl}/users`, json: { email: ownerEmail, password } });
    const basic1 = Buffer.from(`${ownerEmail}:${password}`).toString('base64');
    const { body: b1 } = await reqP({ method: 'GET', uri: `${baseUrl}/connect`, headers: { Authorization: `Basic ${basic1}` }, json: true });
    ownerToken = b1.token;

    // Créer other user
    await reqP({ method: 'POST', uri: `${baseUrl}/users`, json: { email: otherEmail, password } });
    const basic2 = Buffer.from(`${otherEmail}:${password}`).toString('base64');
    const { body: b2 } = await reqP({ method: 'GET', uri: `${baseUrl}/connect`, headers: { Authorization: `Basic ${basic2}` }, json: true });
    otherToken = b2.token;

    // Fichiers / folders du owner
    // unpublished file
    {
      const { body } = await reqP({ method: 'POST', uri: `${baseUrl}/files`, headers: { 'X-Token': ownerToken }, json: { name: 'unpub.txt', type: 'file', data: fileB64 } });
      ownerFile = body.id;
    }
    // published file
    {
      const { body } = await reqP({ method: 'POST', uri: `${baseUrl}/files`, headers: { 'X-Token': ownerToken }, json: { name: 'pub.txt', type: 'file', data: fileB64, isPublic: true } });
      ownerPubFile = body.id;
    }
    // unpublished folder
    {
      const { body } = await reqP({ method: 'POST', uri: `${baseUrl}/files`, headers: { 'X-Token': ownerToken }, json: { name: 'folder1', type: 'folder' } });
      ownerFolder = body.id;
    }
    // published folder
    {
      const { body } = await reqP({ method: 'POST', uri: `${baseUrl}/files`, headers: { 'X-Token': ownerToken }, json: { name: 'folder2', type: 'folder', isPublic: true } });
      ownerPubFolder = body.id;
    }
  });

  it('no file linked to id', async () => {
    const { res } = await reqP({ method: 'GET', uri: `${baseUrl}/files/123456789012345678901234/data` });
    expect(res.statusCode).to.equal(404);
  });

  it('unpublished file, no auth', async () => {
    const { res } = await reqP({ method: 'GET', uri: `${baseUrl}/files/${ownerFile}/data` });
    expect(res.statusCode).to.equal(404);
  });

  it('unpublished file, auth not owner', async () => {
    const { res } = await reqP({ method: 'GET', uri: `${baseUrl}/files/${ownerFile}/data`, headers: { 'X-Token': otherToken } });
    expect(res.statusCode).to.equal(404);
  });

  it('unpublished file, auth owner', async () => {
    const { res, body } = await reqP({ method: 'GET', uri: `${baseUrl}/files/${ownerFile}/data`, headers: { 'X-Token': ownerToken } });
    expect(res.statusCode).to.equal(200);
    expect(body).to.equal(fileContent);
  });

  it('published file, no auth', async () => {
    const { res, body } = await reqP({ method: 'GET', uri: `${baseUrl}/files/${ownerPubFile}/data` });
    expect(res.statusCode).to.equal(200);
    expect(body).to.equal(fileContent);
  });

  it('published file, auth not owner', async () => {
    const { res, body } = await reqP({ method: 'GET', uri: `${baseUrl}/files/${ownerPubFile}/data`, headers: { 'X-Token': otherToken } });
    expect(res.statusCode).to.equal(200);
    expect(body).to.equal(fileContent);
  });

  it('published file, auth owner', async () => {
    const { res, body } = await reqP({ method: 'GET', uri: `${baseUrl}/files/${ownerPubFile}/data`, headers: { 'X-Token': ownerToken } });
    expect(res.statusCode).to.equal(200);
    expect(body).to.equal(fileContent);
  });

  it('unpublished folder no auth + published folder', async () => {
    let r1 = await reqP({ method: 'GET', uri: `${baseUrl}/files/${ownerFolder}/data` });
    expect(r1.res.statusCode).to.equal(400);
    let r2 = await reqP({ method: 'GET', uri: `${baseUrl}/files/${ownerPubFolder}/data` });
    expect(r2.res.statusCode).to.equal(400);
  });

  it('unpublished folder auth owner + published folder', async () => {
    let r1 = await reqP({ method: 'GET', uri: `${baseUrl}/files/${ownerFolder}/data`, headers: { 'X-Token': ownerToken } });
    expect(r1.res.statusCode).to.equal(400);
    let r2 = await reqP({ method: 'GET', uri: `${baseUrl}/files/${ownerPubFolder}/data`, headers: { 'X-Token': ownerToken } });
    expect(r2.res.statusCode).to.equal(400);
  });

  it('unpublished file missing locally no auth + published', async () => {
    // supprimer fichier local
    const path = `/tmp/files_manager/${ownerFile}`;
    if (fs.existsSync(path)) fs.unlinkSync(path);
    const r1 = await reqP({ method: 'GET', uri: `${baseUrl}/files/${ownerFile}/data` });
    expect(r1.res.statusCode).to.equal(404);
    const r2 = await reqP({ method: 'GET', uri: `${baseUrl}/files/${ownerPubFile}/data` });
    expect(r2.res.statusCode).to.equal(404);
  });

  it('unpublished file missing locally auth not owner + published', async () => {
    const r1 = await reqP({ method: 'GET', uri: `${baseUrl}/files/${ownerFile}/data`, headers: { 'X-Token': otherToken } });
    expect(r1.res.statusCode).to.equal(404);
    const r2 = await reqP({ method: 'GET', uri: `${baseUrl}/files/${ownerPubFile}/data`, headers: { 'X-Token': otherToken } });
    expect(r2.res.statusCode).to.equal(404);
  });

  it('unpublished file missing locally auth owner + published', async () => {
    const r1 = await reqP({ method: 'GET', uri: `${baseUrl}/files/${ownerFile}/data`, headers: { 'X-Token': ownerToken } });
    expect(r1.res.statusCode).to.equal(404);
    const r2 = await reqP({ method: 'GET', uri: `${baseUrl}/files/${ownerPubFile}/data`, headers: { 'X-Token': ownerToken } });
    expect(r2.res.statusCode).to.equal(404);
  });
});
