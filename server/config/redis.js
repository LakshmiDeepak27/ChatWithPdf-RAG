const Redis = require('ioredis');

function normalizeRedisUrl(rawUrl) {
  if (!rawUrl) return null;
  let url = rawUrl.trim();
  url = url.replace(/^['"]|['"]$/g, '');

  if (url.startsWith('//')) {
    url = 'rediss:' + url;
  } else if (!url.startsWith('redis://') && !url.startsWith('rediss://')) {
    const protocol = url.includes('upstash.io') ? 'rediss://' : 'redis://';
    url = `${protocol}${url}`;
  }
  return url;
}

function getRedisConfig() {
  const rawUrl = process.env.REDIS_URL;
  const normalizedUrl = normalizeRedisUrl(rawUrl);

  const commonOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    keepAlive: 10000,
    connectTimeout: 10000,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 3000);
      return delay;
    },
  };

  if (normalizedUrl) {
    if (normalizedUrl.startsWith('rediss://') || normalizedUrl.includes('upstash.io')) {
      commonOptions.tls = {
        rejectUnauthorized: false,
      };
    }
    return {
      url: normalizedUrl,
      options: commonOptions,
    };
  }

  return {
    options: {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      ...commonOptions,
    },
  };
}

/**
 * Creates a brand new, dedicated Redis connection.
 * Essential for BullMQ Queue and Worker to prevent command blocking.
 */
function createRedisClient(name = 'default') {
  const cfg = getRedisConfig();
  const client = cfg.url
    ? new Redis(cfg.url, cfg.options)
    : new Redis(cfg.options);

  client.on('error', (err) => {
    console.error(`[Redis:${name}] Connection error:`, err.message);
  });

  return client;
}

// Dedicated connection for Express key/value operations (status, cache)
const redisConnection = createRedisClient('express');

redisConnection.on('connect', () => {
  console.log('[Redis:express] Connected to Redis/Valkey successfully.');
});

redisConnection.on('ready', () => {
  console.log('[Redis:express] Ready to accept commands.');
});

module.exports = {
  redisConnection,
  createRedisClient,
  getRedisConfig,
  normalizeRedisUrl,
};
