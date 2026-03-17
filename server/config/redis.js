const Redis = require('ioredis');

const redisConfig = process.env.REDIS_URL || {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null
};

const redisConnection = new Redis(redisConfig);

module.exports = {
    redisConnection,
    redisConfig
};
