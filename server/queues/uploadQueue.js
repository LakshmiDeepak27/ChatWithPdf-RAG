const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');

const UPLOAD_QUEUE_NAME = 'upload-file-queue';

const uploadQueue = new Queue(UPLOAD_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      count: 200,
      age: 24 * 3600, // 24 hours
    },
    removeOnFail: {
      count: 500,
      age: 7 * 24 * 3600, // 7 days
    },
  },
});

module.exports = {
  uploadQueue,
  UPLOAD_QUEUE_NAME,
};
