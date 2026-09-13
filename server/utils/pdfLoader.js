const fs = require('fs');
let pdfParse = require('pdf-parse');

if (pdfParse.default) {
  pdfParse = pdfParse.default;
}

/**
 * Validates that the buffer starts with the PDF magic header '%PDF-'
 * @param {Buffer} buffer 
 * @returns {boolean}
 */
function isValidPdfBuffer(buffer) {
  if (!buffer || buffer.length < 5) return false;
  const header = buffer.subarray(0, 5).toString('ascii');
  return header === '%PDF-';
}

/**
 * Extracts text from a PDF file on disk.
 * @param {string} filePath 
 * @returns {Promise<{ text: string, numPages: number }>}
 */
async function extractTextFromPDF(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found at path: ${filePath}`);
  }

  const dataBuffer = fs.readFileSync(filePath);

  if (dataBuffer.length === 0) {
    throw new Error('PDF file is empty (0 bytes).');
  }

  if (!isValidPdfBuffer(dataBuffer)) {
    throw new Error('Invalid PDF format: File does not contain a valid PDF signature.');
  }

  try {
    const data = await pdfParse(dataBuffer);
    const cleanedText = (data.text || '').replace(/\r\n/g, '\n').trim();

    return {
      text: cleanedText,
      numPages: data.numpages || 1,
    };
  } catch (error) {
    if (error.name === 'PasswordException' || (error.message && error.message.toLowerCase().includes('password'))) {
      throw new Error('PDF is password protected. Please remove the password and re-upload.');
    }
    throw new Error(`Failed to parse PDF document: ${error.message}`);
  }
}

module.exports = {
  extractTextFromPDF,
  isValidPdfBuffer,
};
