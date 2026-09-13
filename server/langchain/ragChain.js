require('dotenv').config();

const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { RunnableSequence } = require('@langchain/core/runnables');
const { Document } = require('@langchain/core/documents');
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

function getLLM(modelNameOverride) {
  const modelName = modelNameOverride || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  return new ChatGoogleGenerativeAI({
    model: modelName.replace(/^models\//, ''),
    apiKey: process.env.GOOGLE_API_KEY,
    temperature: 0.2,
  });
}

/**
 * Robust multi-tier chunk retriever:
 * Tier 1: LangChain similaritySearch with ownership filter
 * Tier 2: Qdrant client.search (/points/search) with filter
 * Tier 3: Qdrant client.search with strict in-memory user & document isolation
 */
async function retrieveRelevantChunks(vectorStore, question, userId, documentId) {
  const filter = buildOwnershipFilter(userId, documentId);

  // Tier 1: Try standard similaritySearch with filter
  try {
    const docs = await vectorStore.similaritySearch(question, 5, filter);
    if (docs && docs.length > 0) {
      console.log(`[RAG] Retrieved ${docs.length} chunks via Tier 1 (standard filter)`);
      return docs;
    }
  } catch (err1) {
    console.warn('[RAG] Tier 1 retrieval warning:', err1.message, err1?.data?.status?.error || '');
  }

  // Tier 2: Direct client.search with query vector and filter
  try {
    const queryEmbedding = await vectorStore.embeddings.embedQuery(question);
    const searchRes = await vectorStore.client.search(vectorStore.collectionName, {
      vector: queryEmbedding,
      limit: 5,
      filter,
      with_payload: true,
    });

    if (searchRes && searchRes.length > 0) {
      const docs = searchRes.map(
        (point) =>
          new Document({
            id: String(point.id),
            pageContent: point.payload?.content || '',
            metadata: point.payload?.metadata || {},
          })
      );
      console.log(`[RAG] Retrieved ${docs.length} chunks via Tier 2 (client.search with filter)`);
      return docs;
    }
  } catch (err2) {
    console.warn('[RAG] Tier 2 retrieval warning:', err2.message, err2?.data?.status?.error || '');
  }

  // Tier 3: Direct client.search without remote filter, enforcing strict in-memory multi-tenant isolation
  try {
    const queryEmbedding = await vectorStore.embeddings.embedQuery(question);
    const searchRes = await vectorStore.client.search(vectorStore.collectionName, {
      vector: queryEmbedding,
      limit: 25,
      with_payload: true,
    });

    if (searchRes && searchRes.length > 0) {
      const isolatedDocs = searchRes
        .map(
          (point) =>
            new Document({
              id: String(point.id),
              pageContent: point.payload?.content || '',
              metadata: point.payload?.metadata || {},
            })
        )
        .filter(
          (doc) =>
            String(doc.metadata?.userId) === String(userId) &&
            (!documentId || String(doc.metadata?.documentId) === String(documentId))
        );

      if (isolatedDocs.length > 0) {
        console.log(`[RAG] Retrieved ${isolatedDocs.length} chunks via Tier 3 (in-memory isolation)`);
        return isolatedDocs.slice(0, 5);
      }
    }
  } catch (err3) {
    console.warn('[RAG] Tier 3 retrieval warning:', err3.message, err3?.data?.status?.error || '');
  }

  return [];
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

    // Retrieve documents safely
    const docs = await retrieveRelevantChunks(vectorStore, question.trim(), userId, documentId);

    const formatDocs = (docList) => {
      if (!docList || docList.length === 0) {
        return 'No relevant document context found.';
      }
      return docList.map((doc, idx) => `[Excerpt ${idx + 1}]:\n${doc.pageContent}`).join('\n\n');
    };

    const contextText = formatDocs(docs);

    // Primary model: gemini-3.6-flash; Fallback: gemini-flash-latest
    let llm = getLLM();

    const createChain = (activeLlm) =>
      RunnableSequence.from([
        prompt,
        activeLlm,
        new StringOutputParser(),
      ]);

    let answer;
    try {
      const ragChain = createChain(llm);
      answer = await ragChain.invoke({
        context: contextText,
        question: question.trim(),
      });
    } catch (llmErr) {
      if (llmErr.message && (llmErr.message.includes('404') || llmErr.message.includes('not found'))) {
        console.warn('[RAG] Primary model error. Falling back to gemini-flash-latest...');
        const fallbackLlm = getLLM('gemini-flash-latest');
        const fallbackChain = createChain(fallbackLlm);
        answer = await fallbackChain.invoke({
          context: contextText,
          question: question.trim(),
        });
      } else {
        throw llmErr;
      }
    }

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
  retrieveRelevantChunks,
};
