// =============================================
// Authentication Routes
// Maps authentication endpoints to Supabase auth logic
// =============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../models/db');
const { ApiError } = require('../middleware/errorHandler');

/**
 * POST /api/auth/register
 * Register a new user
 * Body: { email, password, fullName }
 * Note: Actual auth is handled by Supabase client-side.
 * This endpoint syncs the user data to our database.
 */
router.post('/register', async (req, res) => {
  const { email, supabaseUserId, fullName } = req.body;

  if (!email) {
    throw new ApiError(400, 'Email is required');
  }

  if (!supabaseUserId) {
    throw new ApiError(400, 'supabaseUserId is required');
  }

  // Check if user already exists
  const existing = await query(
    'SELECT * FROM users WHERE supabase_user_id = $1 OR email = $2',
    [supabaseUserId, email]
  );

  if (existing.rows.length > 0) {
    return res.json({
      user: existing.rows[0],
      message: 'User already exists',
    });
  }

  // Create new user
  const result = await query(
    `INSERT INTO users (email, full_name, supabase_user_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email, fullName || '', supabaseUserId]
  );

  // Create default workspace for new user
  await query(
    `INSERT INTO workspaces (user_id, name, description)
     VALUES ($1, 'My Workspace', 'Your default workspace')`,
    [result.rows[0].id]
  );

  res.status(201).json({
    user: result.rows[0],
    message: 'User registered successfully',
  });
});

/**
 * POST /api/auth/login
 * Login endpoint for syncing user data
 * Body: { email, supabaseUserId }
 * Note: Actual authentication happens via Supabase client SDK.
 * This endpoint ensures the user record exists in our database.
 */
router.post('/login', async (req, res) => {
  const { email, supabaseUserId } = req.body;

  if (!email || !supabaseUserId) {
    throw new ApiError(400, 'Email and supabaseUserId are required');
  }

  // Find or create user
  let result = await query(
    'SELECT * FROM users WHERE supabase_user_id = $1',
    [supabaseUserId]
  );

  if (result.rows.length === 0) {
    // Create user
    result = await query(
      `INSERT INTO users (email, full_name, supabase_user_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [email, '', supabaseUserId]
    );

    // Create default workspace
    await query(
      `INSERT INTO workspaces (user_id, name, description)
       VALUES ($1, 'My Workspace', 'Your default workspace')`,
      [result.rows[0].id]
    );
  } else {
    // Update email if changed
    await query('UPDATE users SET email = $1 WHERE supabase_user_id = $2', [email, supabaseUserId]);
  }

  res.json({
    user: result.rows[0],
    message: 'Login successful',
  });
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticate, async (req, res) => {
  res.json({
    user: req.user,
  });
});

module.exports = router;