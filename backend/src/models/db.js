// =============================================
// Database Connection Pool
// PostgreSQL connection using pg module
// =============================================

const { Pool } = require('pg');
const config = require('../config');

let pool = null;

/**
 * Get or create the database connection pool
 * Uses singleton pattern to ensure only one pool exists
 */
const getPool = () => {
  if (!pool) {
    pool = new Pool({
      connectionString: config.database.url,
      ssl: { rejectUnauthorized: false }, // Supabase requires SSL
      // Connection pool settings
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // 10 second timeout
    });

    // Log pool events
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client:', err);
    });

    pool.on('connect', () => {
      console.log('New client connected to database');
    });
  }
  return pool;
};

/**
 * Execute a SQL query with parameters
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} - Query result
 */
const query = async (text, params = []) => {
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Execute a transaction with multiple queries
 * @param {Function} callback - Async function that receives a client and executes queries
 * @returns {Promise<any>} - Result of the callback
 */
const transaction = async (callback) => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction error:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Test the database connection
 * @returns {Promise<boolean>} - True if connection is successful
 */
const testConnection = async () => {
  try {
    const result = await query('SELECT NOW()');
    console.log('Database connected successfully at:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return false;
  }
};

module.exports = {
  getPool,
  query,
  transaction,
  testConnection,
};