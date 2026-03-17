const { Queue } = require('bullmq');
const { redisConfig } = require('../config/redis');

const UPLOAD_QUEUE_NAME = 'upload-file-queue';

const uploadQueue = new Queue(UPLOAD_QUEUE_NAME, {
    connection: redisConfig
});

module.exports = {
    uploadQueue,
    UPLOAD_QUEUE_NAME
};
