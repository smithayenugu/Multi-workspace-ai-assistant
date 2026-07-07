// =============================================
// Server Configuration
// Loads and validates environment variables
// =============================================

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file in project root
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',

  // Frontend URL (for CORS)
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  // PostgreSQL Database
  database: {
    url: process.env.DATABASE_URL,
  },

  // Google Gemini AI
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004',
  },

  // Discord Webhook
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,

  // Slack Webhook
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,

  // Session
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',

  // File Upload
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760, // 10MB
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
};

// Validate required configuration
const validateConfig = () => {
  const required = [
    ['SUPABASE_URL', config.supabase.url],
    ['SUPABASE_ANON_KEY', config.supabase.anonKey],
    ['SUPABASE_SERVICE_ROLE_KEY', config.supabase.serviceRoleKey],
    ['DATABASE_URL', config.database.url],
    ['GEMINI_API_KEY', config.gemini.apiKey],
  ];

  const missing = required.filter(([name, value]) => !value);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach(([name]) => console.error(`  - ${name}`));
    console.error('Please copy .env.example to .env and fill in the values.');
    
    if (config.isProd) {
      process.exit(1);
    }
  }
};

// Run validation on import
validateConfig();

module.exports = config;