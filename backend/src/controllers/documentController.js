// =============================================
// Document Controller
// Handles document upload, listing, and deletion
// =============================================

const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../models/db');
const { processDocument, deleteDocumentChunks } = require('../services/documentService');
const { ApiError } = require('../middleware/errorHandler');
const config = require('../config');

/**
 * Upload a document
 * POST /api/documents/upload
 * Expects: multipart/form-data with file field
 */
const uploadDocument = async (req, res) => {
  const file = req.file;
  const { workspaceId } = req.body;

  if (!file) {
    throw new ApiError(400, 'No file uploaded. Please select a document file.');
  }

  if (!workspaceId) {
    throw new ApiError(400, 'workspaceId is required');
  }

  // Verify workspace ownership
  const workspaceResult = await query(
    'SELECT * FROM workspaces WHERE id = $1 AND user_id = $2',
    [workspaceId, req.user.id]
  );

  if (workspaceResult.rows.length === 0) {
    // Clean up uploaded file
    fs.unlinkSync(file.path);
    throw new ApiError(404, 'Workspace not found');
  }

  // Create document record
  const ext = path.extname(file.originalname) || '';
  const filename = `${uuidv4()}${ext}`;
  const documentResult = await query(
    `INSERT INTO documents (workspace_id, user_id, filename, original_filename, file_size, mime_type, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING *`,
    [workspaceId, req.user.id, filename, file.originalname, file.size, file.mimetype]
  );

  const document = documentResult.rows[0];

  // Start document processing (async - don't await)
  // This runs in the background while we return the response
  processDocument(document, file.path).catch((err) => {
    console.error(`Background document processing failed for ${document.id}:`, err.message);
  });

  res.status(201).json({
    message: 'Document uploaded successfully. Processing has started.',
    document,
  });
};

/**
 * Get all documents in a workspace
 * GET /api/documents?workspaceId=xxx
 */
const getDocuments = async (req, res) => {
  const { workspaceId } = req.query;

  if (!workspaceId) {
    throw new ApiError(400, 'workspaceId query parameter is required');
  }

  // Verify workspace ownership
  const workspaceResult = await query(
    'SELECT * FROM workspaces WHERE id = $1 AND user_id = $2',
    [workspaceId, req.user.id]
  );

  if (workspaceResult.rows.length === 0) {
    throw new ApiError(404, 'Workspace not found');
  }

  // Try the enhanced query with dedup info first; fall back to basic query
  // if the migration hasn't been run yet (columns don't exist)
  let result;
  try {
    result = await query(
      `SELECT d.*, 
              d2.original_filename as duplicate_of_filename,
              (SELECT COUNT(*) FROM document_chunks dc WHERE dc.document_id = d.id) as chunk_count
       FROM documents d
       LEFT JOIN documents d2 ON d2.id = d.duplicate_of
       WHERE d.workspace_id = $1 
       ORDER BY d.created_at DESC`,
      [workspaceId]
    );
  } catch (err) {
    // Fallback: columns don't exist yet (migration not run)
    result = await query(
      `SELECT d.*, 
              (SELECT COUNT(*) FROM document_chunks dc WHERE dc.document_id = d.id) as chunk_count
       FROM documents d 
       WHERE d.workspace_id = $1 
       ORDER BY d.created_at DESC`,
      [workspaceId]
    );
  }

  res.json({
    documents: result.rows,
  });
};

/**
 * Get document by ID
 * GET /api/documents/:id
 */
const getDocument = async (req, res) => {
  const { id } = req.params;

  // Try the enhanced query with dedup info first; fall back to basic query
  let result;
  try {
    result = await query(
      `SELECT d.*, 
              d2.original_filename as duplicate_of_filename,
              (SELECT COUNT(*) FROM document_chunks dc WHERE dc.document_id = d.id) as chunk_count
       FROM documents d
       LEFT JOIN documents d2 ON d2.id = d.duplicate_of
       WHERE d.id = $1 AND d.user_id = $2`,
      [id, req.user.id]
    );
  } catch (err) {
    // Fallback: columns don't exist yet (migration not run)
    result = await query(
      `SELECT d.*, 
              (SELECT COUNT(*) FROM document_chunks dc WHERE dc.document_id = d.id) as chunk_count
       FROM documents d 
       WHERE d.id = $1 AND d.user_id = $2`,
      [id, req.user.id]
    );
  }

  if (result.rows.length === 0) {
    throw new ApiError(404, 'Document not found');
  }

  res.json({
    document: result.rows[0],
  });
};

/**
 * Delete a document and its chunks
 * DELETE /api/documents/:id
 */
const deleteDocument = async (req, res) => {
  const { id } = req.params;

  // Verify ownership
  const existing = await query(
    'SELECT * FROM documents WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );

  if (existing.rows.length === 0) {
    throw new ApiError(404, 'Document not found');
  }

  // Delete chunks first
  await deleteDocumentChunks(id);

  // Delete document record (CASCADE will handle remaining chunks)
  await query('DELETE FROM documents WHERE id = $1 AND user_id = $2', [id, req.user.id]);

  res.json({
    message: 'Document deleted successfully',
  });
};

/**
 * Get document processing status
 * GET /api/documents/:id/status
 */
const getDocumentStatus = async (req, res) => {
  const { id } = req.params;

  // Try the enhanced query with dedup columns first; fall back to basic query
  let result;
  try {
    result = await query(
      'SELECT id, status, error_message, page_count, created_at, updated_at, content_hash, duplicate_of FROM documents WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
  } catch (err) {
    // Fallback: columns don't exist yet (migration not run)
    result = await query(
      'SELECT id, status, error_message, page_count, created_at, updated_at FROM documents WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
  }

  if (result.rows.length === 0) {
    throw new ApiError(404, 'Document not found');
  }

  res.json({
    status: result.rows[0],
  });
};

module.exports = {
  uploadDocument,
  getDocuments,
  getDocument,
  deleteDocument,
  getDocumentStatus,
};