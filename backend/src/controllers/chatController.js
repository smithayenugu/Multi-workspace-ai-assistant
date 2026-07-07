// =============================================
// Chat Controller
// Handles RAG chat with tool calling integration
// =============================================

const { query } = require('../models/db');
const { generateChatResponse } = require('../services/geminiService');
const { retrieveContextForRAG } = require('../services/vectorSearchService');
const { toolDefinitions, validateToolArguments, executeTool } = require('../services/toolCallingService');
const { ApiError } = require('../middleware/errorHandler');
const config = require('../config');
const { v4: uuidv4 } = require('uuid');

/**
 * Send a message in the chat
 * POST /api/chat/message
 * Body: { workspaceId, message }
 *
 * Flow:
 * 1. Save user message
 * 2. Retrieve relevant document chunks (RAG)
 * 3. Generate AI response (with tool calling capability)
 * 4. Execute any tool calls the LLM decided to make
 * 5. Save assistant response
 * 6. Return response with citations
 */
const sendMessage = async (req, res) => {
  const { workspaceId, message } = req.body;

  if (!workspaceId) {
    throw new ApiError(400, 'workspaceId is required');
  }

  if (!message || message.trim().length === 0) {
    throw new ApiError(400, 'Message is required');
  }

  // Capture start time for latency measurement
  const requestStartTime = Date.now();

  // Sanitize input to prevent prompt injection
  const sanitizedMessage = message.trim().substring(0, 10000);

  // Verify workspace ownership
  const workspaceResult = await query(
    'SELECT * FROM workspaces WHERE id = $1 AND user_id = $2',
    [workspaceId, req.user.id]
  );

  if (workspaceResult.rows.length === 0) {
    throw new ApiError(404, 'Workspace not found');
  }

  // Step 1: Save user message
  const userMessageResult = await query(
    `INSERT INTO chat_messages (workspace_id, user_id, role, content)
     VALUES ($1, $2, 'user', $3)
     RETURNING *`,
    [workspaceId, req.user.id, sanitizedMessage]
  );
  const userMessage = userMessageResult.rows[0];

  // Step 2: Retrieve relevant document chunks from vector store
  // Always retrieve context - even for action requests, the LLM needs to know
  // whether the action is relevant to the current workspace's documents
  const retrievedChunks = await retrieveContextForRAG(sanitizedMessage, workspaceId, 5);

  // Get recent chat history for context
  const chatHistoryResult = await query(
    `SELECT role, content FROM chat_messages 
     WHERE workspace_id = $1 
     ORDER BY created_at DESC 
     LIMIT 10`,
    [workspaceId]
  );
  const chatHistory = chatHistoryResult.rows.reverse();

  // Step 3: Generate AI response
  const response = await generateChatResponse({
    userMessage: sanitizedMessage,
    chatHistory,
    retrievedChunks,
    toolDefinitions,
  });

  let assistantContent = response.text;
  let toolCallResults = [];

  // Step 4: Execute any tool calls the LLM decided to make
  if (response.toolCalls && response.toolCalls.length > 0) {
    for (const toolCall of response.toolCalls) {
      try {
        // Prompt-injection backstop: check if the user's message plausibly requested this tool call
        // This prevents injected instructions in document content from triggering tool execution
        const isSuspicious = isToolCallSuspicious(toolCall, sanitizedMessage);
        
        if (isSuspicious) {
          // Log as blocked_suspicious and return to user for confirmation
          const { logToolCall, updateToolCallStatus } = require('../services/toolCallingService');
          const toolCallId = await logToolCall({
            toolName: toolCall.tool,
            arguments: toolCall.arguments,
            workspaceId,
            userId: req.user.id,
            chatMessageId: userMessage.id,
            status: 'blocked_suspicious',
          });
          await updateToolCallStatus(toolCallId, 'blocked_suspicious', null, 0, 'Blocked by prompt-injection backstop: user message did not request this action');

          toolCallResults.push({
            tool: toolCall.tool,
            arguments: toolCall.arguments,
            result: {
              success: false,
              blocked: true,
              error: `I noticed a request to perform an action (${toolCall.tool}), but it didn't come from your message directly. Please confirm you want to: ${toolCall.tool} with ${JSON.stringify(toolCall.arguments)}`,
            },
          });

          assistantContent += `\n\n⚠️ I noticed a request to perform an action (${toolCall.tool}), but it didn't come from your message directly. Please confirm you want to proceed.`;
          continue;
        }

        // Validate tool arguments
        const validatedArgs = validateToolArguments(toolCall.tool, toolCall.arguments);

        // Execute the tool
        const toolResult = await executeTool({
          toolName: toolCall.tool,
          arguments: validatedArgs,
          workspaceId,
          userId: req.user.id,
          chatMessageId: userMessage.id,
        });

        toolCallResults.push({
          tool: toolCall.tool,
          arguments: validatedArgs,
          result: toolResult,
        });

        // Append tool execution result to the assistant's response
        if (toolResult.success) {
          assistantContent += `\n\n✅ Tool "${toolCall.tool}" executed successfully: ${toolResult.result.message || JSON.stringify(toolResult.result)}`;
        } else {
          assistantContent += `\n\n❌ Tool "${toolCall.tool}" failed: ${toolResult.error}`;
        }

        // Side-effect: when a task is saved, notify Slack/Discord (best-effort).
        // Sends to ALL configured webhooks (both Discord and Slack if both are set up).
        if (toolCall.tool === 'save_task' && toolResult.success) {
          try {
            const title = toolResult?.result?.title || toolCall?.arguments?.title;
            const summary = `📌 New task created: ${title}`;

            // Send to Discord if configured
            if (config.discordWebhookUrl) {
              const result = await executeTool({
                toolName: 'send_workspace_summary',
                arguments: { platform: 'discord', summary },
                workspaceId,
                userId: req.user.id,
                chatMessageId: userMessage.id,
              });
              console.log('Task notification sent to Discord:', result?.result?.platform || 'discord');
            }

            // Send to Slack if configured (in addition to Discord)
            if (config.slackWebhookUrl) {
              const result = await executeTool({
                toolName: 'send_workspace_summary',
                arguments: { platform: 'slack', summary },
                workspaceId,
                userId: req.user.id,
                chatMessageId: userMessage.id,
              });
              console.log('Task notification sent to Slack:', result?.result?.platform || 'slack');
            }

            if (!config.discordWebhookUrl && !config.slackWebhookUrl) {
              console.warn('Task notification skipped: no webhook configured');
            }

          } catch (e) {
            console.warn('Task notification failed (best-effort):', e.message);
          }
        }
      } catch (toolError) {
        console.error(`Tool execution error for ${toolCall.tool}:`, toolError.message);

        toolCallResults.push({
          tool: toolCall.tool,
          arguments: toolCall.arguments,
          result: {
            success: false,
            error: toolError.message,
          },
        });

        assistantContent += `\n\n❌ Tool "${toolCall.tool}" failed: ${toolError.message}`;
      }
    }
  }

  // Build citations array ONLY from chunks the model actually used
  const usedIndices = response.usedSourceIndices || [];
  const citations = usedIndices
    .filter(idx => idx >= 1 && idx <= retrievedChunks.length)
    .map(idx => {
      const chunk = retrievedChunks[idx - 1];
      return {
        document_id: chunk.document_id,
        document_name: chunk.document_name,
        chunk_index: chunk.chunk_index,
        content_snippet: chunk.content.substring(0, 200),
        similarity: chunk.similarity,
      };
    });

  // Compute observability data
  const latencyMs = Date.now() - requestStartTime;
  const retrievalHit = retrievedChunks.length > 0;
  const promptTokens = response.usageMetadata?.promptTokenCount || null;
  const completionTokens = response.usageMetadata?.candidatesTokenCount || null;

  // Step 5: Save assistant response with observability fields
  // Try with observability columns first; fall back if migration hasn't run
  let assistantMessageResult;
  try {
    assistantMessageResult = await query(
      `INSERT INTO chat_messages (workspace_id, user_id, role, content, citations, latency_ms, prompt_tokens, completion_tokens, retrieval_hit)
       VALUES ($1, $2, 'assistant', $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [workspaceId, req.user.id, assistantContent, JSON.stringify(citations), latencyMs, promptTokens, completionTokens, retrievalHit]
    );
  } catch (err) {
    // Fallback: observability columns don't exist yet (migration not run)
    assistantMessageResult = await query(
      `INSERT INTO chat_messages (workspace_id, user_id, role, content, citations)
       VALUES ($1, $2, 'assistant', $3, $4)
       RETURNING *`,
      [workspaceId, req.user.id, assistantContent, JSON.stringify(citations)]
    );
  }
  const assistantMessage = assistantMessageResult.rows[0];
  
  // Attach observability data for the response (even if not persisted)
  assistantMessage.latency_ms = latencyMs;
  assistantMessage.retrieval_hit = retrievalHit;
  
  // Attach usage metadata for the response
  if (promptTokens !== null || completionTokens !== null) {
    assistantMessage.prompt_tokens = promptTokens;
    assistantMessage.completion_tokens = completionTokens;
  }

  // Step 6: Return response
  res.json({
    userMessage,
    assistantMessage: {
      ...assistantMessage,
      citations,
    },
    toolCalls: toolCallResults,
    retrievedChunks: retrievedChunks.map(c => ({
      document_name: c.document_name,
      similarity: c.similarity,
    })),
  });
};

/**
 * Get chat history for a workspace
 * GET /api/chat/history?workspaceId=xxx
 */
const getChatHistory = async (req, res) => {
  const { workspaceId, limit = 50, before } = req.query;

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
  if (before) {
    // Pagination: get messages before a certain ID
    result = await query(
      `SELECT * FROM chat_messages 
       WHERE workspace_id = $1 AND id < $2
       ORDER BY created_at DESC 
       LIMIT $3`,
      [workspaceId, before, parseInt(limit)]
    );
  } else {
    result = await query(
      `SELECT * FROM chat_messages 
       WHERE workspace_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [workspaceId, parseInt(limit)]
    );
  }

  res.json({
    messages: result.rows.reverse(),
    hasMore: result.rows.length === parseInt(limit),
  });
};

