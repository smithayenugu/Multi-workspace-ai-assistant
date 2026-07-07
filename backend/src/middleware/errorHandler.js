// =============================================
// Global Error Handler Middleware
// Catches all errors and returns consistent JSON responses
// =============================================

const config = require('../config');

/**
 * Custom API Error class
 * Allows throwing errors with specific HTTP status codes
 */
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Not Found handler
 * Catches all unmatched routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`);
  next(error);
};

/**
 * Global error handler
 * Catches all errors and returns consistent JSON response
 */
const errorHandler = (err, req, res, next) => {
  // Log the error
  console.error(`[${new Date().toISOString()}] Error:`, {
    message: err.message,
    stack: config.isDev ? err.stack : undefined,
    path: req.originalUrl,
    method: req.method,
  });

  // Determine status code
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details || null;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error';
    details = err.details || err.message;
  }

  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid or expired token';
  }

  if (err.name === 'MulterError') {
    statusCode = 400;
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File size exceeds the maximum limit (10MB)';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files uploaded';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        break;
      default:
        message = err.message;
    }
  }

  // Handle PostgreSQL errors
  if (err.code && err.code.startsWith('2')) {
    // PostgreSQL error codes starting with '2' are data errors
    statusCode = 400;
    message = 'Database operation failed';
    details = config.isDev ? err.message : undefined;
  }

  if (err.code === '23505') {
    // Unique violation
    statusCode = 409;
    message = 'Resource already exists';
    details = err.detail;
  }

  if (err.code === '23503') {
    // Foreign key violation
    statusCode = 400;
    message = 'Referenced resource does not exist';
    details = err.detail;
  }

  // Don't expose internal errors in production
  if (statusCode === 500 && config.isProd) {
    message = 'An unexpected error occurred';
    details = null;
  }

  // Send response
  res.status(statusCode).json({
    error: message,
    statusCode,
    ...(details && { details }),
    ...(config.isDev && statusCode === 500 && { stack: err.stack }),
  });
};

/**
 * Async handler wrapper
 * Catches errors from async route handlers and passes them to the error handler
 * @param {Function} fn - Async route handler
 * @returns {Function} - Wrapped handler
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  ApiError,
  notFoundHandler,
  errorHandler,
  asyncHandler,
};