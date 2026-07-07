// =============================================
// Task Controller
// Handles task CRUD operations
// Tasks are created via tool calling or manually
// =============================================

const { query } = require('../models/db');
const { ApiError } = require('../middleware/errorHandler');
const config = require('../config');
const { executeTool } = require('../services/toolCallingService');

/**
 * Get all tasks for a workspace
 * GET /api/tasks?workspaceId=xxx
 */
const getTasks = async (req, res) => {
  const { workspaceId, status, limit = 50 } = req.query;

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

  let result;
  if (status) {
    result = await query(
      `SELECT t.*, 
              tc.tool_name as created_by_tool,
              tc.created_at as tool_call_time
       FROM tasks t
       LEFT JOIN tool_calls tc ON tc.id = t.tool_call_id
       WHERE t.workspace_id = $1 AND t.user_id = $2 AND t.status = $3
       ORDER BY t.created_at DESC
       LIMIT $4`,
      [workspaceId, req.user.id, status, parseInt(limit)]
    );
  } else {
    result = await query(
      `SELECT t.*, 
              tc.tool_name as created_by_tool,
              tc.created_at as tool_call_time
       FROM tasks t
       LEFT JOIN tool_calls tc ON tc.id = t.tool_call_id
       WHERE t.workspace_id = $1 AND t.user_id = $2
       ORDER BY t.created_at DESC
       LIMIT $3`,
      [workspaceId, req.user.id, parseInt(limit)]
    );
  }

  res.json({
    tasks: result.rows,
  });
};

/**
 * Create a task manually (not via tool calling)
 * POST /api/tasks
 */
const createTask = async (req, res) => {
  const { workspaceId, title, description } = req.body;

  if (!workspaceId) {
    throw new ApiError(400, 'workspaceId is required');
  }

  if (!title || title.trim().length === 0) {
    throw new ApiError(400, 'Task title is required');
  }

  if (title.length > 500) {
    throw new ApiError(400, 'Task title must be 500 characters or less');
  }

  // Verify workspace ownership
  const workspaceResult = await query(
    'SELECT * FROM workspaces WHERE id = $1 AND user_id = $2',
    [workspaceId, req.user.id]
  );

  if (workspaceResult.rows.length === 0) {
    throw new ApiError(404, 'Workspace not found');
  }

  const result = await query(
    `INSERT INTO tasks (workspace_id, user_id, title, description)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [workspaceId, req.user.id, title.trim(), description || null]
  );

  const task = result.rows[0];

  // Send Slack/Discord notification for manual task creation (best-effort)
  // Uses the same webhook tool logic as the AI save_task path.
  try {
    const summary = `📌 New task created: ${task.title}`;

    if (config.discordWebhookUrl) {
      await executeTool({
        toolName: 'send_workspace_summary',
        arguments: { platform: 'discord', summary },
        workspaceId,
        userId: req.user.id,
        chatMessageId: null,
      });
    }

    if (config.slackWebhookUrl) {
      await executeTool({
        toolName: 'send_workspace_summary',
        arguments: { platform: 'slack', summary },
        workspaceId,
        userId: req.user.id,
        chatMessageId: null,
      });
    }

    if (!config.discordWebhookUrl && !config.slackWebhookUrl) {
      console.warn('Task notification skipped: no webhook configured');
    }
  } catch (e) {
    console.warn('Manual task notification failed (best-effort):', e.message);
  }

  res.status(201).json({
    task,
  });
};

/**
 * Update task status
 * PUT /api/tasks/:id
 * Body: { workspaceId, status }
 */
const updateTask = async (req, res) => {
  const { id } = req.params;
  const { workspaceId, status } = req.body;

  if (!workspaceId) {
    throw new ApiError(400, 'workspaceId is required');
  }

  const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
  if (!status || !validStatuses.includes(status)) {
    throw new ApiError(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  // Verify ownership AND workspace isolation
  const existing = await query(
    'SELECT * FROM tasks WHERE id = $1 AND user_id = $2 AND workspace_id = $3',
    [id, req.user.id, workspaceId]
  );

  if (existing.rows.length === 0) {
    throw new ApiError(404, 'Task not found in this workspace');
  }

  const result = await query(
    `UPDATE tasks 
     SET status = $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3 AND workspace_id = $4
     RETURNING *`,
    [status, id, req.user.id, workspaceId]
  );

  res.json({
    task: result.rows[0],
  });
};

/**
 * Delete a task
 * DELETE /api/tasks/:id
 * Query: ?workspaceId=xxx
 */
const deleteTask = async (req, res) => {
  const { id } = req.params;
  const workspaceId = req.query.workspaceId || req.body.workspaceId;

  if (!workspaceId) {
    throw new ApiError(400, 'workspaceId is required');
  }

  const existing = await query(
    'SELECT * FROM tasks WHERE id = $1 AND user_id = $2 AND workspace_id = $3',
    [id, req.user.id, workspaceId]
  );

  if (existing.rows.length === 0) {
    throw new ApiError(404, 'Task not found in this workspace');
  }

  await query('DELETE FROM tasks WHERE id = $1 AND user_id = $2 AND workspace_id = $3', [id, req.user.id, workspaceId]);

  res.json({
    message: 'Task deleted successfully',
  });
};

module.exports = {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
};