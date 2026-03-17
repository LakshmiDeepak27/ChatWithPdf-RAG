const { Worker } = require('bullmq');
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { Document } = require("@langchain/core/documents");
const { UPLOAD_QUEUE_NAME } = require('../queues/uploadQueue');
const { redisConfig } = require('../config/redis');
const { extractTextFromPDF } = require('../utils/pdfLoader');
require('dotenv').config();


async function processJob(job) {
    console.log(`Processing job ${job.id} for file ${job.data.filename}`);
    
    try {
        const filePath = job.data.path;
        
        // 1. Read uploaded PDF & Extract text
        console.log(`Extracting text from ${job.data.filename}...`);
        const text = await extractTextFromPDF(filePath);
        
        if (!text || text.trim().length === 0) {
            throw new Error('Extracted text is empty. PDF might be scanned or invalid.');
        }

        // 2. Split text using RecursiveCharacterTextSplitter
        console.log('Splitting text into chunks...');
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        
        const chunks = await splitter.splitText(text);
        
        // 3. Prepare Documents with Metadata
        console.log(`Created ${chunks.length} chunks. Preparing documents...`);
        const documents = chunks.map(chunk => {
            return new Document({
                pageContent: chunk,
                metadata: {
                    filename: job.data.filename,
                    uploadTime: new Date().toISOString(),
                }
            });
        });

        // 4. Generate & Store Embeddings in Qdrant
        console.log('Storing embeddings inside Qdrant...');
        const { getVectorStore } = require('../langchain/vectorStore');
        const vectorStore = await getVectorStore();
        
        await vectorStore.addDocuments(documents);
        
        console.log(`Successfully processed job ${job.id} and stored embeddings for ${job.data.filename}`);
        return { success: true, filename: job.data.filename, totalChunks: chunks.length };
        
    } catch (error) {
        console.error(`Failed to process job ${job.id}:`, error);
        throw error; // Re-throw so BullMQ registers the job as failed
    }
}

// Ensure worker is standalone
console.log(`Starting PDF Worker listening on queue: ${UPLOAD_QUEUE_NAME}...`);
const pdfWorker = new Worker(UPLOAD_QUEUE_NAME, processJob, {
    connection: redisConfig,
});

pdfWorker.on('completed', job => {
    console.log(`${job.id} has completed!`);
});

pdfWorker.on('failed', (job, err) => {
    console.log(`${job.id} has failed with ${err.message}`);
});
