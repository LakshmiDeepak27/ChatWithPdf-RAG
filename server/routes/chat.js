const express = require('express');
const { askQuestion } = require('../langchain/ragChain');
const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { question } = req.body;
        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }

        const answer = await askQuestion(question);
        return res.json({ answer });
    } catch (error) {
        console.error('Error in chat endpoint:', error);
        return res.status(500).json({ error: 'Error generating answer' });
    }
});

module.exports = router;
