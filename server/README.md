# TalkToPDF — Backend API & BullMQ Worker

This directory contains the Express API and BullMQ background worker for the TalkToPDF application.

## Scripts

- `npm run server` — Runs the Express API server (default port 5000)
- `npm run worker` — Runs the BullMQ background PDF processing worker
- `npm run dev` — Runs the API with nodemon for development

## Architecture

- **`index.js`**: Express server setup, CORS, Clerk middleware, rate limiting, and health checks.
- **`routes/upload.js`**: Protected PDF upload handler with magic-byte validation and BullMQ job queueing.
- **`routes/chat.js`**: Protected RAG chat endpoint with multi-tenant ownership enforcement.
- **`workers/pdfWorker.js`**: BullMQ worker that extracts PDF text, creates chunks, computes Gemini embeddings, stores vectors in Qdrant, updates Redis document status, and cleans up temporary files.
- **`langchain/vectorStore.js`**: Qdrant Vector Store connection and multi-tenant filter builder.
- **`langchain/ragChain.js`**: LangChain LCEL RAG execution chain with Gemini.
- **`config/redis.js`**: Redis/Valkey connection configuration supporting cloud TLS (`rediss://`).

See root [DEPLOYMENT.md](../DEPLOYMENT.md) for full deployment instructions.
