// =============================================
// Document Processing Service
// Handles text extraction from multiple formats (PDF, DOCX, XLSX, CSV, TXT),
// chunking, and embedding
// =============================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const { parse: csvParse } = require('csv-parse/sync');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../models/db');
const { generateEmbedding, generateEmbeddingsBatch } = require('./geminiService');
const { ApiError } = require('../middleware/errorHandler');
const config = require('../config');

/**
 * Process an uploaded document:
 * 1. Extract text based on file type
 * 2. Split into chunks
 * 3. Generate embeddings for each chunk
 * 4. Store chunks in the vector database
 * 
 * @param {Object} document - Document record from database
 * @param {Buffer} fileBuffer - The uploaded file's contents in memory
 */
const processDocument = async (document, fileBuffer) => {
  console.log(`Extracted text length for ${document.id}:`, extracted.text?.length || 0);
  try {
    // Update document status to processing
    await query(
      'UPDATE documents SET status = $1, updated_at = NOW() WHERE id = $2',
      ['processing', document.id]
    );

    // Step 1: Extract text based on file extension
    const ext = path.extname(document.original_filename || '').toLowerCase();
    const extracted = await extractText(fileBuffer, ext);

    // Step 2: Compute content hash (SHA-256 of extracted text) for deduplication
    let contentHash = null;
    let dedupEnabled = false;
    try {
      contentHash = crypto.createHash('sha256').update(extracted.text, 'utf-8').digest('hex');

      const existingDoc = await query(
        `SELECT id FROM documents 
         WHERE workspace_id = $1 AND content_hash = $2 AND status = 'processed'
         LIMIT 1`,
        [document.workspace_id, contentHash]
      );

      if (existingDoc.rows.length > 0) {
        await query(
          `UPDATE documents 
           SET status = 'duplicate', duplicate_of = $1, updated_at = NOW() 
           WHERE id = $2`,
          [existingDoc.rows[0].id, document.id]
        );

        console.log(`Document ${document.id} is a duplicate of ${existingDoc.rows[0].id}. Skipping chunking.`);

        return; 
      }

      dedupEnabled = true;
    } catch (dedupError) {
      console.log(`Dedup skipped for document ${document.id} (columns not yet available): ${dedupError.message}`);
    }

    // Step 3: Save content_hash if dedup columns exist; always save page_count for PDFs
    if (dedupEnabled && contentHash) {
      const hasPageCount = ext === '.pdf' && extracted.pageCount;
      if (hasPageCount) {
        await query(
          'UPDATE documents SET content_hash = $1, page_count = $2, updated_at = NOW() WHERE id = $3',
          [contentHash, extracted.pageCount, document.id]
        );
      } else {
        await query(
          'UPDATE documents SET content_hash = $1, updated_at = NOW() WHERE id = $2',
          [contentHash, document.id]
        );
      }
    } else if (ext === '.pdf' && extracted.pageCount) {
      await query(
        'UPDATE documents SET page_count = $1, updated_at = NOW() WHERE id = $2',
        [extracted.pageCount, document.id]
      );
    }

    // Step 4: Split into chunks
    const chunks = splitIntoChunks(extracted.text, {
      chunkSize: 1000,
      overlap: 200,
    });

    // Step 5: Generate embeddings in batches
    const chunkTexts = chunks.map(c => c.text);
    const embeddings = await generateEmbeddingsBatch(chunkTexts);

    // Step 6: Store chunks in vector database
    await storeChunks(document, chunks, embeddings);

    // Step 7: Update document status to processed
    await query(
      'UPDATE documents SET status = $1, updated_at = NOW() WHERE id = $2',
      ['processed', document.id]
    );

    // No cleanup step needed here anymore — there is no local file to delete.
    // The original file (if you're keeping it for later viewing) already lives
    // in Supabase Storage, uploaded by the route handler before this function
    // was called. This function only ever worked with the in-memory buffer.

    console.log(`Document ${document.id} processed successfully with ${chunks.length} chunks`);
  } catch (error) {
    console.error('Document processing error:', error.message);

    await query(
      'UPDATE documents SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3',
      ['failed', error.message, document.id]
    );

    throw error;
  }
};

/**
 * Extract text from a file based on its extension
 * @param {string} filePath - Path to the file
 * @param {string} ext - File extension (e.g. .pdf, .docx, .xlsx, .csv, .txt)
 * @returns {Promise<Object>} - Extracted text and metadata
 */
