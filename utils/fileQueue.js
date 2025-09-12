const Bull = require('bull');

const {
  REDIS_HOST = '127.0.0.1',
  REDIS_PORT = 6379,
  REDIS_PASSWORD,
} = process.env;

const fileQueue = new Bull('fileQueue', {
  redis: {
    host: REDIS_HOST,
    port: Number(REDIS_PORT),
    ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
  },
});

module.exports = fileQueue;
