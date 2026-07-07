// =============================================
// Request Validation Middleware
// Validates request bodies, params, and queries
// =============================================

const { ApiError } = require('./errorHandler');

/**
 * Validates that required fields exist in the request body
 * @param {string[]} fields - Array of required field names
 * @returns {Function} - Express middleware
 */
const requireFields = (fields) => {
  return (req, res, next) => {
    const missing = [];
    
    for (const field of fields) {
      // Support nested fields with dot notation: "user.name"
      const value = field.split('.').reduce((obj, key) => {
        return obj && obj[key] !== undefined ? obj[key] : undefined;
      }, req.body);
      
      if (value === undefined || value === null || value === '') {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      throw new ApiError(400, `Missing required fields: ${missing.join(', ')}`);
    }

    next();
  };
};

/**
 * Validates that a field is a valid UUID
 * @param {string} field - Field name to validate
 * @returns {Function} - Express middleware
 */
const validateUUID = (field, source = 'params') => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  return (req, res, next) => {
    const value = req[source][field];
    
    if (!value) {
      throw new ApiError(400, `${field} is required`);
    }

    if (!uuidRegex.test(value)) {
      throw new ApiError(400, `${field} must be a valid UUID`);
    }

    next();
  };
};

/**
 * Sanitizes string inputs to prevent injection attacks
 * @param {string} input - Raw input string
 * @returns {string} - Sanitized string
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  // Remove control characters
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Limit length to prevent abuse
  if (sanitized.length > 10000) {
    sanitized = sanitized.substring(0, 10000);
  }
  
  return sanitized.trim();
};

/**
 * Middleware to sanitize all string fields in request body
 */
const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeInput(req.body[key]);
      }
    }
  }
  next();
};

/**
 * Validates pagination parameters
 */
const validatePagination = (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;

  if (page < 1) {
    throw new ApiError(400, 'Page must be greater than 0');
  }

  if (limit < 1 || limit > 100) {
    throw new ApiError(400, 'Limit must be between 1 and 100');
  }

  req.pagination = { page, limit, offset: (page - 1) * limit };
  next();
};

module.exports = {
  requireFields,
  validateUUID,
  sanitizeInput,
  sanitizeBody,
  validatePagination,
};