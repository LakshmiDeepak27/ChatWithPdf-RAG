require('dotenv').config();

const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { RunnableSequence } = require('@langchain/core/runnables');
const { getVectorStore, buildOwnershipFilter } = require('./vectorStore');

const systemPrompt = `You are a helpful and precise AI assistant for the TalkToPDF application.
Use the following pieces of retrieved context from the user's uploaded PDF document to answer their question.
If the answer cannot be determined from the context, politely state that the information is not found in the uploaded document.
Do not hallucinate or reference documents that do not belong to the user.
Keep your response concise, well-structured, and accurate.

Context:
{context}

Question:
{question}
`;

const prompt = ChatPromptTemplate.fromTemplate(systemPrompt);

function getLLM() {
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  return new ChatGoogleGenerativeAI({
    modelName: modelName.startsWith('models/') ? modelName : `models/${modelName}`,
    apiKey: process.env.GOOGLE_API_KEY,
    temperature: 0.2,
  });
}

/**
 * Ask question with strict multi-user & document isolation
 * @param {string} question - The user query
 * @param {string} userId - Authenticated user ID from Clerk
 * @param {string} documentId - The target document ID
 */
async function askQuestion(question, userId, documentId) {
  if (!question || typeof question !== 'string') {
    throw new Error('Question must be a non-empty string');
  }
  if (!userId) {
    throw new Error('Authenticated userId is required for document retrieval');
  }
  if (!documentId) {
    throw new Error('Document ID is required for chat');
  }

  try {
    const vectorStore = await getVectorStore();
    const filter = buildOwnershipFilter(userId, documentId);

    // Retrieve documents specifically isolated to this user and document
    const retriever = vectorStore.asRetriever({
      filter,
      k: 5,
    });

    const formatDocs = (docs) => {
      if (!docs || docs.length === 0) {
        return 'No relevant document context found.';
      }
      return docs.map((doc, idx) => `[Excerpt ${idx + 1}]:\n${doc.pageContent}`).join('\n\n');
    };

    const llm = getLLM();

    const ragChain = RunnableSequence.from([
      {
        context: async (input) => {
          const docs = await retriever.invoke(input.question);
          return formatDocs(docs);
        },
        question: (input) => input.question,
      },
      prompt,
      llm,
      new StringOutputParser(),
    ]);

    const answer = await ragChain.invoke({ question: question.trim() });
    return answer;
  } catch (error) {
    console.error(`Error generating answer for user=${userId} doc=${documentId}:`, error.message);
    if (error.message && error.message.includes('429')) {
      throw new Error('Gemini API rate limit reached. Please wait a moment and try again.');
    }
    if (error.message && error.message.includes('API key')) {
      throw new Error('AI service configuration error. Please contact the administrator.');
    }
    throw error;
  }
}

module.exports = {
  askQuestion,
};
