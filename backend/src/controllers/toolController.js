// =============================================
// Tool Controller
// Handles tool call history and management
// =============================================

const { query } = require('../models/db');
const { getToolCallHistory } = require('../services/toolCallingService');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Get tool call history for a workspace
 * GET /api/tools/history?workspaceId=xxx
 */
const getHistory = async (req, res) => {
  const { workspaceId, limit = 50 } = req.query;

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

  const history = await getToolCallHistory(workspaceId, parseInt(limit));

  res.json({
    toolCalls: history,
  });
};

/**
 * Get tool call details
 * GET /api/tools/history/:id
 */
const getToolCallDetail = async (req, res) => {
  const { id } = req.params;

  const result = await query(
    'SELECT * FROM tool_calls WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    throw new ApiError(404, 'Tool call not found');
  }

  // Verify user has access to the workspace this tool call belongs to
  const toolCall = result.rows[0];
  const workspaceResult = await query(
    'SELECT * FROM workspaces WHERE id = $1 AND user_id = $2',
    [toolCall.workspace_id, req.user.id]
  );

  if (workspaceResult.rows.length === 0) {
    throw new ApiError(403, 'Access denied to this tool call');
  }

  res.json({
    toolCall,
  });
};

/**
 * Get tool definitions (for frontend tool reference)
 * GET /api/tools/definitions
 */
const getToolDefinitions = (req, res) => {
  const { toolDefinitions } = require('../services/toolCallingService');
  
  res.json({
    tools: toolDefinitions,
  });
};

module.exports = {
  getHistory,
  getToolCallDetail,
  getToolDefinitions,
};