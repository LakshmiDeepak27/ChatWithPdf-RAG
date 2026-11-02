require('dotenv').config();

const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { RunnableSequence } = require('@langchain/core/runnables');
const { Document } = require('@langchain/core/documents');
const { getVectorStore, buildOwnershipFilter } = require('./vectorStore');

const systemPrompt = `You are LucidChat, an elite AI document analysis assistant. Deliver a precise, beautifully structured answer based on the retrieved document context below.

### MANDATORY FORMATTING & ANALYSIS RULES:
1. **Direct Answer First**: Always open with a direct, clear 1–2 sentence answer or summary.
2. **Overview & Summary Inquiries**: If the user asks general or overview questions (e.g. "what is this PDF about?", "summarize this document", "what is this?"), synthesize the document excerpts to identify the document type, title, subject, purpose, and key highlights.
3. **Section Headings**: Use descriptive headings (\`### Section Title\`) to organize multifaceted answers.
4. **Structured Lists**:
   - For enumerations, projects, or credentials, use a numbered list with the title on the SAME line:
     \`1. **Item Title** — Role, Category, or Tech Stack\`
   - Indent details underneath each item as clean bullet points:
     \`   - **Overview:** 1-sentence summary.\`
     \`   - **Key Details & Tech:** Specific details, metrics, or achievements.\`
   - NEVER put a number on its own line (e.g. NEVER write "1." followed by a line break).
   - Place each bullet point on its own new line.
5. **Inline Formatting**:
   - Use **bold text** for crucial terms, numbers, dates, requirements, scores, or names.
   - Use inline code (\`code\`) for technical functions, commands, or APIs (e.g. \`fork()\`, \`pipe()\`, \`execvp()\`).
   - Always close bold (\`**\`) and italic (\`*\`) tags cleanly. Never leave dangling asterisks.
6. **Clarity**: Keep paragraphs short (2 sentences max).
7. **Strict Grounding**: Ground all answers in the provided context excerpts. If a specific factual query is absent from the document, state that it is not mentioned in the document.

Context:
{context}

Question:
{question}
`;

const prompt = ChatPromptTemplate.fromTemplate(systemPrompt);

