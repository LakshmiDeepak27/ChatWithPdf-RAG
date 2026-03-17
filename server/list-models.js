require('dotenv').config();
const fs = require('fs');

async function run() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GOOGLE_API_KEY}`);
  const data = await res.json();
  if (!data.models) {
    fs.writeFileSync('models.json', JSON.stringify(data, null, 2));
    return;
  }
  const embeddings = data.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('embedContent'));
  fs.writeFileSync('models.json', JSON.stringify(embeddings, null, 2));
}
run();
