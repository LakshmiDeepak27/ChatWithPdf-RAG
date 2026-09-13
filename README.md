# Talk-to-PDF — Production-Grade Multi-Tenant RAG System

Talk-to-PDF is an enterprise-ready Retrieval-Augmented Generation (RAG) web application that enables users to upload PDF documents and ask contextual questions using Google Gemini and Qdrant Vector Database.

## Architecture

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS v4, Lucide Icons, Clerk Authentication.
- **Backend API**: Express 4, `@clerk/express` for cryptographically verified JWT session management, `multer` for secure PDF streaming, `express-rate-limit` for DDoS protection.
- **Background Worker**: BullMQ with Valkey/Redis for asynchronous PDF text extraction, chunking, and embedding generation.
- **Vector Database**: Qdrant Vector Store with strict multi-user metadata filtering (`userId` + `documentId`).
- **AI Models**: Google Gemini (`models/gemini-embedding-001` for vector embeddings, `gemini-1.5-flash` for RAG question-answering).
- **Containerization**: Multi-stage Dockerfiles and Docker Compose for full-stack local development.

---

## Key Production Features

1. **Multi-Tenant Data Isolation**: Documents and embeddings are strictly bound to the authenticated Clerk user. A user can never access or query another user's documents or vectors.
2. **Backend Authentication Enforcement**: Every protected endpoint (`/upload/pdf`, `/upload/status/:id`, `/chat`) validates the Clerk bearer token via `@clerk/express`. Unauthenticated requests return HTTP 401.
3. **PDF Upload Hardening**: Rejects non-PDF files via MIME type, extension, and magic byte validation (`%PDF-`). Enforces 50MB file size limits and generates safe UUID-based file paths to prevent directory traversal.
4. **Ephemeral File Storage**: Temporary PDF files stored during extraction are immediately deleted after processing to avoid disk exhaustion on container hosts.
5. **Real-time Status Tracking**: BullMQ background worker tracks document processing states (`queued` -> `processing` -> `ready` or `failed`), with polling support on the frontend.
6. **Graceful Shutdown & Health Checks**: Robust `GET /health` endpoint verifying Redis and Qdrant readiness, with clean SIGTERM/SIGINT process termination.

---

## Local Development Quickstart

### Prerequisites
- Node.js (v20+ or v22+)
- Docker & Docker Compose (optional, for running local services)
- Google Gemini API Key
- Clerk account credentials

### Option A: Using Docker Compose (Full Stack)

1. Copy `.env.example` to `.env` and fill in your keys:
   ```bash
   cp .env.example .env
   ```
2. Start all 5 services (Frontend, Backend, Worker, Valkey, Qdrant):
   ```bash
   docker compose up --build
   ```
3. Open `http://localhost:3000`.

### Option B: Running Services Locally

1. **Start Redis and Qdrant**:
   ```bash
   docker compose up valkey qdrant -d
   ```

2. **Configure Server**:
   Create `server/.env` based on `server/.env.example`:
   ```env
   PORT=5000
   FRONTEND_URL=http://localhost:3000
   REDIS_URL=redis://localhost:6379
   QDRANT_URL=http://localhost:6333
   QDRANT_COLLECTION=pdf_documents
   GOOGLE_API_KEY=AIzaSy...
   CLERK_SECRET_KEY=sk_test_...
   CLERK_PUBLISHABLE_KEY=pk_test_...
   ```

3. **Install & Run Backend API & Worker**:
   ```bash
   cd server
   npm install --legacy-peer-deps
   npm run server   # In terminal 1 (API on port 5000)
   npm run worker   # In terminal 2 (BullMQ Worker)
   ```

4. **Configure & Run Frontend**:
   Create `frontend/.env.local` based on `frontend/.env.example`:
   ```env
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
   ```

   ```bash
   cd frontend
   npm install
   npm run dev      # Next.js on port 3000
   ```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/` | No | API Service information |
| `GET` | `/health` | No | Health check and dependency readiness (Redis, Qdrant) |
| `POST` | `/upload/pdf` | **Bearer Token** | Upload and queue PDF for processing (Multipart form: `pdf`) |
| `GET` | `/upload/status/:documentId` | **Bearer Token** | Check document processing status (`queued`, `processing`, `ready`, `failed`) |
| `POST` | `/chat` | **Bearer Token** | Query RAG pipeline for an indexed document (`{ question, documentId }`) |

---

## Production Deployment

For complete, step-by-step production deployment on Vercel, Render/Railway, Upstash, Qdrant Cloud, and Clerk, refer to [DEPLOYMENT.md](DEPLOYMENT.md).
