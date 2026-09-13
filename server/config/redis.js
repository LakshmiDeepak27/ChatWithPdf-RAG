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

function getRedisConfig(forBull = false) {
  const rawUrl = process.env.REDIS_URL;
  const normalizedUrl = normalizeRedisUrl(rawUrl);

  const commonOptions = {
    // BullMQ requires maxRetriesPerRequest to be null
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 5000,
    // When offline, do NOT queue indefinitely for normal express commands to prevent hung requests
    enableOfflineQueue: forBull,
    retryStrategy(times) {
      if (!forBull && times > 5) {
        return null; // Stop retrying quickly for express client if Redis is down
      }
      return Math.min(times * 300, 3000);
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
 * Creates a dedicated Redis client.
 */
function createRedisClient(name = 'default') {
  const isBull = name === 'queue' || name === 'worker';
  const cfg = getRedisConfig(isBull);

  const client = cfg.url
    ? new Redis(cfg.url, cfg.options)
    : new Redis(cfg.options);

  client.on('error', (err) => {
    // Suppress repetitive disconnect spam in stdout
    if (!client._hasLoggedError) {
      console.warn(`[Redis:${name}] Connection warning: ${err.message}`);
      client._hasLoggedError = true;
      setTimeout(() => { client._hasLoggedError = false; }, 30000);
    }
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
