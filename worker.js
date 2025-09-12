/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { ObjectId } = require('mongodb');
const imageThumbnail = require('image-thumbnail');

const dbClient = require('./utils/db');       // existing from previous tasks
const fileQueue = require('./utils/fileQueue');

const SIZES = [500, 250, 100];

fileQueue.process(async (job) => {
  const { fileId, userId } = job.data || {};

  if (!fileId) throw new Error('Missing fileId');
  if (!userId) throw new Error('Missing userId');

  // Wait for DB connection if needed
  if (!dbClient.isAlive()) {
    await new Promise((res) => setTimeout(res, 100));
  }

  const filesCol = dbClient.db.collection('files');

  const doc = await filesCol.findOne({
    _id: new ObjectId(String(fileId)),
    userId: new ObjectId(String(userId)),
  });

  if (!doc) throw new Error('File not found');
  if (doc.type !== 'image') return; // nothing to do

  const inputPath = doc.localPath;
  const inputBuf = await fs.promises.readFile(inputPath);

  // Generate each size, append _<size>
  for (const w of SIZES) {
    const outPath = `${inputPath}_${w}`;
    const thumb = await imageThumbnail(inputBuf, { width: w });
    await fs.promises.writeFile(outPath, thumb);
  }

  return { status: 'ok', fileId, userId };
});

// Pretty logs
fileQueue.on('completed', (job) => {
  console.log('Thumbnail job completed', job.id);
});
fileQueue.on('failed', (job, err) => {
  console.error('Thumbnail job failed', job && job.id, err && err.message);
});
