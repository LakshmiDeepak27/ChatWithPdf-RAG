const fs = require('fs');
const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');
const { Document } = require('@langchain/core/documents');
const { extractTextFromPDF } = require('../utils/pdfLoader');
const { getVectorStore, indexDocumentsInBatches } = require('../langchain/vectorStore');
const { updateDocumentStatus } = require('./documentStatusService');

/**
 * Safely removes temporary file from local filesystem
 */
function cleanupTempFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[PDFProcessor] Cleaned up temporary file: ${filePath}`);
    }
  } catch (err) {
    console.warn(`[PDFProcessor] Could not delete temp file ${filePath}:`, err.message);
  }
}

/**
 * Robust, universal PDF processing pipeline.
 * Extracts text, chunks, computes Gemini embeddings, and indexes into Qdrant in safe batches.
 * Updates document status at each stage so frontend polling reflects real-time progress.
 */
async function processPdf({ documentId, userId, filename, filePath, job = null }) {
  const startTime = Date.now();
  console.log(`[PDFProcessor] Beginning processing for docId=${documentId} | user=${userId} | file="${filename}"`);

  await updateDocumentStatus(documentId, {
    documentId,
    userId,
    filename,
    status: 'processing',
    progress: 15,
    message: 'Starting document analysis...',
    startedAt: new Date().toISOString(),
  });

  if (job?.updateProgress) {
    try { await job.updateProgress(15); } catch (_) {}
  }

  try {
    // 1. Extract selectable text from PDF
    console.log(`[PDFProcessor] Extracting text from "${filename}"...`);
    const { text, numPages } = await extractTextFromPDF(filePath);

    if (!text || text.trim().length === 0) {
      throw new Error(
        'No extractable text found in this PDF. The document may be scanned, image-based, or password-protected.'
      );
    }

    await updateDocumentStatus(documentId, {
      status: 'processing',
      progress: 35,
      pages: numPages,
      message: `Extracted ${numPages} page(s). Generating chunks...`,
    });

    if (job?.updateProgress) {
      try { await job.updateProgress(35); } catch (_) {}
    }

    // 2. Chunk text using RecursiveCharacterTextSplitter with optimal chunk size
    console.log(`[PDFProcessor] Splitting text into chunks for "${filename}" (pages: ${numPages})...`);
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1500,
      chunkOverlap: 200,
    });

    const rawChunks = (await splitter.splitText(text))
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (rawChunks.length === 0) {
      throw new Error('Text chunking produced zero segments from the document.');
    }

    await updateDocumentStatus(documentId, {
      status: 'processing',
      progress: 45,
      totalChunks: rawChunks.length,
      message: `Split into ${rawChunks.length} chunks. Indexing into vector store...`,
    });

    if (job?.updateProgress) {
      try { await job.updateProgress(45); } catch (_) {}
    }

    // 3. Prepare Documents with Strict User & Document Metadata
    console.log(`[PDFProcessor] Preparing ${rawChunks.length} document chunks with user isolation metadata...`);
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

    // 4. Generate & Store Embeddings in Qdrant in safe sequential batches with retry
    console.log(`[PDFProcessor] Indexing ${documents.length} chunks into Qdrant for doc ${documentId}...`);
    const vectorStore = await getVectorStore();

    await indexDocumentsInBatches(vectorStore, documents, {
      batchSize: 35,
      onProgress: async ({ indexed, total, message }) => {
        // Smoothly scale progress between 45% and 95%
        const percent = Math.min(95, Math.round(45 + (indexed / total) * 50));
        await updateDocumentStatus(documentId, {
          status: 'processing',
          progress: percent,
          indexedChunks: indexed,
          totalChunks: total,
          message: message || `Indexed ${indexed}/${total} chunks into vector store...`,
        });
        if (job?.updateProgress) {
          try { await job.updateProgress(percent); } catch (_) {}
        }
      },
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[PDFProcessor] Processing complete for doc ${documentId} in ${duration}s (${documents.length} chunks).`);

    // 5. Mark document as READY
    await updateDocumentStatus(documentId, {
      status: 'ready',
      progress: 100,
      totalChunks: documents.length,
      pages: numPages,
      completedAt: nowIso,
      durationSeconds: Number(duration),
      message: `Successfully indexed ${documents.length} chunks from ${numPages} page(s).`,
    });

    if (job?.updateProgress) {
      try { await job.updateProgress(100); } catch (_) {}
    }

    return {
      success: true,
      documentId,
      filename,
      totalChunks: documents.length,
    };
  } catch (error) {
    console.error(`[PDFProcessor] Processing failed for doc ${documentId}:`, error.message);

    // Provide friendly, actionable error messages
    let friendlyError = error.message;
    if (friendlyError.includes('dense vector must not be empty')) {
      friendlyError = 'Vector embedding failure. Re-indexing with rate-limit recovery was attempted.';
    } else if (friendlyError.includes('Quota exceeded') || friendlyError.includes('429')) {
      friendlyError = 'Google Gemini embedding rate limit reached. Please wait a moment and try re-uploading.';
    }

    await updateDocumentStatus(documentId, {
      status: 'failed',
      progress: 0,
      error: friendlyError,
      failedAt: new Date().toISOString(),
      message: friendlyError,
    });

    throw error;
  } finally {
    // Always remove temporary uploaded PDF
    cleanupTempFile(filePath);
  }
}

module.exports = {
  processPdf,
  cleanupTempFile,
};
