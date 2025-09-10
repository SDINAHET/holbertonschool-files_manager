import Bull from 'bull';
import imageThumbnail from 'image-thumbnail';
import { promises as fs } from 'fs';
import mongodb from 'mongodb';
import dbClient from './utils/db.js';

const { ObjectId } = mongodb;

// Create a Bull queue for file processing
const fileQueue = new Bull('file processing', {
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
});

// Process the queue for thumbnail generation
fileQueue.process('generateThumbnails', async (job) => {
  const { fileId, userId } = job.data;

  // Validate required parameters
  if (!fileId) {
    throw new Error('Missing fileId');
  }

  if (!userId) {
    throw new Error('Missing userId');
  }

  // Convert strings to ObjectId
  let fileObjectId; let
    userObjectId;
  try {
    fileObjectId = new ObjectId(fileId);
    userObjectId = new ObjectId(userId);
  } catch (error) {
    throw new Error('Invalid fileId or userId format');
  }

  // Find the file in the database
  const file = await dbClient.db.collection('files').findOne({
    _id: fileObjectId,
    userId: userObjectId,
  });

  if (!file) {
    throw new Error('File not found');
  }

  // Check if the file exists on disk
  try {
    await fs.access(file.localPath);
  } catch (error) {
    throw new Error(`File not found on disk: ${file.localPath}`);
  }

  // Generate thumbnails for different sizes
  const sizes = [500, 250, 100];

  try {
    // Read the original file
    const originalImage = await fs.readFile(file.localPath);

    // Generate all thumbnails in parallel
    await Promise.all(sizes.map(async (size) => {
      const thumbnail = await imageThumbnail(originalImage, { width: size });
      const thumbnailPath = `${file.localPath}_${size}`;
      await fs.writeFile(thumbnailPath, thumbnail);
      console.log(`Generated thumbnail: ${thumbnailPath}`);
    }));

    console.log(`Successfully generated thumbnails for file ${fileId}`);
  } catch (error) {
    console.error(`Error generating thumbnails for file ${fileId}:`, error);
    throw error;
  }
});

// Handle queue events
fileQueue.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

fileQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

fileQueue.on('stalled', (job) => {
  console.warn(`Job ${job.id} stalled`);
});

console.log('Worker started and waiting for jobs...');

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down worker...');
  await fileQueue.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down worker...');
  await fileQueue.close();
  process.exit(0);
});
