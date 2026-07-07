// =============================================
// Document Controller
// Handles document upload, listing, and deletion
// =============================================

const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../models/db');
const { processDocument, deleteDocumentChunks } = require('../services/documentService');
const { ApiError } = require('../middleware/errorHandler');
const { supabase } = require('../config/supabaseClient');
const config = require('../config');

const STORAGE_BUCKET = 'documents';

/**
 * Upload a document
 * POST /api/documents/upload
 * Expects: multipart/form-data with file field
 */
const uploadDocument = async (req, res) => {
  const file = req.file; // multer memoryStorage -> file.buffer, no file.path
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
    // No local file to clean up anymore — buffer just gets garbage collected
    throw new ApiError(404, 'Workspace not found');
  }

  // Build filenames / storage path
  const ext = path.extname(file.originalname) || '';
  const filename = `${uuidv4()}${ext}`;
  const storagePath = `${workspaceId}/${filename}`;

  // Upload the buffer to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    throw new ApiError(500, `Failed to store file: ${uploadError.message}`);
  }

  // Create document record — now saving storage_path instead of a local path
  let document;
  try {
    const documentResult = await query(
      `INSERT INTO documents (workspace_id, user_id, filename, original_filename, file_size, mime_type, status, storage_path)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING *`,
      [workspaceId, req.user.id, filename, file.originalname, file.size, file.mimetype, storagePath]
    );
    document = documentResult.rows[0];
  } catch (dbError) {
    // DB insert failed — clean up the file we just uploaded to storage
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    throw dbError;
  }

  // Start document processing (async - don't await)
  // Pass the in-memory buffer directly; processDocument no longer touches disk
  processDocument(document, file.buffer).catch((err) => {
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

  const workspaceResult = await query(
    'SELECT * FROM workspaces WHERE id = $1 AND user_id = $2',
    [workspaceId, req.user.id]
  );

  if (workspaceResult.rows.length === 0) {
    throw new ApiError(404, 'Workspace not found');
  }

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

  const document = existing.rows[0];

  // Delete chunks first
  await deleteDocumentChunks(id);

  // Delete the stored file from Supabase Storage (if it has one)
  if (document.storage_path) {
    const { error: removeError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([document.storage_path]);

    if (removeError) {
      // Don't block deletion of the DB record over a storage cleanup failure —
      // just log it so it can be cleaned up manually later if needed
      console.warn(`Failed to remove storage file for document ${id}:`, removeError.message);
    }
  }

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

  let result;
  try {
    result = await query(
      'SELECT id, status, error_message, page_count, created_at, updated_at, content_hash, duplicate_of FROM documents WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
  } catch (err) {
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