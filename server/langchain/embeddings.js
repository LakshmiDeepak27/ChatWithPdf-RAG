const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
require('dotenv').config();

const embeddings = new GoogleGenerativeAIEmbeddings({
    modelName: "text-embedding-004", // Use the recommended text-embedding-004 model
    apiKey: process.env.GEMINI_API_KEY,
});

module.exports = {
    embeddings
};
