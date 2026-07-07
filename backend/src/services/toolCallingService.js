// =============================================
// Tool Calling Service
// Defines available tools, validates arguments, and executes them
// Tools: Save Task, Send Workspace Summary (Discord + Slack)
// =============================================

const axios = require('axios');
const { query, transaction } = require('../models/db');
const { ApiError } = require('../middleware/errorHandler');
const config = require('../config');

/**
 * Tool Definitions
 * These are passed to the LLM so it knows what tools are available
 */
const toolDefinitions = [
  {
    name: 'save_task',
    description: 'Save a task with a title and optional description to your task list.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The title of the task (required, max 500 characters)',
          maxLength: 500,
        },
        description: {
          type: 'string',
          description: 'A detailed description of the task (optional, max 5000 characters)',
          maxLength: 5000,
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'send_workspace_summary',
    description: 'Send a summary of the current workspace to a Discord webhook or Slack webhook.',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
    description: 'The platform to send the summary to. Must be either "discord", "slack", or "both".',
        enum: ['discord', 'slack', 'both'],
        },
        summary: {
          type: 'string',
          description: 'The summary text to send (required, max 2000 characters)',
          maxLength: 2000,
        },
      },
      required: ['platform', 'summary'],
    },
  },
];

/**
 * Validate tool arguments against the tool's parameter schema
 * @param {string} toolName - Name of the tool
 * @param {Object} arguments - Arguments to validate
 * @returns {Object} - Validated and sanitized arguments
 */
const validateToolArguments = (toolName, args) => {
  const toolDef = toolDefinitions.find(t => t.name === toolName);
  
  if (!toolDef) {
    throw new ApiError(400, `Unknown tool: ${toolName}`);
  }

  const { properties, required } = toolDef.parameters;
  const validated = {};

  // Check required fields
  for (const field of required) {
    if (args[field] === undefined || args[field] === null || args[field] === '') {
      throw new ApiError(400, `Missing required argument '${field}' for tool '${toolName}'`);
    }
  }

  // Validate and sanitize each argument
  for (const [key, value] of Object.entries(args)) {
    const propDef = properties[key];
    
    if (!propDef) {
      throw new ApiError(400, `Unknown argument '${key}' for tool '${toolName}'`);
    }

    // Type validation
    if (typeof value !== propDef.type) {
      throw new ApiError(400, `Argument '${key}' must be of type ${propDef.type}`);
    }

    // Enum validation
    if (propDef.enum && !propDef.enum.includes(value)) {
      throw new ApiError(400, `Argument '${key}' must be one of: ${propDef.enum.join(', ')}`);
    }

    // String length validation
    if (propDef.type === 'string' && propDef.maxLength) {
      if (value.length > propDef.maxLength) {
        throw new ApiError(400, `Argument '${key}' exceeds maximum length of ${propDef.maxLength} characters`);
      }
    }

    // Sanitize string inputs to prevent injection
    if (typeof value === 'string') {
      validated[key] = sanitizeForTool(value);
    } else {
      validated[key] = value;
    }
  }

  return validated;
};

/**
 * Sanitize string inputs for tool arguments
 * Prevents injection attacks through tool arguments
 */
const sanitizeForTool = (input) => {
  // Remove control characters
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Trim whitespace
  sanitized = sanitized.trim();
  return sanitized;
};

/**
 * Execute a tool call and return the result
 * 
 * @param {Object} params - Execution parameters
 * @param {string} params.toolName - Name of the tool to execute
 * @param {Object} params.arguments - Validated arguments
 * @param {string} params.workspaceId - Current workspace ID
 * @param {string} params.userId - User ID executing the tool
 * @param {string} params.chatMessageId - Associated chat message ID
 * @returns {Promise<Object>} - Tool execution result
 */
