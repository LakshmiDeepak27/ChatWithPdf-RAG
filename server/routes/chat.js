const express = require('express');
const { getAuth } = require('@clerk/express');
const rateLimit = require('express-rate-limit');
const { askQuestion } = require('../langchain/ragChain');
const { redisConnection } = require('../config/redis');

const router = express.Router();

// Rate limiter for chat endpoint: 60 questions per 15 minutes
const chatRateLimiter = rateLimit({
  windowMs: (Number(process.env.RATE_LIMIT_WINDOW_MIN) || 15) * 60 * 1000,
  max: Number(process.env.CHAT_RATE_LIMIT_MAX) || 60,
  message: { error: 'Too many chat requests. Please wait a moment before sending more queries.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication middleware
function requireAuth(req, res, next) {
  const auth = getAuth(req);
  if (!auth || !auth.userId) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required to chat with documents.' });
  }
  req.userId = auth.userId;
  next();
}

/**
 * POST /chat
 * RAG question-answering endpoint with strict ownership enforcement
 */
router.post('/', chatRateLimiter, requireAuth, async (req, res) => {
  try {
    const { question, documentId } = req.body;

    // Validate inputs
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'A non-empty question is required.' });
    }

    if (question.length > 2000) {
      return res.status(400).json({ error: 'Question exceeds maximum allowed length of 2000 characters.' });
    }

    if (!documentId || typeof documentId !== 'string') {
      return res.status(400).json({ error: 'A valid documentId is required.' });
    }

    const userId = req.userId;

    // Verify document existence and ownership in Redis
    const rawData = await redisConnection.get(`doc:status:${documentId}`);
    if (rawData) {
      const doc = JSON.parse(rawData);

      // Multi-tenant isolation: check ownership
      if (doc.userId !== userId) {
        return res.status(403).json({ error: 'Access denied: You do not own this document.' });
      }

      if (doc.status === 'processing' || doc.status === 'queued') {
        return res.status(400).json({
          error: 'Document is still being processed. Please wait until status is ready.',
          status: doc.status,
          progress: doc.progress || 0,
        });
      }

      if (doc.status === 'failed') {
        return res.status(400).json({
          error: `Document processing failed: ${doc.error || 'Unknown error'}. Please re-upload.`,
          status: 'failed',
        });
      }
    }

    // Execute RAG pipeline filtered strictly by authenticated userId and documentId
    const answer = await askQuestion(question.trim(), userId, documentId);

    return res.json({
      answer,
      documentId,
    });
  } catch (error) {
    console.error('[Chat] Error processing question:', error.message);

    // Differentiate user-facing errors
    if (error.message && error.message.includes('rate limit')) {
      return res.status(429).json({ error: error.message });
    }

    return res.status(500).json({
      error: 'Failed to generate answer from document context. Please try again.',
    });
  }
});

module.exports = router;
