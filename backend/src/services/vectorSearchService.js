// =============================================
// Vector Search Service
// Performs pgvector similarity search with workspace filtering
// CRITICAL: All queries include workspace_id filter at the DB level
// to prevent cross-workspace data leakage
// =============================================

const { query } = require('../models/db');
const { generateEmbedding } = require('./geminiService');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Search for similar document chunks within a workspace
 * Uses pgvector cosine similarity with workspace_id filtering
 * 
 * @param {Object} params - Search parameters
 * @param {string} params.query - User's query text
 * @param {string} params.workspaceId - Workspace ID to filter by
 * @param {number} params.limit - Maximum number of results (default: 5)
 * @param {number} params.threshold - Minimum similarity score (default: 0.7)
 * @returns {Promise<Array>} - Retrieved chunks with similarity scores
 */
const searchSimilarChunks = async ({
  query: searchQuery,
  workspaceId,
  limit = 5,
  threshold = 0.7,
}) => {
  try {
    // Step 1: Generate embedding for the query
    const embedding = await generateEmbedding(searchQuery);
    
    // Step 2: Perform vector similarity search
    // IMPORTANT: workspace_id filter is INSIDE the SQL query
    // This prevents cross-workspace data leakage at the database level
    const result = await query(
      `SELECT 
        dc.id,
        dc.content,
        dc.chunk_index,
        dc.document_id,
        dc.workspace_id,
        dc.metadata,
        d.filename as document_name,
        d.original_filename as document_title,
        1 - (dc.embedding <=> $1::vector) as similarity
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      WHERE dc.workspace_id = $2
        AND 1 - (dc.embedding <=> $1::vector) > $3
      ORDER BY dc.embedding <=> $1::vector
      LIMIT $4`,
      [`[${embedding.join(',')}]`, workspaceId, threshold, limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Vector search error:', error.message);
    throw new ApiError(500, `Vector search failed: ${error.message}`);
  }
};

/**
 * Search chunks with a simpler interface
 * Returns just the text content for RAG context
 * 
 * @param {string} query - User's query
 * @param {string} workspaceId - Workspace ID
 * @param {number} topK - Number of results
 * @returns {Promise<Array>} - Array of chunk objects with content and metadata
 */
const retrieveContextForRAG = async (query, workspaceId, topK = 5) => {
  const chunks = await searchSimilarChunks({
    query,
    workspaceId,
    limit: topK,
    threshold: 0.3, // Lower threshold for RAG to capture more relevant context
  });

  return chunks.map(chunk => ({
    content: chunk.content,
    chunk_index: chunk.chunk_index,
    document_id: chunk.document_id,
    document_name: chunk.document_name,
    document_title: chunk.document_title,
    similarity: chunk.similarity,
  }));
};

module.exports = {
  searchSimilarChunks,
  retrieveContextForRAG,
};