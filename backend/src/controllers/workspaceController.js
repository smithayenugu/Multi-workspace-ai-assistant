// =============================================
// Workspace Controller
// Handles CRUD operations for workspaces
// =============================================

const { query } = require('../models/db');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Get all workspaces for the authenticated user
 * GET /api/workspaces
 */
const getWorkspaces = async (req, res) => {
  const result = await query(
    'SELECT * FROM workspaces WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );

  res.json({
    workspaces: result.rows,
  });
};

/**
 * Get a single workspace by ID
 * GET /api/workspaces/:id
 */
const getWorkspace = async (req, res) => {
  const { id } = req.params;

  const result = await query(
    'SELECT * FROM workspaces WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );

  if (result.rows.length === 0) {
    throw new ApiError(404, 'Workspace not found');
  }

  res.json({
    workspace: result.rows[0],
  });
};

/**
 * Create a new workspace
 * POST /api/workspaces
 */
const createWorkspace = async (req, res) => {
  const { name, description } = req.body;

  if (!name || name.trim().length === 0) {
    throw new ApiError(400, 'Workspace name is required');
  }

  if (name.length > 255) {
    throw new ApiError(400, 'Workspace name must be 255 characters or less');
  }

  const result = await query(
    `INSERT INTO workspaces (user_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [req.user.id, name.trim(), description || null]
  );

  res.status(201).json({
    workspace: result.rows[0],
  });
};

/**
 * Update a workspace
 * PUT /api/workspaces/:id
 */
const updateWorkspace = async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  // Verify ownership
  const existing = await query(
    'SELECT * FROM workspaces WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );

  if (existing.rows.length === 0) {
    throw new ApiError(404, 'Workspace not found');
  }

  if (name && name.length > 255) {
    throw new ApiError(400, 'Workspace name must be 255 characters or less');
  }

  const result = await query(
    `UPDATE workspaces 
     SET name = COALESCE($1, name), 
         description = COALESCE($2, description),
         updated_at = NOW()
     WHERE id = $3 AND user_id = $4
     RETURNING *`,
    [name || null, description !== undefined ? description : null, id, req.user.id]
  );

  res.json({
    workspace: result.rows[0],
  });
};

/**
 * Delete a workspace and all associated data
 * DELETE /api/workspaces/:id
 */
const deleteWorkspace = async (req, res) => {
  const { id } = req.params;

  // Verify ownership
  const existing = await query(
    'SELECT * FROM workspaces WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );

  if (existing.rows.length === 0) {
    throw new ApiError(404, 'Workspace not found');
  }

  // Delete workspace (CASCADE will handle related records)
  await query('DELETE FROM workspaces WHERE id = $1 AND user_id = $2', [id, req.user.id]);

  res.json({
    message: 'Workspace deleted successfully',
  });
};

/**
 * Get workspace statistics
 * GET /api/workspaces/:id/stats
 */
const getWorkspaceStats = async (req, res) => {
  const { id } = req.params;

  // Verify ownership
  const existing = await query(
    'SELECT * FROM workspaces WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );

  if (existing.rows.length === 0) {
    throw new ApiError(404, 'Workspace not found');
  }

  // Get document count - using CASE instead of FILTER for broader PostgreSQL compatibility
  const docCount = await query(
    `SELECT 
       COUNT(*) as total, 
       SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) as processed 
     FROM documents WHERE workspace_id = $1`,
    [id]
  );

  // Get chat message count
  const chatCount = await query(
    'SELECT COUNT(*) as total FROM chat_messages WHERE workspace_id = $1',
    [id]
  );

  // Get task count
  const taskCount = await query(
    'SELECT COUNT(*) as total FROM tasks WHERE workspace_id = $1',
    [id]
  );

  // Get tool call count
  const toolCallCount = await query(
    'SELECT COUNT(*) as total FROM tool_calls WHERE workspace_id = $1',
    [id]
  );

  res.json({
    stats: {
      documents: parseInt(docCount.rows[0].total),
      documentsProcessed: parseInt(docCount.rows[0].processed),
      chatMessages: parseInt(chatCount.rows[0].total),
      tasks: parseInt(taskCount.rows[0].total),
      toolCalls: parseInt(toolCallCount.rows[0].total),
    },
  });
};

module.exports = {
  getWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getWorkspaceStats,
};