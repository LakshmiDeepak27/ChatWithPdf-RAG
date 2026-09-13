const { redisConnection } = require('../config/redis');

const STATUS_KEY_PREFIX = 'doc:status:';
const STATUS_TTL_SECONDS = 7 * 24 * 3600; // 7 days retention

// Resilient in-memory store for instant status access and zero-downtime fallback
const inMemoryStatusStore = new Map();

/**
 * Persists document status to both in-memory cache and Redis (non-blocking)
 */
async function setDocumentStatus(documentId, data) {
  if (!documentId) return;

  const statusObj = {
    ...data,
    updatedAt: new Date().toISOString(),
  };

  // 1. Immediately update fast in-memory store
  inMemoryStatusStore.set(documentId, statusObj);

  // 2. Non-blocking best-effort write to Redis with strict 2-second timeout
  try {
    const key = `${STATUS_KEY_PREFIX}${documentId}`;
    await Promise.race([
      redisConnection.set(key, JSON.stringify(statusObj), 'EX', STATUS_TTL_SECONDS),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis SET timeout (2s)')), 2000)),
    ]);
  } catch (err) {
    // Redis delay or failure should never disrupt the application flow
    console.warn(`[StatusService] Redis write for doc ${documentId} skipped (${err.message}). In-memory active.`);
  }

  return statusObj;
}

/**
 * Retrieves document status, checking memory first then falling back to Redis
 */
async function getDocumentStatus(documentId) {
  if (!documentId) return null;

  // 1. Check in-memory store first (sub-millisecond response)
  const localDoc = inMemoryStatusStore.get(documentId);
  if (localDoc) {
    return localDoc;
  }

  // 2. Fall back to Redis if not in memory (e.g. across server restarts)
  try {
    const key = `${STATUS_KEY_PREFIX}${documentId}`;
    const rawData = await Promise.race([
      redisConnection.get(key),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis GET timeout (2s)')), 2000)),
    ]);

    if (rawData) {
      const parsed = JSON.parse(rawData);
      inMemoryStatusStore.set(documentId, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn(`[StatusService] Redis read for doc ${documentId} skipped:`, err.message);
  }

  return null;
}

/**
 * Merges partial status updates for a document
 */
async function updateDocumentStatus(documentId, updates) {
  const current = (await getDocumentStatus(documentId)) || { documentId };
  const merged = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  return setDocumentStatus(documentId, merged);
}

module.exports = {
  setDocumentStatus,
  getDocumentStatus,
  updateDocumentStatus,
  inMemoryStatusStore,
};
