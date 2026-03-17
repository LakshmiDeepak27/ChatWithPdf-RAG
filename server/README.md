# TalkToPDF - RAG System

This project is a full Retrieval-Augmented Generation (RAG) system built with the MERN stack, LangChain JS, ChromaDB, Google Gemini, and BullMQ.

## Features
- Upload PDF documents.
- Background processing using BullMQ and Redis.
- Text extraction and chunking using LangChain's `RecursiveCharacterTextSplitter`.
- Embedding generation using Google Gemini (`text-embedding-004`).
- Persistent Vector Storage using ChromaDB.
- Chat interface to query your PDFs using Gemini LLM (`gemini-1.5-flash`).

## Prerequisites
- Node.js (v18+)
- Redis Server (Running locally or hosted)
- Gemini API Key

## Setup & Local Testing

### 1. Environment Variables
Create a `.env` file in the `/server` directory:

```env
PORT=8000
GEMINI_API_KEY=your_gemini_api_key_here
REDIS_HOST=localhost
REDIS_PORT=6379
CHROMA_DB_PATH=./chroma_db
```

Create a `.env.local` file in `/frontend`:
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_pub_key
CLERK_SECRET_KEY=your_secret_key
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
```

### 2. Run the Backend

```bash
cd server
npm install 
npm run dev      # Starts the API server on port 8000
npm run worker   # Starts the BullMQ worker for background processing
```

### 3. Run the Frontend

```bash
cd frontend
npm install
npm run dev
```

## Deployment Instructions

### Backend (Render or Railway)

The backend consists of two processes: the API server and the background worker. You'll need a Redis instance.

**1. Railway**
- Create a new project on Railway.
- Provision a **Redis** instance within the project.
- Connect your GitHub repository.
- Provide all `.env` variables from above directly in Railway's Variables settings (ensure `REDIS_HOST` points to the internal Railway Redis URL).
- Important: Railway automatically detects `npm start` (make sure `"start": "node index.js"` is in your `package.json`).
- **Worker Setup:** You need to launch a second service (or container) connected to your repository with the start command overriden to: `npm run worker`. This ensures the API and worker run independently.
- Note: ChromaDB uses the local filesystem. For production on ephemeral services like Render/Railway, consider a cloud-hosted Vector database (e.g., Pinecone or hosted Chroma) if you require persistence across redeployments, as local files get wiped.

**2. Render**
- Create a new **Web Service** for the `server` directory. Make its start command `npm run server`.
- Create a new **Worker Service** for the `server` directory. Make its start command `npm run worker`.
- Create a **Redis** instance on Render and add the internal connection URL to the environment variables for both the Web and Worker service.
- Add your `GEMINI_API_KEY` to the environment variables.

### Frontend (Vercel)

**1. Vercel**
- Go to Vercel and create a new project.
- Import the frontend directory from your GitHub repository.
- Set the framework preset to **Next.js**.
- Add all variables from your `.env.local` to Vercel's Environment Variables panel.
- Update `/frontend/app/page.tsx` or `/frontend/app/components/FileUpload.tsx` to point the `fetch` URLs to your deployed backend domain (e.g., `https://your-backend-app.onrender.com`) instead of `http://localhost:8000`.
- Click **Deploy**.
