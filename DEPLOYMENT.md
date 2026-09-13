# Talk-to-PDF — Production Deployment Guide

This guide provides step-by-step instructions for deploying the **Talk-to-PDF** application to production with multi-tenant data isolation, Clerk authentication, background BullMQ processing, Qdrant Cloud vector search, and Google Gemini AI.

---

## 1. Production Architecture Overview

In production, stateful infrastructure (Redis, Vector Database) uses managed cloud services to guarantee persistence, high availability, and automated backups, while stateless processes (Next.js, Express API, BullMQ Worker) run on scalable container/edge hosts.

```
                              INTERNET
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │   Next.js Frontend    │ (Vercel)
                     │     (Port 443)        │
                     └───────────┬───────────┘
                                 │  HTTPS (Bearer JWT)
                                 ▼
                     ┌───────────────────────┐
                     │   Express API Server  │ (Render / Railway / Fly.io)
                     │     (Port 5000)       │
                     └───────┬───────┬───────┘
                             │       │
              Enqueue Job    │       │ Vector Retrieval (User Filtered)
                             ▼       ▼
       ┌────────────────────────┐  ┌────────────────────────┐
       │ Managed Redis / Valkey │  │      Qdrant Cloud      │
       │    (Upstash / Aiven)   │  │   Vector Database      │
       └─────────────┬──────────┘  └───────────▲────────────┘
                     │                         │
         Consume Job │                         │ Upsert Embeddings
                     ▼                         │
       ┌────────────────────────┐              │
       │   BullMQ PDF Worker    │──────────────┘
       │    (Container Host)    │
       └─────────────┬──────────┘
                     │
                     ▼ Embed & Answer
       ┌────────────────────────┐
       │   Google Gemini API    │
       └────────────────────────┘
```

---

## 2. Infrastructure Prerequisites

Before deploying the application components, create and configure your managed services:

### A. Google Gemini AI API Key
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Generate an API Key with access to:
   - `gemini-1.5-flash` (or `gemini-2.5-flash`) for chat generation.
   - `models/gemini-embedding-001` for vector embeddings.
3. Save the key as `GOOGLE_API_KEY`.