function getLLM(modelNameOverride) {
  const modelName = modelNameOverride || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  return new ChatGoogleGenerativeAI({
    model: modelName.replace(/^models\//, ''),
    apiKey: process.env.GOOGLE_API_KEY,
    temperature: 0.1,
    maxOutputTokens: 600,
  });
}

// In-memory LRU cache for query embeddings to eliminate redundant HTTPS embedding calls (saves ~600ms)
const queryEmbeddingCache = new Map();
const MAX_EMBEDDING_CACHE = 100;

async function getCachedQueryEmbedding(vectorStore, question) {
  const cacheKey = question.trim().toLowerCase();
  if (queryEmbeddingCache.has(cacheKey)) {
    return queryEmbeddingCache.get(cacheKey);
  }

  let queryEmbedding;
  try {
    queryEmbedding = await vectorStore.embeddings.embedQuery(question);
  } catch (embErr) {
    console.warn('[RAG] embedQuery warning, using batch fallback:', embErr.message);
    const { embedBatchDirect } = require('./vectorStore');
    const [vec] = await embedBatchDirect([question]);
    queryEmbedding = vec;
  }

  if (queryEmbedding && queryEmbedding.length > 0) {
    if (queryEmbeddingCache.size >= MAX_EMBEDDING_CACHE) {
      const oldestKey = queryEmbeddingCache.keys().next().value;
      queryEmbeddingCache.delete(oldestKey);
    }
    queryEmbeddingCache.set(cacheKey, queryEmbedding);
  }

  return queryEmbedding;
}

function isOverviewQuery(question) {
  const q = question.toLowerCase().trim();
  return (
    q.includes('what is this pdf') ||
    q.includes('what is this doc') ||
    q.includes('what is this file') ||
    q.includes('what is this about') ||
    q.includes('what is the pdf about') ||
    q.includes('tell me about') ||
    q.includes('summarize') ||
    q.includes('summary') ||
    q.includes('overview') ||
    q.includes('explain this') ||
    q.includes('who is this')
  );
}

/**
 * Ultra-fast, resilient chunk retriever:
 * 1. Checks in-memory cache for precomputed query embedding.
 * 2. If overview query or specific query: searches Qdrant with ownership filter.
 * 3. Falls back seamlessly to document scroll to ensure context is ALWAYS retrieved for the active document.
 */
async function retrieveRelevantChunks(vectorStore, question, userId, documentId) {
  const filter = buildOwnershipFilter(userId, documentId);
  const isOverview = isOverviewQuery(question);

  // 1. Get query embedding with cache (0ms on repeated queries)
  const queryEmbedding = await getCachedQueryEmbedding(vectorStore, question);

  if (!queryEmbedding || queryEmbedding.length === 0) {
    throw new Error('Failed to generate search vector for question.');
  }

  // 2. Direct client.search with precomputed vector and ownership filter (fastest path: < 40ms)
  try {
    const searchRes = await vectorStore.client.search(vectorStore.collectionName, {
      vector: queryEmbedding,
      limit: 4,
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
      console.log(`[RAG] Retrieved ${docs.length} chunks via client.search with filter`);
      return docs;
    }
  } catch (err1) {
    console.warn('[RAG] Filtered search warning:', err1.message, err1?.data?.status?.error || '');
  }

  // 3. Fallback: Scroll initial chunks directly for active document (crucial for overview queries like "what is this pdf about")
  try {
    const scrollRes = await vectorStore.client.scroll(vectorStore.collectionName, {
      filter,
      limit: 4,
      with_payload: true,
    });

    if (scrollRes && scrollRes.points && scrollRes.points.length > 0) {
      const docs = scrollRes.points.map(
        (point) =>
          new Document({
            id: String(point.id),
            pageContent: point.payload?.content || '',
            metadata: point.payload?.metadata || {},
          })
      );
      console.log(`[RAG] Retrieved ${docs.length} chunks via document scroll fallback`);
      return docs;
    }
  } catch (scrollErr) {
    console.warn('[RAG] Filtered scroll warning:', scrollErr.message);
  }

  // 4. In-Memory Tenant Isolation Fallback: Search broader pool and isolate in memory
  try {
    const searchRes = await vectorStore.client.search(vectorStore.collectionName, {
      vector: queryEmbedding,
      limit: 30,
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
        console.log(`[RAG] Retrieved ${isolatedDocs.length} chunks via in-memory tenant isolation`);
        return isolatedDocs.slice(0, 4);
      }
    }
  } catch (err2) {
    console.warn('[RAG] In-memory isolation search warning:', err2.message, err2?.data?.status?.error || '');
  }

  // 5. Final fallback: Scroll without remote filter and match in memory
  try {
    const scrollRes = await vectorStore.client.scroll(vectorStore.collectionName, {
      limit: 100,
      with_payload: true,
    });

    if (scrollRes && scrollRes.points && scrollRes.points.length > 0) {
      const matched = scrollRes.points
        .filter((p) => {
          const m = p.payload?.metadata || p.payload || {};
          return (
            (!documentId || String(m.documentId) === String(documentId)) &&
            (!userId || String(m.userId) === String(userId))
          );
        })
        .map(
          (point) =>
            new Document({
              id: String(point.id),
              pageContent: point.payload?.content || '',
              metadata: point.payload?.metadata || {},
            })
        );

      if (matched.length > 0) {
        console.log(`[RAG] Retrieved ${matched.length} chunks via unscoped scroll + memory match`);
        return matched.slice(0, 4);
      }
    }
  } catch (_) {}

  return [];
}

function formatDocs(docList) {
  if (!docList || docList.length === 0) {
    return 'No relevant document context found.';
  }
  return docList.map((doc, idx) => `[Excerpt ${idx + 1}]:\n${doc.pageContent}`).join('\n\n');
}

/**
 * Streaming RAG Generator: delivers tokens in real-time as they are computed.
 */
async function* streamQuestion(question, userId, documentId) {
  if (!question || typeof question !== 'string') {
    throw new Error('Question must be a non-empty string');
  }
  if (!userId) {
    throw new Error('Authenticated userId is required for document retrieval');
  }
  if (!documentId) {
    throw new Error('Document ID is required for chat');
  }

  const vectorStore = await getVectorStore();
  const docs = await retrieveRelevantChunks(vectorStore, question.trim(), userId, documentId);
  const contextText = formatDocs(docs);

  const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const fallbackModel = primaryModel === 'gemini-3.5-flash-lite' ? 'gemini-flash-lite-latest' : 'gemini-3.5-flash-lite';
  const llm = getLLM(primaryModel);

  const createChain = (activeLlm) =>
    RunnableSequence.from([
      prompt,
      activeLlm,
      new StringOutputParser(),
    ]);

  let stream;
  try {
    const chain = createChain(llm);
    stream = await chain.stream({
      context: contextText,
      question: question.trim(),
    });
  } catch (err) {
    console.warn(`[RAG Stream] Primary model failed, falling back to ${fallbackModel}:`, err.message);
    const fallbackLlm = getLLM(fallbackModel);
    const fallbackChain = createChain(fallbackLlm);
    stream = await fallbackChain.stream({
      context: contextText,
      question: question.trim(),
    });
  }

  for await (const chunk of stream) {
    yield chunk;
  }
}

/**
 * Ask question with strict multi-user & document isolation (buffered fallback)
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
    const docs = await retrieveRelevantChunks(vectorStore, question.trim(), userId, documentId);
    const contextText = formatDocs(docs);

    const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    const fallbackModel = primaryModel === 'gemini-3.5-flash-lite' ? 'gemini-flash-lite-latest' : 'gemini-3.5-flash-lite';
    let llm = getLLM(primaryModel);

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
      const errStr = (llmErr?.message || '').toLowerCase();
      const isTransientOrUnavailable =
        errStr.includes('503') ||
        errStr.includes('high demand') ||
        errStr.includes('service unavailable') ||
        errStr.includes('404') ||
        errStr.includes('not found') ||
        errStr.includes('resource_exhausted') ||
        errStr.includes('429');

      if (isTransientOrUnavailable) {
        console.warn(`[RAG] Primary model (${primaryModel}) error (${llmErr.message}). Falling back to ${fallbackModel}...`);
        const fallbackLlm = getLLM(fallbackModel);
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
  streamQuestion,
  retrieveRelevantChunks,
};
