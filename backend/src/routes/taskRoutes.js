// =============================================
// Task Routes
// Maps task CRUD endpoints to controller
// =============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { sanitizeBody } = require('../middleware/validate');
const taskController = require('../controllers/taskController');

// All task routes require authentication
router.use(authenticate);

// GET /api/tasks - List tasks in workspace
router.get('/', asyncHandler(taskController.getTasks));

// POST /api/tasks - Create a task manually
router.post('/', sanitizeBody, asyncHandler(taskController.createTask));

// PUT /api/tasks/:id - Update task status
router.put('/:id', asyncHandler(taskController.updateTask));

// DELETE /api/tasks/:id - Delete a task
router.delete('/:id', asyncHandler(taskController.deleteTask));

module.exports = router;