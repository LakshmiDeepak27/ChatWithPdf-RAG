const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { createRetrievalChain } = require("langchain/chains/retrieval");
const { createStuffDocumentsChain } = require("langchain/chains/combine_documents");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { getVectorStore } = require("./vectorStore");
require('dotenv').config();

// Define a prompt template for our RAG system
const systemPrompt = `You are an AI assistant for the TalkToPDF application.
Use the following pieces of retrieved context to answer the user's question. 
If you don't know the answer based on the context, just say that you don't know. 
Try to keep the answer concise and relevant to the provided document context.

Context: {context}

Question: {input}`;

const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    ["human", "{input}"]
]);

// Initialize the Gemini LLM
const llm = new ChatGoogleGenerativeAI({
    modelName: "gemini-1.5-flash",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.3,
});


async function createRAGChain() {
    // 1. Get the Vector Store
    const vectorStore = await getVectorStore();
    
    // 2. Create the Retriever from the Vector Store
    const retriever = vectorStore.asRetriever();
    
    // 3. Create the document combining chain
    const combineDocsChain = await createStuffDocumentsChain({
        llm: llm,
        prompt: prompt,
    });
    
    // 4. Create the final retrieval chain
    const retrievalChain = await createRetrievalChain({
        retriever: retriever,
        combineDocsChain: combineDocsChain,
    });
    
    return retrievalChain;
}

async function askQuestion(question) {
    try {
        const chain = await createRAGChain();
        const response = await chain.invoke({
            input: question,
        });
        
        return response.answer;
    } catch (error) {
        console.error("Error generating answer in ragChain:", error);
        throw error;
    }
}

module.exports = {
    askQuestion
};
