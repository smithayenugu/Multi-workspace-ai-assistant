// =============================================
// Workspace Routes
// Maps workspace CRUD endpoints to controller
// =============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { sanitizeBody } = require('../middleware/validate');
const workspaceController = require('../controllers/workspaceController');

// All workspace routes require authentication
router.use(authenticate);

// GET /api/workspaces - List all workspaces
router.get('/', asyncHandler(workspaceController.getWorkspaces));

// GET /api/workspaces/:id - Get single workspace
router.get('/:id', asyncHandler(workspaceController.getWorkspace));

// GET /api/workspaces/:id/stats - Get workspace statistics
router.get('/:id/stats', asyncHandler(workspaceController.getWorkspaceStats));

// POST /api/workspaces - Create workspace
router.post('/', sanitizeBody, asyncHandler(workspaceController.createWorkspace));

// PUT /api/workspaces/:id - Update workspace
router.put('/:id', sanitizeBody, asyncHandler(workspaceController.updateWorkspace));

// DELETE /api/workspaces/:id - Delete workspace
router.delete('/:id', asyncHandler(workspaceController.deleteWorkspace));

module.exports = router;