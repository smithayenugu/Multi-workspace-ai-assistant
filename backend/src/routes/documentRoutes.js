// =============================================
// Document Routes
// Maps document CRUD endpoints to controller
// =============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const upload = require('../middleware/upload');
const documentController = require('../controllers/documentController');

// All document routes require authentication
router.use(authenticate);

// POST /api/documents/upload - Upload PDF document
router.post('/upload', upload.single('file'), asyncHandler(documentController.uploadDocument));

// GET /api/documents - List documents in workspace
router.get('/', asyncHandler(documentController.getDocuments));

// GET /api/documents/:id - Get document details
router.get('/:id', asyncHandler(documentController.getDocument));

// GET /api/documents/:id/status - Get document processing status
router.get('/:id/status', asyncHandler(documentController.getDocumentStatus));

// DELETE /api/documents/:id - Delete document
router.delete('/:id', asyncHandler(documentController.deleteDocument));

module.exports = router;