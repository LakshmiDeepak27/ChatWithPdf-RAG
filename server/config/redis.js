const Redis = require('ioredis');

function getRedisConfig() {
  const redisUrl = process.env.REDIS_URL;
  const commonOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 3000);
      return delay;
    }
  };

  if (redisUrl) {
    return {
      url: redisUrl,
      options: commonOptions
    };
  }

  return {
    options: {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      ...commonOptions
    }
  };
}

const config = getRedisConfig();
const redisConnection = config.url
  ? new Redis(config.url, config.options)
  : new Redis(config.options);

redisConnection.on('connect', () => {
  console.log('Connected to Redis/Valkey successfully.');
});

redisConnection.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});

module.exports = {
  redisConnection,
  redisConfig: config.url ? config.url : config.options,
  getRedisConfig
};
