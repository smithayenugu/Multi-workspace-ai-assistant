// =============================================
// Chat Routes
// Maps chat and RAG endpoints to controller
// =============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { sanitizeBody } = require('../middleware/validate');
const chatController = require('../controllers/chatController');

// All chat routes require authentication
router.use(authenticate);

// POST /api/chat/message - Send a chat message (RAG + Tool Calling)
router.post('/message', sanitizeBody, asyncHandler(chatController.sendMessage));

// GET /api/chat/history - Get chat history for workspace
router.get('/history', asyncHandler(chatController.getChatHistory));

// GET /api/chat/messages/:id/citations - Get citations for a message
router.get('/messages/:id/citations', asyncHandler(chatController.getMessageCitations));

module.exports = router;