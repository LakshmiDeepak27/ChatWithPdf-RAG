const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { QdrantClient } = require('@qdrant/js-client-rest');

async function clearQdrant() {
  const url = process.env.QDRANT_URL || 'http://localhost:6333';
  const apiKey = process.env.QDRANT_API_KEY || undefined;
  const collectionName = process.env.QDRANT_COLLECTION || 'pdf_documents';

  console.log(`Connecting to Qdrant at: ${url}...`);
  const client = new QdrantClient({
    url,
    apiKey,
    checkCompatibility: false,
  });

  try {
    const collections = await client.getCollections();
    console.log('Existing collections:', collections.collections.map((c) => c.name));

    const exists = collections.collections?.some((c) => c.name === collectionName);
    if (exists) {
      console.log(`Deleting collection "${collectionName}" and all its past vectors...`);
      await client.deleteCollection(collectionName);
      console.log(`Collection "${collectionName}" successfully deleted.`);
    } else {
      console.log(`Collection "${collectionName}" did not exist.`);
    }

    console.log(`Re-creating fresh collection "${collectionName}" with 3072 dims...`);
    await client.createCollection(collectionName, {
      vectors: {
        size: 3072,
        distance: 'Cosine',
      },
    });
    console.log(`Collection "${collectionName}" re-created clean and ready.`);
    console.log('SUCCESS: Qdrant has been completely cleared and reset!');
  } catch (err) {
    console.error(`Failed to clear Qdrant: ${err.message}`);
    if (err.message.includes('fetch failed')) {
      console.log('\nNOTE: Qdrant service is currently not running at ' + url + '.');
      console.log('If using Docker, run: docker-compose up -d qdrant (or docker run -p 6333:6333 qdrant/qdrant)');
    }
  }
}

clearQdrant();