// extractText now takes a buffer instead of a filePath
const extractText = async (fileBuffer, ext) => {
  switch (ext) {
    case '.pdf':
      return await extractTextFromPDF(fileBuffer);
    case '.docx':
    case '.doc':
      return await extractTextFromDocx(fileBuffer);
    case '.xlsx':
    case '.xls':
      return await extractTextFromXlsx(fileBuffer);
    case '.csv':
    case '.tsv':
      return await extractTextFromCsv(fileBuffer, ext === '.tsv');
    case '.txt':
      return await extractTextFromTxt(fileBuffer);
    default:
      throw new ApiError(400, `Unsupported file format: ${ext}`);
  }
};

const extractTextFromPDF = async (fileBuffer) => {
  try {
    const data = await pdfParse(fileBuffer); // pdf-parse already accepts a buffer directly
    return {
      text: data.text,
      pageCount: data.numpages,
      metadata: {
        author: data.info?.Author || null,
        title: data.info?.Title || null,
        subject: data.info?.Subject || null,
      },
    };
  } catch (error) {
    throw new ApiError(500, `Failed to extract text from PDF: ${error.message}`);
  }
};

const extractTextFromDocx = async (fileBuffer) => {
  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer }); // buffer, not path
    return { text: result.value || '', pageCount: null, metadata: {} };
  } catch (error) {
    throw new ApiError(500, `Failed to extract text from Word document: ${error.message}`);
  }
};

const extractTextFromXlsx = async (fileBuffer) => {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' }); // buffer, not readFile(path)
    let text = '';
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const sheetText = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      if (sheetText.trim()) {
        text += `\n--- Sheet: ${sheetName} ---\n${sheetText}\n`;
      }
    });
    return { text: text.trim(), pageCount: null, metadata: { sheets: workbook.SheetNames } };
  } catch (error) {
    throw new ApiError(500, `Failed to extract text from Excel file: ${error.message}`);
  }
};

const extractTextFromCsv = async (fileBuffer, isTsv = false) => {
  try {
    const fileContent = fileBuffer.toString('utf-8'); 
    
    // Auto-detect delimiter: check first line for semicolons vs commas
    const firstLine = fileContent.split('\n')[0] || '';
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const delimiter = isTsv ? '\t' : (semicolonCount > commaCount ? ';' : ',');
    
    const records = csvParse(fileContent, {
      delimiter,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });

    // Build a text where each row includes its column headers
    // This ensures every chunk is self-contained with column context
    let text = '';
    if (records.length > 0) {
      const headers = Object.keys(records[0]);
      text += 'DATASET OVERVIEW\n';
      text += '================\n';
      text += `File type: ${isTsv ? 'TSV' : 'CSV'}\n`;
      text += `Total rows: ${records.length}\n`;
      text += `Columns (${headers.length}): ${headers.join(', ')}\n\n`;
      
      // Include a sample of first few rows with full context
      text += '--- FIRST 3 ROWS (sample) ---\n';
      const sampleSize = Math.min(3, records.length);
      for (let i = 0; i < sampleSize; i++) {
        text += `Row ${i + 1}:\n`;
        headers.forEach((header) => {
          const value = records[i][header] || '';
          text += `  ${header}: ${value}\n`;
        });
        text += '\n';
      }

      // Then each row as a self-contained entry with headers
      text += '--- ALL ROWS ---\n';
      records.forEach((record, index) => {
        text += `Row ${index + 1}:\n`;
        headers.forEach((header) => {
          const value = record[header] || '';
          text += `  ${header}: ${value}\n`;
        });
        text += '\n';
      });
    }

    return {
      text: text.trim() || fileContent,
      pageCount: null,
      metadata: {
        rowCount: records.length,
      },
    };
  } catch (error) {
    // Fallback: read as plain text
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      return {
        text: fileContent,
        pageCount: null,
        metadata: {},
      };
    } catch (fallbackError) {
      throw new ApiError(500, `Failed to extract text from CSV: ${error.message}`);
    }
  }
};

/**
 * Extract text from a plain text file
 */
const extractTextFromTxt = async (fileBuffer) => {
  try {
    const text = fileBuffer.toString('utf-8');
    return { text, pageCount: null, metadata: {} };
  } catch (error) {
    throw new ApiError(500, `Failed to read text file: ${error.message}`);
  }
};

