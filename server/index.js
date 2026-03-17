require('dotenv').config();
const express = require('express');
const cors = require('cors');

const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chat');
const { redisConnection } = require('./config/redis');
const { QdrantClient } = require("@qdrant/js-client-rest");

const app = express();

// Middleware
app.use(cors()); 
app.use(express.json()); // Essential for parsing JSON bodies in /chat

// Optional: serve uploaded files statically if needed for debugging
// app.use('/uploads', express.static('uploads'));

// Routes
app.get('/', (req, res) => {
    return res.json({ status: 'TalkToPdf RAG API is running' });
});

app.get('/health', async (req, res) => {
    try {
        const qdrant = new QdrantClient({
            url: process.env.QDRANT_URL,
            checkCompatibility: false
        });

        await Promise.all([
            redisConnection.ping(),
            qdrant.getCollections()
        ]);

        return res.json({ status: 'ok' });
    } catch (error) {
        console.error('Health check failed:', error);
        return res.status(503).json({ status: 'error' });
    }
});

// Mount modular routes
app.use('/upload', uploadRoutes);
app.use('/chat', chatRoutes);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Server started on port: ${PORT}`);
});