const executeTool = async ({
  toolName,
  arguments: args,
  workspaceId,
  userId,
  chatMessageId = null,
}) => {
  const startTime = Date.now();
  
  // Log the tool call
  const toolCallId = await logToolCall({
    toolName,
    arguments: args,
    workspaceId,
    userId,
    chatMessageId,
    status: 'pending',
  });

  try {
    let result;

    switch (toolName) {
      case 'save_task':
        result = await executeSaveTask(args, workspaceId, userId, toolCallId);
        break;
      case 'send_workspace_summary':
        result = await executeSendWorkspaceSummary(args, workspaceId, userId);
        break;

      default:
        throw new ApiError(400, `Unknown tool: ${toolName}`);
    }

    // Update tool call status to success
    const executionTime = Date.now() - startTime;
    await updateToolCallStatus(toolCallId, 'success', result, executionTime);

    return {
      success: true,
      toolCallId,
      result,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    // Update tool call status to failed
    await updateToolCallStatus(toolCallId, 'failed', null, executionTime, error.message);

    return {
      success: false,
      toolCallId,
      error: error.message,
    };
  }
};

/**
 * Tool 1: Save Task
 * Saves a task with title and description to the database
 */
const executeSaveTask = async (args, workspaceId, userId, toolCallId) => {
  const result = await query(
    `INSERT INTO tasks (workspace_id, user_id, tool_call_id, title, description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [workspaceId, userId, toolCallId, args.title, args.description || null]
  );

  return {
    taskId: result.rows[0].id,
    title: result.rows[0].title,
    status: result.rows[0].status,
    message: `Task "${args.title}" has been saved successfully.`,
  };
};

/**
 * Tool 2: Send Workspace Summary
 * Sends a workspace summary to either Discord or Slack webhook
 * The LLM decides which platform to use based on the 'platform' argument
 */
const executeSendWorkspaceSummary = async (args, workspaceId, userId) => {
  const platform = args.platform; // 'discord' or 'slack'

  // Get workspace details for the summary
  const workspaceResult = await query('SELECT * FROM workspaces WHERE id = $1', [workspaceId]);
  const workspace = workspaceResult.rows[0];

  // Get document count for context
  const docCountResult = await query(
    'SELECT COUNT(*) as count FROM documents WHERE workspace_id = $1 AND status = $2',
    [workspaceId, 'processed']
  );
  const documentCount = docCountResult.rows[0].count;

  if (platform === 'discord') {
    return await sendToDiscord(args.summary, workspace, documentCount);
  } else if (platform === 'slack') {
    return await sendToSlack(args.summary, workspace, documentCount);
  } else if (platform === 'both') {
    // Best-effort both: run sequentially so we can return a combined result
    const discordResult = await sendToDiscord(args.summary, workspace, documentCount);
    const slackResult = await sendToSlack(args.summary, workspace, documentCount);
    return {
      platform: 'both',
      discord: discordResult,
      slack: slackResult,
    };
  } else {
    throw new ApiError(400, `Unsupported platform: ${platform}. Must be 'discord', 'slack', or 'both'.`);
  }
};

/**
 * Send summary to Discord webhook (plain text, no embed cards)
 */
const sendToDiscord = async (summary, workspace, documentCount) => {
  if (!config.discordWebhookUrl) {
    throw new ApiError(500, 'Discord webhook is not configured. Please set DISCORD_WEBHOOK_URL in environment variables.');
  }

  const payload = {
    content: `📋 **Workspace Summary: ${workspace.name}**\n\n${summary}\n\n*${documentCount} documents processed*`,
  };

  try {
    const response = await axios.post(config.discordWebhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    return {
      platform: 'discord',
      message: 'Workspace summary sent to Discord successfully.',
      webhookStatus: response.status,
    };
  } catch (error) {
    if (error.response) {
      throw new ApiError(500, `Discord webhook failed with status ${error.response.status}: ${error.response.data?.message || 'Unknown error'}`);
    } else if (error.request) {
      throw new ApiError(500, 'Discord webhook is unreachable. Please check the webhook URL.');
    } else {
      throw new ApiError(500, `Discord webhook error: ${error.message}`);
    }
  }
};

/**
 * Send summary to Slack webhook
 * Slack uses a simpler JSON format compared to Discord
 */
const sendToSlack = async (summary, workspace, documentCount) => {
  if (!config.slackWebhookUrl) {
    throw new ApiError(500, 'Slack webhook is not configured. Please set SLACK_WEBHOOK_URL in environment variables.');
  }

  const payload = {
    text: `📋 *Workspace Summary: ${workspace.name}*`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📋 Workspace Summary: ${workspace.name}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: summary,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Workspace:*\n${workspace.name}`,
          },
          {
            type: 'mrkdwn',
            text: `*Documents:*\n${documentCount} documents processed`,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Sent from Multi-Workspace Document Assistant • ${new Date().toLocaleString()}`,
          },
        ],
      },
    ],
  };

  try {
    const response = await axios.post(config.slackWebhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    return {
      platform: 'slack',
      message: 'Workspace summary sent to Slack successfully.',
      webhookStatus: response.status,
    };
  } catch (error) {
    if (error.response) {
      throw new ApiError(500, `Slack webhook failed with status ${error.response.status}: ${error.response.data?.message || 'Unknown error'}`);
    } else if (error.request) {
      throw new ApiError(500, 'Slack webhook is unreachable. Please check the webhook URL.');
    } else {
      throw new ApiError(500, `Slack webhook error: ${error.message}`);
    }
  }
};

/**
 * Log a tool call in the database
 */
const logToolCall = async ({ toolName, arguments: args, workspaceId, userId, chatMessageId, status }) => {
  const result = await query(
    `INSERT INTO tool_calls (workspace_id, user_id, chat_message_id, tool_name, arguments, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [workspaceId, userId, chatMessageId, toolName, JSON.stringify(args), status]
  );
  return result.rows[0].id;
};

/**
 * Update tool call status after execution
 */
const updateToolCallStatus = async (toolCallId, status, result, executionTimeMs, errorMessage = null) => {
  await query(
    `UPDATE tool_calls 
     SET status = $1, result = $2, execution_time_ms = $3, error_message = $4
     WHERE id = $5`,
    [status, result ? JSON.stringify(result) : null, executionTimeMs, errorMessage, toolCallId]
  );
};

/**
 * Get tool call history for a workspace
 */
const getToolCallHistory = async (workspaceId, limit = 50) => {
  const result = await query(
    `SELECT * FROM tool_calls 
     WHERE workspace_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [workspaceId, limit]
  );
  return result.rows;
};

/**
 * Convert the internal toolDefinitions array to Gemini SDK's functionDeclarations format.
 * The SDK expects: { functionDeclarations: [{ name, description, parameters: { type: "OBJECT", properties, required } }] }
 * @param {Array} definitions - Internal tool definitions
 * @returns {Array} - Array suitable for the Gemini SDK's `tools` parameter
 */
const convertToFunctionDeclarations = (definitions) => {
  if (!definitions || definitions.length === 0) return [];
  return definitions.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'OBJECT',
      properties: tool.parameters.properties || {},
      required: tool.parameters.required || [],
    },
  }));
};

module.exports = {
  toolDefinitions,
  validateToolArguments,
  executeTool,
  getToolCallHistory,
  convertToFunctionDeclarations,
};
