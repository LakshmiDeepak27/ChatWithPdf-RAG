require('dotenv').config();

const { Worker } = require('bullmq');
const { UPLOAD_QUEUE_NAME } = require('../queues/uploadQueue');
const { createRedisClient } = require('../config/redis');
const { processPdf } = require('../services/pdfProcessor');
const { updateDocumentStatus } = require('../services/documentStatusService');

async function processJob(job) {
  const { documentId, userId, filename, path: filePath } = job.data;
  return processPdf({
    documentId,
    userId,
    filename,
    filePath,
    job,
  });
}

console.log(`[Worker] Initializing BullMQ PDF Worker on queue: "${UPLOAD_QUEUE_NAME}"...`);

let pdfWorker = null;

try {
  pdfWorker = new Worker(UPLOAD_QUEUE_NAME, processJob, {
    connection: createRedisClient('worker'),
    concurrency: Number(process.env.WORKER_CONCURRENCY) || 2,
  });

  pdfWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} successfully finished.`);
  });

  pdfWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
  });

  pdfWorker.on('error', (err) => {
    console.error('[Worker] BullMQ Worker error:', err.message);
  });
} catch (err) {
  console.error('[Worker] Failed to create BullMQ Worker:', err.message);
}

// Graceful shutdown
async function handleShutdown(signal) {
  console.log(`[Worker] Received ${signal}. Gracefully closing worker...`);
  try {
    if (pdfWorker) {
      await pdfWorker.close();
      console.log('[Worker] BullMQ worker closed successfully.');
    }
    process.exit(0);
  } catch (err) {
    console.error('[Worker] Error during worker shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = {
  pdfWorker,
  processJob,
  updateDocumentStatus,
};
