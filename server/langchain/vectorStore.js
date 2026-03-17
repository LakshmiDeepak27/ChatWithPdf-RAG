const { Chroma } = require("@langchain/community/vectorstores/chroma");
const { embeddings } = require("./embeddings");
require('dotenv').config();

const chromaPath = process.env.CHROMA_DB_PATH || "./chroma_db";
const collectionName = "talktopdf_docs";

async function getVectorStore() {
    try {
        const vectorStore = await Chroma.fromExistingCollection(embeddings, {
            collectionName: collectionName,
            url: "http://localhost:8000" // Chroma's local URL. Change this if using a different Chroma setup
        });
        return vectorStore;
    } catch (error) {
        // Fallback: If the collection doesn't exist, create an empty one.
        console.log("Collection doesn't exist yet, creating a new Chroma vector store instance.");
        
        // This won't actually "create" it in chroma until we add documents, but gives an interface.
        const vectorStore = new Chroma(embeddings, {
            collectionName: collectionName,
        });

        return vectorStore;
    }
}

async function addDocumentsToVectorStore(docs) {
    const vectorStore = new Chroma(embeddings, {
        collectionName: collectionName,
    });
    
    await vectorStore.addDocuments(docs);
    return vectorStore;
}

module.exports = {
    getVectorStore,
    addDocumentsToVectorStore,
    collectionName
};
