const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getAuth } = require('@clerk/express');
const rateLimit = require('express-rate-limit');
const { uploadQueue, UPLOAD_QUEUE_NAME } = require('../queues/uploadQueue');
const { redisConnection } = require('../config/redis');
const { isValidPdfBuffer } = require('../utils/pdfLoader');

const router = express.Router();

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Rate limiter for uploads: 30 uploads per 15 minutes per IP/User
const uploadRateLimiter = rateLimit({
  windowMs: (Number(process.env.RATE_LIMIT_WINDOW_MIN) || 15) * 60 * 1000,
  max: Number(process.env.UPLOAD_RATE_LIMIT_MAX) || 30,
  message: { error: 'Too many upload requests. Please wait a few minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication middleware
function requireAuth(req, res, next) {
  const auth = getAuth(req);
  if (!auth || !auth.userId) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required to upload files.' });
  }
  req.userId = auth.userId;
  next();
}

const maxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB) || 50;

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate safe UUID-based file name to prevent collision & path traversal
    const documentId = uuidv4();
    req.generatedDocumentId = documentId;
    cb(null, `${documentId}.pdf`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: maxFileSizeMb * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    // Validate MIME type
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Invalid file format. Only application/pdf is allowed.'));
    }
    // Validate file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.pdf') {
      return cb(new Error('Invalid file extension. File must end with .pdf'));
    }
    cb(null, true);
  },
});

/**
 * POST /upload/pdf
 * Protected PDF upload endpoint with multi-tenant isolation
 */
router.post(
  '/pdf',
  uploadRateLimiter,
  requireAuth,
  (req, res, next) => {
    upload.single('pdf')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: `File too large. Maximum allowed size is ${maxFileSizeMb}MB.`,
          });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No PDF file uploaded' });
      }

      const filePath = req.file.path;
      const documentId = req.generatedDocumentId || uuidv4();
      const userId = req.userId;

      // Validate magic bytes (%PDF-) to prevent disguised files
      const fileHeader = Buffer.alloc(5);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, fileHeader, 0, 5, 0);
      fs.closeSync(fd);

      if (!isValidPdfBuffer(fileHeader)) {
        // Unlink unsafe file immediately
        try { fs.unlinkSync(filePath); } catch (_) {}
        return res.status(400).json({
          error: 'Security validation failed: File does not have a valid PDF signature.',
        });
      }

      // Record initial document status in Redis
      const initialStatus = {
        documentId,
        userId,
        filename: req.file.originalname,
        size: req.file.size,
        status: 'queued',
        progress: 0,
        createdAt: new Date().toISOString(),
      };

      await redisConnection.set(
        `doc:status:${documentId}`,
        JSON.stringify(initialStatus),
        'EX',
        7 * 24 * 3600 // 7 days
      );

      // Enqueue processing job for BullMQ worker
      const job = await uploadQueue.add(UPLOAD_QUEUE_NAME, {
        documentId,
        userId,
        filename: req.file.originalname,
        path: filePath,
        size: req.file.size,
      });

      console.log(`[Upload] Document ${documentId} enqueued in job ${job.id} for user ${userId}`);

      return res.status(202).json({
        status: 'queued',
        documentId,
        jobId: job.id,
        filename: req.file.originalname,
      });
    } catch (error) {
      console.error('[Upload] Error queuing file upload:', error.message);
      // Clean up uploaded file if an error occurred before queueing
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      return res.status(500).json({ error: 'Failed to process and queue file upload.' });
    }
  }
);

/**
 * GET /upload/status/:documentId
 * Checks processing status of an uploaded document with multi-user access control
 */
router.get('/status/:documentId', requireAuth, async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.userId;

    const rawData = await redisConnection.get(`doc:status:${documentId}`);
    if (!rawData) {
      return res.status(404).json({ error: 'Document not found or status has expired.' });
    }

    const doc = JSON.parse(rawData);

    // Multi-tenant check: User can ONLY check status of their own documents
    if (doc.userId !== userId) {
      return res.status(403).json({ error: 'Access denied: You do not own this document.' });
    }

    return res.json({
      documentId: doc.documentId,
      status: doc.status,
      progress: doc.progress || 0,
      filename: doc.filename,
      error: doc.error || null,
      totalChunks: doc.totalChunks || 0,
      pages: doc.pages || null,
      completedAt: doc.completedAt || null,
    });
  } catch (error) {
    console.error('[Upload] Error fetching document status:', error.message);
    return res.status(500).json({ error: 'Internal server error fetching document status.' });
  }
});

module.exports = router;
