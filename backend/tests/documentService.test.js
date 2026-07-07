const { splitIntoChunks, hardSplitText } = require('../src/services/documentService');

describe('splitIntoChunks', () => {
  test('returns empty array for empty text', () => {
    expect(splitIntoChunks('')).toEqual([]);
  });

  test('returns empty array for whitespace-only text', () => {
    expect(splitIntoChunks('   \n\n  ')).toEqual([]);
  });

  test('returns 1 chunk for short text', () => {
    const result = splitIntoChunks('Hello world');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Hello world');
    expect(result[0].index).toBe(0);
  });

  test('splits long multi-paragraph text into multiple chunks', () => {
    // Build text with several paragraphs, each ~600 chars
    const paragraphs = [];
    for (let i = 0; i < 5; i++) {
      paragraphs.push('Paragraph ' + (i + 1) + '. ' + 'word '.repeat(120));
    }
    const text = paragraphs.join('\n\n');
    
    const result = splitIntoChunks(text, { chunkSize: 500, overlap: 100 });
    
    expect(result.length).toBeGreaterThan(1);
    // Verify no chunk exceeds chunkSize + a small tolerance
    result.forEach(chunk => {
      expect(chunk.text.length).toBeLessThanOrEqual(600);
    });
    // Verify all chunks have valid structure
    result.forEach(chunk => {
      expect(chunk).toHaveProperty('text');
      expect(chunk).toHaveProperty('index');
      expect(chunk).toHaveProperty('metadata');
      expect(typeof chunk.text).toBe('string');
      expect(chunk.text.length).toBeGreaterThan(0);
    });
  });

  test('handles text with no line breaks via hardSplitText fallback', () => {
    // A 2000-word single line (no \n at all) — should produce multiple chunks
    const longLine = 'word '.repeat(2000);
    
    const result = splitIntoChunks(longLine, { chunkSize: 1000, overlap: 200 });
    
    // Should produce multiple chunks, not one giant one
    expect(result.length).toBeGreaterThan(1);
    // Each chunk should be roughly within chunkSize range
    result.forEach(chunk => {
      expect(chunk.text.length).toBeLessThanOrEqual(1200); // chunkSize + some tolerance
    });
  });
});

describe('hardSplitText', () => {
  test('splits text into chunks of given size with overlap', () => {
    // With chunkSize=1000 and overlap=200, step = 800 per iteration
    // Positions: 0, 800, 1600 -> last chunk = 1600..2500 = 900 chars
    const text = 'x'.repeat(2500);
    const result = hardSplitText(text, 1000, 200, 0);
    
    expect(result.length).toBe(3);
    expect(result[0].text.length).toBe(1000);
    expect(result[1].text.length).toBe(1000);
    expect(result[2].text.length).toBe(900);
    expect(result[0].index).toBe(0);
    expect(result[1].index).toBe(1);
    expect(result[2].index).toBe(2);
  });

  test('returns single chunk for text smaller than chunkSize', () => {
    const text = 'small text';
    const result = hardSplitText(text, 1000, 200, 5);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('small text');
    expect(result[0].index).toBe(5);
  });
});