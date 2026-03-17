require("dotenv").config();

const { QdrantVectorStore } = require("@langchain/qdrant");
const { QdrantClient } = require("@qdrant/js-client-rest");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");

const client = new QdrantClient({
  url: process.env.QDRANT_URL
});

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY,
  modelName: "text-embedding-004"
});

async function getVectorStore() {
  try {
    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        client,
        collectionName: process.env.QDRANT_COLLECTION
      }
    );
    return vectorStore;
  } catch (error) {
    console.log("Collection not found or error occurred, creating new collection in Qdrant...");
    // Initialize with an empty document to ensure collection creation
    const vectorStore = await QdrantVectorStore.fromDocuments(
      [],
      embeddings,
      {
        client,
        collectionName: process.env.QDRANT_COLLECTION
      }
    );
    return vectorStore;
  }
}

module.exports = { getVectorStore };
