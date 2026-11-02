require('dotenv').config();

const { QdrantVectorStore } = require('@langchain/qdrant');
const { QdrantClient } = require('@qdrant/js-client-rest');
const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');

const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
const qdrantApiKey = process.env.QDRANT_API_KEY || undefined;
const collectionName = process.env.QDRANT_COLLECTION || 'pdf_documents';

const client = new QdrantClient({
  url: qdrantUrl,
  apiKey: qdrantApiKey,
  checkCompatibility: false,
});

const cleanEmbeddingModel = (process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001').replace(/^models\//, '');

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY,
  model: cleanEmbeddingModel,
});

let vectorStoreInstance = null;

async function getVectorStore() {
  if (vectorStoreInstance) {
    return vectorStoreInstance;
  }

  try {
    // Proactively verify and auto-create Qdrant collection if missing
    try {
      const collections = await client.getCollections();
      const exists = collections.collections?.some((c) => c.name === collectionName);
      if (!exists) {
        console.log(`[Qdrant] Collection "${collectionName}" not found. Auto-creating with 3072 dims...`);
        await client.createCollection(collectionName, {
          vectors: {
            size: 3072,
            distance: 'Cosine',
          },
        });
        console.log(`[Qdrant] Collection "${collectionName}" created successfully.`);
      }
    } catch (collErr) {
      console.warn('[Qdrant] Collection check/create warning:', collErr.message);
    }

    vectorStoreInstance = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        client,
        collectionName,
      }
    );
    return vectorStoreInstance;
  } catch (error) {
    console.error('Error initializing QdrantVectorStore:', error.message);
    throw error;
  }
}

/**
 * Builds a strict multi-tenant filter for Qdrant queries.
 * Enforces ownership: userId must match authenticated user AND documentId must match requested document.
 */
function buildOwnershipFilter(userId, documentId) {
  if (!userId) {
    throw new Error('User ID is required to build Qdrant filter');
  }

  const conditions = [
    { key: 'metadata.userId', match: { value: String(userId) } },
  ];

  if (documentId) {
    conditions.push({
      key: 'metadata.documentId',
      match: { value: String(documentId) },
    });
  }

  return {
    must: conditions,
  };
}

const { GoogleGenerativeAI } = require('@google/generative-ai');

const googleAi = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const embeddingModelName = process.env.GEMINI_EMBEDDING_MODEL || 'models/gemini-embedding-001';
const rawEmbeddingModel = googleAi.getGenerativeModel({
  model: embeddingModelName,
});

/**
 * Directly generates embeddings for a batch of texts using @google/generative-ai with retry on rate limits (429).
 * Ensures no empty vectors are returned to prevent Qdrant 422 Unprocessable Entity errors.
 */
async function embedBatchDirect(texts, maxRetries = 5, onRetry = null) {
  if (!texts || texts.length === 0) return [];

  const requests = texts.map((text) => ({
    content: {
      role: 'user',
      parts: [{ text: text.replace(/\n/g, ' ') }],
    },
  }));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await rawEmbeddingModel.batchEmbedContents({ requests });
      if (!response?.embeddings || response.embeddings.length !== texts.length) {
        throw new Error(
          `Incomplete embeddings received: expected ${texts.length}, got ${response?.embeddings?.length || 0}`
        );
      }

      const vectors = response.embeddings.map((e) => e.values);
      // Validate that no vector is empty or malformed
      for (let i = 0; i < vectors.length; i++) {
        if (!vectors[i] || vectors[i].length === 0) {
          throw new Error(`Empty dense vector received at chunk index ${i}`);
        }
      }

      return vectors;
    } catch (err) {
      const errMsg = err?.message || String(err);
      const isRateLimit =
        errMsg.includes('429') ||
        errMsg.includes('Quota exceeded') ||
        errMsg.includes('ResourceExhausted') ||
        errMsg.includes('rate limit');

      if (attempt >= maxRetries) {
        throw new Error(`Failed to generate embeddings after ${maxRetries} attempts: ${errMsg}`);
      }

      // Adaptive backoff: 3s, 6s, 12s, 24s...
      let delayMs = 3000 * Math.pow(2, attempt - 1);
      const retryDelayMatch = errMsg.match(/retry in ([0-9.]+)s/i) || errMsg.match(/retryDelay":"([0-9]+)s/i);
      if (retryDelayMatch && retryDelayMatch[1]) {
        delayMs = Math.max(delayMs, (parseFloat(retryDelayMatch[1]) + 1) * 1000);
      }

      console.warn(
        `[Embeddings] Attempt ${attempt}/${maxRetries} failed (${errMsg.slice(0, 100)}...). Retrying in ${Math.round(
          delayMs / 1000
        )}s...`
      );

      if (onRetry) {
        try {
          await onRetry({
            attempt,
            maxRetries,
            delaySeconds: Math.round(delayMs / 1000),
            isRateLimit,
          });
        } catch (_) {}
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Indexes documents into Qdrant in safe, sequential batches with rate-limit recovery.
 * Never passes empty vectors to Qdrant, preventing 422 Unprocessable Entity errors.
 */
async function indexDocumentsInBatches(vectorStore, documents, options = {}) {
  const { batchSize = 35, onProgress = null } = options;

  if (!documents || documents.length === 0) return 0;

  const totalDocuments = documents.length;
  console.log(`[VectorStore] Indexing ${totalDocuments} documents in batches of ${batchSize}...`);

  for (let i = 0; i < totalDocuments; i += batchSize) {
    const batchDocs = documents.slice(i, i + batchSize);
    const batchTexts = batchDocs.map((doc) => doc.pageContent);
    const batchIndex = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(totalDocuments / batchSize);

    // Embed batch with retry and rate-limit recovery
    const vectors = await embedBatchDirect(
      batchTexts,
      5,
      async ({ attempt, delaySeconds, isRateLimit }) => {
        if (onProgress) {
          const msg = isRateLimit
            ? `Gemini quota reached. Waiting ${delaySeconds}s before retrying batch ${batchIndex}/${totalBatches}...`
            : `Retrying batch ${batchIndex}/${totalBatches} in ${delaySeconds}s...`;
          await onProgress({
            indexed: i,
            total: totalDocuments,
            message: msg,
          });
        }
      }
    );

    // Upsert batch directly into Qdrant
    await vectorStore.addVectors(vectors, batchDocs);

    const processedCount = Math.min(i + batchDocs.length, totalDocuments);
    console.log(`[VectorStore] Indexed ${processedCount}/${totalDocuments} chunks into Qdrant.`);

    if (onProgress) {
      await onProgress({
        indexed: processedCount,
        total: totalDocuments,
        message: `Indexed ${processedCount} of ${totalDocuments} chunks into vector store...`,
      });
    }

    // Courteous pause between batches to respect rate limits
    if (processedCount < totalDocuments) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  return totalDocuments;
}

module.exports = {
  getVectorStore,
  buildOwnershipFilter,
  embedBatchDirect,
  indexDocumentsInBatches,
  client,
  embeddings,
  collectionName,
};
