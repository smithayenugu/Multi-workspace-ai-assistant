// =============================================
// Authentication Middleware
// Verifies Supabase JWT tokens and attaches user to request
// =============================================

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { query } = require('../models/db');

// Create Supabase admin client for token verification
const supabaseAdmin = config.supabase.url && config.supabase.serviceRoleKey
  ? createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

/**
 * Middleware: Verify Supabase JWT token from Authorization header
 * Uses Supabase's built-in token verification
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No authorization token provided',
      });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        error: 'Invalid token format',
        message: 'Authorization header must be in format: Bearer <token>',
      });
    }

    const token = parts[1];

    // Verify the token using Supabase
    const { data: { user: supabaseUser }, error: verifyError } = await supabaseAdmin.auth.getUser(token);

    if (verifyError || !supabaseUser) {
      console.warn('Token verification failed:', verifyError?.message);
      return res.status(401).json({
        error: 'Invalid or expired token',
        message: 'Please login again',
      });
    }

    // Find or create user in our database
    const supabaseUserId = supabaseUser.id;
    const email = supabaseUser.email || '';
    const fullName = supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || '';

    let userResult = await query(
      'SELECT * FROM users WHERE supabase_user_id = $1',
      [supabaseUserId]
    );

    let user;
    if (userResult.rows.length === 0) {
      const newUser = await query(
        `INSERT INTO users (email, full_name, supabase_user_id)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [email, fullName, supabaseUserId]
      );
      user = newUser.rows[0];
    } else {
      user = userResult.rows[0];
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      supabaseUserId: user.supabase_user_id,
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      error: 'Authentication error',
      message: 'An unexpected error occurred during authentication',
    });
  }
};

/**
 * Middleware: Verify that the user has access to a specific workspace
 */
const authorizeWorkspace = async (req, res, next) => {
  try {
    const workspaceId = req.params.workspaceId || req.body.workspaceId || req.query.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({
        error: 'Workspace ID required',
        message: 'A workspace ID is required for this operation',
      });
    }

    const result = await query(
      'SELECT * FROM workspaces WHERE id = $1',
      [workspaceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'The specified workspace does not exist',
      });
    }

    const workspace = result.rows[0];

    if (workspace.user_id !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this workspace',
      });
    }

    req.workspace = workspace;
    next();
  } catch (error) {
    console.error('Workspace authorization error:', error);
    return res.status(500).json({
      error: 'Authorization error',
      message: 'An unexpected error occurred during workspace authorization',
    });
  }
};

module.exports = {
  authenticate,
  authorizeWorkspace,
};