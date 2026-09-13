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

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY,
  model: process.env.GEMINI_EMBEDDING_MODEL || 'models/gemini-embedding-001',
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

module.exports = {
  getVectorStore,
  buildOwnershipFilter,
  client,
  embeddings,
  collectionName,
};
