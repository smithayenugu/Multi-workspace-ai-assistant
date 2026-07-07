// =============================================
// Server Entry Point
// Starts the Express server and connects to database
// =============================================

const app = require('./src/app');
const config = require('./src/config');
const { testConnection } = require('./src/models/db');
const { recoverStuckDocuments } = require('./src/services/documentService');

/**
 * Start the server
 * 1. Test database connection
 * 2. Recover any documents stuck in 'processing' status
 * 3. Start listening on configured port
 */
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.warn('⚠️  Database connection failed. Server will start but database operations may fail.');
      console.warn('   Make sure DATABASE_URL is correctly set in .env file.');
    }

    // Recover documents stuck in 'processing' from a previous crash
    if (dbConnected) {
      const recovered = await recoverStuckDocuments();
      if (recovered > 0) {
        console.log(`🔄 ${recovered} stuck document(s) reset to 'pending' for retry.`);
      }
    }

    // Start Express server
    const server = app.listen(config.port, () => {
      console.log('========================================');
      console.log(`  Multi-Workspace Document Assistant`);
      console.log(`  Server: http://localhost:${config.port}`);
      console.log(`  Environment: ${config.nodeEnv}`);
      console.log(`  Database: ${dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
      console.log('========================================');
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      server.close(() => {
        console.log('Server closed.');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error('Forced shutdown after timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
startServer();