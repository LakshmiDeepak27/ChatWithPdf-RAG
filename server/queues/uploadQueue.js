const { Queue } = require('bullmq');
const { createRedisClient } = require('../config/redis');

const UPLOAD_QUEUE_NAME = 'upload-file-queue';

// Dedicated Redis connection for the Queue producer
const uploadQueue = new Queue(UPLOAD_QUEUE_NAME, {
  connection: createRedisClient('queue'),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      count: 200,
      age: 24 * 3600,
    },
    removeOnFail: {
      count: 500,
      age: 7 * 24 * 3600,
    },
  },
});

module.exports = {
  uploadQueue,
  UPLOAD_QUEUE_NAME,
};
