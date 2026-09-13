const Redis = require('ioredis');

function normalizeRedisUrl(rawUrl) {
  if (!rawUrl) return null;
  let url = rawUrl.trim();
  // Strip any accidental wrapping quotes
  url = url.replace(/^['"]|['"]$/g, '');

  if (url.startsWith('//')) {
    url = 'rediss:' + url;
  } else if (!url.startsWith('redis://') && !url.startsWith('rediss://')) {
    // If it's upstash or cloud, default to secure rediss://
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

const config = getRedisConfig();
const redisConnection = config.url
  ? new Redis(config.url, config.options)
  : new Redis(config.options);

redisConnection.on('connect', () => {
  console.log('[Redis] Connected to Redis/Valkey successfully.');
});

redisConnection.on('ready', () => {
  console.log('[Redis] Redis connection is ready to accept commands.');
});

redisConnection.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

module.exports = {
  redisConnection,
  redisConfig: config.url ? config.url : config.options,
  getRedisConfig,
  normalizeRedisUrl,
};
