const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { RunnableSequence, RunnablePassthrough } = require("@langchain/core/runnables");
const { getVectorStore } = require("./vectorStore");
require('dotenv').config();

// Define a prompt template for our RAG system
const systemPrompt = `You are an AI assistant for the TalkToPDF application.
Use the following pieces of retrieved context to answer the user's question. 
If you don't know the answer based on the context, just say that you don't know. 
Try to keep the answer concise and relevant to the provided document context.

Context: {context}

Question: {question}`;

const prompt = ChatPromptTemplate.fromTemplate(systemPrompt);

// Initialize the Gemini LLM
const llm = new ChatGoogleGenerativeAI({
    modelName: "models/gemini-flash-latest",
    apiKey: process.env.GOOGLE_API_KEY,
    temperature: 0.3,
});

async function createRAGChain() {
    // 1. Get the Vector Store
    const vectorStore = await getVectorStore();
    
    // 2. Create the Retriever from the Vector Store
    const retriever = vectorStore.asRetriever();

    // 3. Format documents into a single string
    const formatDocs = (docs) => docs.map((doc) => doc.pageContent).join("\\n\\n");
    
    // 4. Create the LangChain Expression Language (LCEL) chain
    const ragChain = RunnableSequence.from([
        {
            context: retriever.pipe(formatDocs),
            question: new RunnablePassthrough()
        },
        prompt,
        llm,
        new StringOutputParser()
    ]);
    
    return ragChain;
}

async function askQuestion(question) {
    try {
        const chain = await createRAGChain();
        const response = await chain.invoke(question);
        
        return response; // StringOutputParser returns directly the string
    } catch (error) {
        console.error("Error generating answer in ragChain:", error);
        throw error;
    }
}

module.exports = {
    askQuestion
};