/**
 * Split text into overlapping chunks for embedding
 * Preserves line breaks for structured data (tables, CSV, etc.)
 * Uses semantic chunking by paragraph and sentence boundaries.
 * Falls back to hard character-based splitting when no natural breaks exist.
 * 
 * @param {string} text - Full text to split
 * @param {Object} options - Chunking options
 * @param {number} options.chunkSize - Target size of each chunk (characters)
 * @param {number} options.overlap - Overlap between chunks (characters)
 * @returns {Array<{text: string, index: number, metadata: Object}>}
 */
const splitIntoChunks = (text, options = {}) => {
  const { chunkSize = 1000, overlap = 200 } = options;
  const chunks = [];
  
  // Normalize whitespace but PRESERVE single newlines (for structured data like CSV/table rows)
  // Collapse multiple spaces/tabs into single space, but keep \n
  const cleanText = text.replace(/[ \t]+/g, ' ').trim();
  
  if (!cleanText) {
    return [];
  }

  // Split by double newlines (paragraph breaks) first
  const paragraphs = cleanText.split(/\n\s*\n/);
  let currentChunk = '';
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) continue;

    // If adding this paragraph would exceed chunk size, save current chunk
    if (currentChunk.length + trimmedParagraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex++,
        metadata: {
          charLength: currentChunk.trim().length,
        },
      });

      // Keep some overlap from the end of previous chunk
      const lines = currentChunk.split('\n');
      const overlapLines = lines.slice(-Math.max(1, Math.floor(overlap / 50))); // ~50 chars per line
      currentChunk = overlapLines.join('\n') + '\n';
    }

    // If a single paragraph is larger than chunk size, split by lines (for structured data)
    if (trimmedParagraph.length > chunkSize) {
      // Save any accumulated text first
      if (currentChunk.trim().length > 0) {
        chunks.push({
          text: currentChunk.trim(),
          index: chunkIndex++,
          metadata: {
            charLength: currentChunk.trim().length,
          },
        });
        currentChunk = '';
      }

      // Split paragraph by lines (preserves row structure for CSV/table data)
      const lines = trimmedParagraph.split('\n');
      let lineChunk = '';

      for (const line of lines) {
        // If a single line exceeds chunkSize, hard-split it (no natural break available)
        if (line.length > chunkSize && lineChunk.length === 0) {
          // Push accumulated token, then hard-split the oversized line
          if (lineChunk.trim().length > 0) {
            chunks.push({
              text: lineChunk.trim(),
              index: chunkIndex++,
              metadata: { charLength: lineChunk.trim().length },
            });
            lineChunk = '';
          }
          const hardChunks = hardSplitText(line, chunkSize, overlap, chunkIndex);
          chunks.push(...hardChunks);
          chunkIndex += hardChunks.length;
          continue;
        }

        if (lineChunk.length + line.length > chunkSize && lineChunk.length > 0) {
          chunks.push({
            text: lineChunk.trim(),
            index: chunkIndex++,
            metadata: {
              charLength: lineChunk.trim().length,
            },
          });

          const prevLines = lineChunk.split('\n');
          const overlapLines = prevLines.slice(-Math.max(1, Math.floor(overlap / 50)));
          lineChunk = overlapLines.join('\n') + '\n';
        }
        lineChunk += line + '\n';
      }

      if (lineChunk.trim().length > 0) {
        chunks.push({
          text: lineChunk.trim(),
          index: chunkIndex++,
          metadata: {
            charLength: lineChunk.trim().length,
          },
        });
        lineChunk = '';
      }
    } else {
      currentChunk += trimmedParagraph + '\n\n';
    }
  }

  // Add the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunkIndex++,
      metadata: {
        charLength: currentChunk.trim().length,
      },
    });
  }

  return chunks;
};

/**
 * Hard-split an oversized piece of text into chunkSize pieces with overlap.
 * This is the last-resort fallback when no natural break (paragraph, line) exists.
 * @param {string} text - Text to split
 * @param {number} chunkSize - Target character size per chunk
 * @param {number} overlap - Overlap character count between chunks
 * @param {number} startIndex - Starting chunk index
 * @returns {Array} - Chunks array
 */
const hardSplitText = (text, chunkSize, overlap, startIndex) => {
  const chunks = [];
  let pos = 0;
  let idx = startIndex;
  const effectiveStep = Math.max(chunkSize - overlap, 1);
  while (pos < text.length) {
    const end = Math.min(pos + chunkSize, text.length);
    chunks.push({
      text: text.slice(pos, end).trim(),
      index: idx++,
      metadata: { charLength: end - pos },
    });
    if (end >= text.length) break;
    pos += effectiveStep;
  }
  return chunks;
};

