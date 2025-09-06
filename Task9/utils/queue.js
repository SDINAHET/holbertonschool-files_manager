import Bull from 'bull';

// Create a Bull queue for file processing
const fileQueue = new Bull('file processing', {
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
});

export default fileQueue;