### B. Qdrant Cloud (Managed Vector Database)
1. Sign up at [Qdrant Cloud](https://cloud.qdrant.io/).
2. Create a new Cluster (Free Tier available: 1GB RAM, 0.5 CPU).
3. Under Cluster Details, obtain:
   - **Cluster URL**: e.g., `https://xxxxxx-xxxx.us-east-1-0.aws.cloud.qdrant.io:6333`
   - **API Key**: Generate a Read/Write API Key.
4. Save as `QDRANT_URL` and `QDRANT_API_KEY`.

### C. Managed Redis / Valkey (Message Queue & Document State)
1. Sign up at [Upstash](https://upstash.com/) or [Aiven](https://aiven.io/).
2. Create a new Redis database.
3. Copy the standard Redis connection URI (must start with `rediss://` for TLS or `redis://`):
   - Example: `rediss://default:your-token@your-cluster.upstash.io:6379`
4. Save as `REDIS_URL`.

### D. Clerk Authentication
1. Go to your [Clerk Dashboard](https://dashboard.clerk.com/).
2. In your production application settings:
   - Copy **Publishable Key**: `pk_live_...`
   - Copy **Secret Key**: `sk_live_...`
3. In Clerk Dashboard -> **Paths / Redirects**:
   - Add your production Vercel domain to authorized domains (e.g. `https://talktopdf.vercel.app`).
   - Configure sign-in / sign-up redirect URLs.

---

## 3. Environment Variables Matrix

| Variable Name | Required By | Description | Example / Format |
|---|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Frontend, Backend | Clerk public key | `pk_live_...` or `pk_test_...` |
| `CLERK_SECRET_KEY` | Frontend, Backend | Clerk secret key for token verification | `sk_live_...` or `sk_test_...` |
| `NEXT_PUBLIC_API_BASE_URL` | Frontend | URL of deployed Express API | `https://api.talktopdf.com` |
| `PORT` | Backend | Port Express listens on | `5000` |
| `NODE_ENV` | Backend, Worker, Frontend | Node environment | `production` |
| `FRONTEND_URL` | Backend | Deployed frontend origin for strict CORS | `https://talktopdf.vercel.app` |
| `REDIS_URL` | Backend, Worker | Redis / Valkey connection string | `rediss://default:pass@host:port` |
| `QDRANT_URL` | Backend, Worker | Qdrant endpoint | `https://xyz.cloud.qdrant.io:6333` |
| `QDRANT_API_KEY` | Backend, Worker | Qdrant API token | `your-qdrant-api-key` |
| `QDRANT_COLLECTION` | Backend, Worker | Collection name in Qdrant | `pdf_documents` |
| `GOOGLE_API_KEY` | Backend, Worker | Gemini API Key | `AIzaSy...` |
| `GEMINI_MODEL` | Backend, Worker | Gemini chat model | `gemini-1.5-flash` |
| `MAX_FILE_SIZE_MB` | Backend | Max allowed PDF upload size (MB) | `50` |
| `RATE_LIMIT_WINDOW_MIN` | Backend | Rate limiting window (minutes) | `15` |
| `RATE_LIMIT_MAX_REQUESTS` | Backend | Max global requests per window | `500` |
| `UPLOAD_RATE_LIMIT_MAX` | Backend | Max uploads per window | `30` |
| `CHAT_RATE_LIMIT_MAX` | Backend | Max chat queries per window | `60` |

---

## 4. Deploying the Backend API & BullMQ Worker

The Express API and the BullMQ Worker can be deployed on platforms like **Render**, **Railway**, or **Fly.io**.

### Option A: Render.com (Recommended)

1. **Deploy Backend API (Web Service)**:
   - Create a new **Web Service** linked to your GitHub repo.
   - **Root Directory**: `server`
   - **Environment**: `Node` (or `Docker` using `server/Dockerfile`)
   - **Build Command**: `npm ci --omit=dev --legacy-peer-deps`
   - **Start Command**: `npm run server`
   - Set the Environment Variables from the matrix above (`PORT`, `FRONTEND_URL`, `REDIS_URL`, `QDRANT_URL`, `QDRANT_API_KEY`, `GOOGLE_API_KEY`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`).
   - Note the deployed URL (e.g. `https://talktopdf-api.onrender.com`).

2. **Deploy BullMQ Worker (Background Worker)**:
   - Create a new **Background Worker** on Render linked to the same GitHub repo.
   - **Root Directory**: `server`
   - **Environment**: `Node` (or `Docker` using `server/Dockerfile.worker`)
   - **Build Command**: `npm ci --omit=dev --legacy-peer-deps`
   - **Start Command**: `npm run worker`
   - Configure Environment Variables: `REDIS_URL`, `QDRANT_URL`, `QDRANT_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_MODEL`.

---

## 5. Deploying the Frontend (Vercel)

1. Go to [Vercel](https://vercel.com/) and click **Add New Project**.
2. Select your `TalkToPdf` repository.
3. Configure the project:
   - **Framework Preset**: Next.js
   - **Root Directory**: Click "Edit" and select `frontend`
4. Add Environment Variables:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: your Clerk publishable key
   - `CLERK_SECRET_KEY`: your Clerk secret key
   - `NEXT_PUBLIC_API_BASE_URL`: your deployed backend API URL (e.g. `https://talktopdf-api.onrender.com`, **no trailing slash**)
5. Click **Deploy**.
6. After deployment, copy your production domain (e.g. `https://talktopdf.vercel.app`).
7. Update the `FRONTEND_URL` environment variable on your backend service to match your Vercel URL to allow CORS.

---

## 6. Verification and Health Checks

1. **Backend Health Check**:
   ```bash
   curl -i https://your-api-url.onrender.com/health
   ```
   Expected response (HTTP 200):
   ```json
   {
     "status": "ok",
     "uptime": 124,
     "timestamp": "2026-09-13T07:25:00.000Z",
     "services": {
       "redis": "healthy",
       "qdrant": "healthy"
     }
   }
   ```

2. **Authentication Enforcement Check**:
   ```bash
   curl -i -X POST https://your-api-url.onrender.com/chat \
     -H "Content-Type: application/json" \
     -d '{"question":"What is this doc?","documentId":"123"}'
   ```
   Expected response: **HTTP 401 Unauthorized** (`{"error":"Unauthorized: Authentication required to chat with documents."}`).

3. **End-to-End User Verification**:
   - Open your deployed frontend.
   - Sign in via Clerk.
   - Drag and drop a valid PDF file.
   - Verify that the status progresses: Uploading -> Processing -> Ready.
   - Type a question relevant to the PDF.
   - Confirm that Gemini retrieves context and generates an accurate answer.

---

## 7. Security Best Practices & Key Rotation

> [!WARNING]
> **API Key Rotation Notice**:
> If you used test or developer keys during local development in `.env` or `.env.local`, generate new production keys on Google AI Studio and Clerk before launching. Never commit `.env` or `.env.local` files to your Git repository.