/**
 * Store document chunks with embeddings in the vector database
 * Uses a transaction for atomicity
 * 
 * @param {Object} document - Document record
 * @param {Array} chunks - Text chunks
 * @param {Array} embeddings - Vector embeddings
 */
const storeChunks = async (document, chunks, embeddings) => {
  if (chunks.length !== embeddings.length) {
    throw new ApiError(500, 'Chunks and embeddings count mismatch');
  }

  await transaction(async (client) => {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      
      // Convert embedding array to PostgreSQL vector format
      const embeddingStr = `[${embedding.join(',')}]`;

      await client.query(
        `INSERT INTO document_chunks 
         (id, document_id, workspace_id, user_id, chunk_index, content, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8)`,
        [
          uuidv4(),
          document.id,
          document.workspace_id,
          document.user_id,
          chunk.index,
          chunk.text,
          embeddingStr,
          JSON.stringify(chunk.metadata),
        ]
      );
    }
  });
};

/**
 * Delete all chunks for a document
 * @param {string} documentId - Document ID
 */
const deleteDocumentChunks = async (documentId) => {
  await query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);
};

const { supabase } = require('../config/supabaseClient');
/**
 * Recover documents stuck in 'processing' status.
 * On server startup, reset any documents that have been in 'processing'
 * for more than 5 minutes back to 'pending' and re-trigger processing.
 * If the original file no longer exists on disk, marks the document as 'failed'.
 * @returns {Promise<number>} Number of documents recovered
 */


/**
 * Recover documents stuck in 'processing' status.
 * On server startup, reset any documents that have been in 'processing'
 * for more than 5 minutes back to 'pending' and re-trigger processing.
 * Since files now live in Supabase Storage (not local disk), recovery
 * means re-downloading the file's bytes from storage using storage_path.
 * @returns {Promise<number>} Number of documents recovered
 */
const recoverStuckDocuments = async () => {
  try {
    const stuckDocs = await query(
      `SELECT * FROM documents 
       WHERE status = 'processing' 
         AND updated_at < NOW() - INTERVAL '5 minutes'`
    );

    if (stuckDocs.rows.length === 0) {
      return 0;
    }

    console.log(`Found ${stuckDocs.rows.length} stuck document(s) to recover.`);

    for (const doc of stuckDocs.rows) {
      if (!doc.storage_path) {
        // Old-style document from before the Supabase migration, or the
        // storage path was never saved — nothing to recover from.
        await query(
          `UPDATE documents 
           SET status = 'failed', error_message = 'No storage path on record, please re-upload', updated_at = NOW()
           WHERE id = $1`,
          [doc.id]
        );
        console.log(`Marked document ${doc.id} as failed — no storage_path on record.`);
        continue;
      }

      // Try to re-download the file's bytes from Supabase Storage
      const { data, error } = await supabase.storage
        .from('documents')
        .download(doc.storage_path);

      if (error || !data) {
        // File genuinely missing from storage — mark as failed
        await query(
          `UPDATE documents 
           SET status = 'failed', error_message = 'File no longer available in storage, please re-upload', updated_at = NOW()
           WHERE id = $1`,
          [doc.id]
        );
        console.log(`Marked document ${doc.id} as failed — file not found in storage.`);
        continue;
      }

      // Supabase's download() returns a Blob — convert it to a Buffer
      // so it matches what processDocument expects everywhere else
      const arrayBuffer = await data.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      // File is safe — reset to pending and re-trigger processing
      await query(
        `UPDATE documents 
         SET status = 'pending', error_message = 'Recovered from stuck processing state after server restart', updated_at = NOW()
         WHERE id = $1`,
        [doc.id]
      );
      console.log(`Re-triggering processing for recovered document ${doc.id}`);

      processDocument(doc, fileBuffer).catch((err) => {
        console.error(`Re-processing failed for recovered document ${doc.id}:`, err.message);
      });
    }

    return stuckDocs.rows.length;
  } catch (error) {
    console.error('Failed to recover stuck documents:', error.message);
    return 0;
  }
};

module.exports = {
  processDocument,
  extractText,
  extractTextFromPDF,
  extractTextFromDocx,
  extractTextFromXlsx,
  extractTextFromCsv,
  extractTextFromTxt,
  splitIntoChunks,
  hardSplitText,
  storeChunks,
  deleteDocumentChunks,
  recoverStuckDocuments,
};