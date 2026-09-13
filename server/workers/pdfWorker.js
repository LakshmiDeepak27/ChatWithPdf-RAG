require('dotenv').config();

const fs = require('fs');
const { Worker } = require('bullmq');
const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');
const { Document } = require('@langchain/core/documents');
const { UPLOAD_QUEUE_NAME } = require('../queues/uploadQueue');
const { redisConnection, createRedisClient } = require('../config/redis');
const { extractTextFromPDF } = require('../utils/pdfLoader');
const { getVectorStore } = require('../langchain/vectorStore');

const STATUS_KEY_PREFIX = 'doc:status:';
const STATUS_TTL_SECONDS = 7 * 24 * 3600; // 7 days retention

/**
 * Updates document status in Redis for polling and multi-user tracking
 */
async function updateDocumentStatus(documentId, data) {
  try {
    const key = `${STATUS_KEY_PREFIX}${documentId}`;
    await redisConnection.set(
      key,
      JSON.stringify(data),
      'EX',
      STATUS_TTL_SECONDS
    );
  } catch (err) {
    console.error(`[Worker] Failed to update Redis status for doc ${documentId}:`, err.message);
  }
}

/**
 * Safely removes temporary file from local filesystem
 */
function cleanupTempFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[Worker] Cleaned up temporary file: ${filePath}`);
    }
  } catch (err) {
    console.warn(`[Worker] Could not delete temp file ${filePath}:`, err.message);
  }
}

async function processJob(job) {
  const { documentId, userId, filename, path: filePath } = job.data;
  const startTime = Date.now();

  console.log(`[Worker] Starting job ${job.id} | docId=${documentId} | user=${userId} | file="${filename}"`);

  await updateDocumentStatus(documentId, {
    documentId,
    userId,
    filename,
    status: 'processing',
    progress: 10,
    startedAt: new Date().toISOString(),
  });

  try {
    // 1. Extract text from PDF
    console.log(`[Worker] Extracting text from "${filename}"...`);
    const { text, numPages } = await extractTextFromPDF(filePath);

    if (!text || text.trim().length === 0) {
      throw new Error(
        'No extractable text found in this PDF. The document may be scanned, image-based, or empty. TalkToPDF requires selectable text documents.'
      );
    }

    await job.updateProgress(30);
    await updateDocumentStatus(documentId, {
      documentId,
      userId,
      filename,
      status: 'processing',
      progress: 30,
      pages: numPages,
    });

    // 2. Chunk text using RecursiveCharacterTextSplitter
    console.log(`[Worker] Splitting text into chunks for "${filename}" (pages: ${numPages})...`);
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const rawChunks = await splitter.splitText(text);

    if (rawChunks.length === 0) {
      throw new Error('Text chunking produced zero segments from the document.');
    }

    await job.updateProgress(50);
    await updateDocumentStatus(documentId, {
      documentId,
      userId,
      filename,
      status: 'processing',
      progress: 50,
      totalChunks: rawChunks.length,
    });

    // 3. Prepare Documents with Strict User & Document Metadata
    console.log(`[Worker] Preparing ${rawChunks.length} document chunks with user isolation metadata...`);
    const nowIso = new Date().toISOString();
    const documents = rawChunks.map((chunk, index) => {
      return new Document({
        pageContent: chunk,
        metadata: {
          userId: String(userId),
          documentId: String(documentId),
          filename: String(filename),
          chunkIndex: index,
          totalChunks: rawChunks.length,
          uploadTime: nowIso,
        },
      });
    });

    // 4. Generate & Store Embeddings in Qdrant
    console.log(`[Worker] Generating Gemini embeddings and saving into Qdrant for doc ${documentId}...`);
    const vectorStore = await getVectorStore();
    await vectorStore.addDocuments(documents);

    await job.updateProgress(100);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Worker] Job ${job.id} completed successfully in ${duration}s! Stored ${documents.length} chunks.`);

    // 5. Mark document as READY
    await updateDocumentStatus(documentId, {
      documentId,
      userId,
      filename,
      status: 'ready',
      progress: 100,
      totalChunks: documents.length,
      pages: numPages,
      completedAt: nowIso,
      durationSeconds: Number(duration),
    });

    return {
      success: true,
      documentId,
      filename,
      totalChunks: documents.length,
    };
  } catch (error) {
    console.error(`[Worker] Error processing job ${job.id} (doc ${documentId}):`, error.message);

    await updateDocumentStatus(documentId, {
      documentId,
      userId,
      filename,
      status: 'failed',
      error: error.message,
      failedAt: new Date().toISOString(),
    });

    throw error;
  } finally {
    // Ephemeral disk cleanup: remove temporary uploaded PDF
    cleanupTempFile(filePath);
  }
}

console.log(`[Worker] Initializing BullMQ PDF Worker on queue: "${UPLOAD_QUEUE_NAME}"...`);

const pdfWorker = new Worker(UPLOAD_QUEUE_NAME, processJob, {
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

// Graceful shutdown
async function handleShutdown(signal) {
  console.log(`[Worker] Received ${signal}. Gracefully closing worker...`);
  try {
    await pdfWorker.close();
    console.log('[Worker] BullMQ worker closed successfully.');
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
