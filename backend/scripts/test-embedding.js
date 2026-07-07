// =============================================
// Manual debug utility — test embedding generation
// Run: node scripts/test-embedding.js
// This is NOT part of the test suite or app code.
// =============================================
require('dotenv').config({ path: '../.env' });

const { generateEmbedding } = require('../src/services/geminiService');

(async () => {
  try {
    const text = 'This is a test document for embedding generation.';
    console.log('Generating embedding for:', text);
    const embedding = await generateEmbedding(text);
    console.log('Embedding generated successfully.');
    console.log('Dimensions:', embedding.length);
    console.log('First 5 values:', embedding.slice(0, 5));
  } catch (error) {
    console.error('Embedding generation failed:', error.message);
  }
})();