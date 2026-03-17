const pdfParse = require('pdf-parse');
console.log('Keys:', Object.keys(pdfParse));
if (typeof pdfParse.default === 'function') {
  console.log('Has default function!');
}
