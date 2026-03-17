const fs = require('fs');
const pdfParse = require('pdf-parse');

async function extractTextFromPDF(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
    } catch (error) {
        console.error('Error parsing PDF:', error);
        throw error;
    }
}

module.exports = {
    extractTextFromPDF
};
