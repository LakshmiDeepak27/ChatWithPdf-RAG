require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { clerkMiddleware } = require('@clerk/express');
const { QdrantClient } = require('@qdrant/js-client-rest');

const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chat');
const { redisConnection } = require('./config/redis');

const app = express();

// Trust proxy if running behind reverse proxy (Render, Railway, Nginx, Fly.io)
app.set('trust proxy', 1);

// 1. CORS Configuration
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const allowedOrigins = [
  frontendUrl,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy does not allow access from origin ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 2. Body Parser & Rate Limiter
app.use(express.json({ limit: '2mb' }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.GLOBAL_RATE_LIMIT_MAX) || 500,
  message: { error: 'Too many requests from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// 3. Clerk Authentication Middleware
app.use(
  clerkMiddleware({
    publishableKey:
      process.env.CLERK_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  })
);

// 4. Base Information Route
app.get('/', (req, res) => {
  return res.json({
    service: 'TalkToPdf Production API',
    status: 'online',
    version: '1.0.0',
    documentation: 'See README.md for endpoint specifications',
  });
});

// 5. Health & Readiness Endpoint
app.get('/health', async (req, res) => {
  const healthStatus = {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: {
      redis: 'unknown',
      qdrant: 'unknown',
    },
  };

  let isHealthy = true;

  const timeoutPromise = (ms) =>
    new Promise((_, reject) => setTimeout(() => reject(new Error('Probe timeout')), ms));

  // Check Redis connectivity (with 2.5s timeout)
  try {
    const pingResult = await Promise.race([redisConnection.ping(), timeoutPromise(2500)]);
    healthStatus.services.redis = pingResult === 'PONG' ? 'healthy' : 'degraded';
  } catch (err) {
    healthStatus.services.redis = 'unhealthy';
    isHealthy = false;
  }

  // Check Qdrant connectivity (with 2.5s timeout)
  try {
    const qdrant = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY || undefined,
      checkCompatibility: false,
    });
    await Promise.race([qdrant.getCollections(), timeoutPromise(2500)]);
    healthStatus.services.qdrant = 'healthy';
  } catch (err) {
    healthStatus.services.qdrant = 'unhealthy';
    isHealthy = false;
  }

  if (!isHealthy) {
    healthStatus.status = 'degraded';
    return res.status(503).json(healthStatus);
  }

  return res.status(200).json(healthStatus);
});

// 6. Mount Modular API Routes
app.use('/upload', uploadRoutes);
app.use('/chat', chatRoutes);

// 7. 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// 8. Centralized Production Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err.message || err);
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  const statusCode = err.status || 500;
  return res.status(statusCode).json({
    error: process.env.NODE_ENV === 'production'
      ? 'An unexpected internal server error occurred.'
      : err.message,
  });
});

// 9. Start HTTP Server (when run directly)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    console.log(`[TalkToPdf API] Running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });

  // 10. Graceful Shutdown Handlers
  const gracefulShutdown = async (signal) => {
    console.log(`\n[TalkToPdf API] Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      console.log('[TalkToPdf API] HTTP server closed.');
      try {
        await redisConnection.quit();
        console.log('[TalkToPdf API] Redis connections closed.');
        process.exit(0);
      } catch (err) {
        console.error('[TalkToPdf API] Error during shutdown:', err);
        process.exit(1);
      }
    });

    setTimeout(() => {
      console.error('[TalkToPdf API] Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

module.exports = app;