/**
 * Get citations for a specific message
 * GET /api/chat/messages/:id/citations
 */
const getMessageCitations = async (req, res) => {
  const { id } = req.params;

  const result = await query(
    'SELECT * FROM chat_messages WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );

  if (result.rows.length === 0) {
    throw new ApiError(404, 'Message not found');
  }

  const message = result.rows[0];
  const citations = message.citations || [];

  res.json({
    citations,
  });
};

/**
 * Heuristic backstop against prompt-injection-triggered tool calls.
 * Checks whether the user's current message plausibly requested the given tool action.
 * For save_task: requires task-like language in the user's message.
 * For other tools: requires the tool name or action keywords in the user's message.
 * This is intentionally simple — it's a defense-in-depth measure, not a replacement
 * for the system prompt instructing the model not to follow injected commands.
 */
const isToolCallSuspicious = (toolCall, userMessage) => {
  const msg = userMessage.toLowerCase();
  const toolName = toolCall.tool;

  switch (toolName) {
    case 'save_task': {
      // User's message must contain task-like language
      const taskKeywords = /\b(save|create|add|make|set|schedule|log|record|review)\b.*\b(task|reminder|note|item|checklist|todo|action)\b|\b(task|reminder|note).*\b(save|create|add|make)\b/i;
      if (!taskKeywords.test(msg)) {
        console.warn(`[PromptInjectionBackstop] save_task blocked — user message lacks task language: "${userMessage.substring(0, 100)}"`);
        return true;
      }
      return false;
    }
    case 'send_workspace_summary': {
      const summaryKeywords = /\b(send|share|notify|post|summarize|push)\b.*\b(summary|report|update|notification)\b/i;
      if (!summaryKeywords.test(msg)) {
        console.warn(`[PromptInjectionBackstop] send_workspace_summary blocked — user message lacks summary language: "${userMessage.substring(0, 100)}"`);
        return true;
      }
      return false;
    }
    default:
      // Unknown tool — flag as suspicious
      return true;
  }
};

module.exports = {
  sendMessage,
  getChatHistory,
  getMessageCitations,
};

