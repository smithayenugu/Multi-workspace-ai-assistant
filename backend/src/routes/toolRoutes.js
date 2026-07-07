// =============================================
// Tool Routes
// Maps tool history and definitions endpoints
// =============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const toolController = require('../controllers/toolController');

// All tool routes require authentication
router.use(authenticate);

// GET /api/tools/definitions - Get available tool definitions
router.get('/definitions', asyncHandler(toolController.getToolDefinitions));

// GET /api/tools/history - Get tool call history for workspace
router.get('/history', asyncHandler(toolController.getHistory));

// GET /api/tools/history/:id - Get specific tool call details
router.get('/history/:id', asyncHandler(toolController.getToolCallDetail));

module.exports = router;