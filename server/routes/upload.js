const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { uploadQueue, UPLOAD_QUEUE_NAME } = require('../queues/uploadQueue');
const router = express.Router();

const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({ storage: storage });

router.post('/pdf', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        const jobData = {
            filename: req.file.originalname,
            destination: req.file.destination,
            path: req.file.path,
        };

        await uploadQueue.add(UPLOAD_QUEUE_NAME, jobData);
        
        return res.json({ status: 'queued' });
    } catch (error) {
        console.error('Error queuing file upload:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
