// =============================================
// Supabase Client
// Initializes a single Supabase client instance using the service role key,
// so backend operations bypass Row Level Security (our own auth checks in
// the route/controller layer already handle authorization).
// =============================================

const { createClient } = require('@supabase/supabase-js');
const config = require('./index');

if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  throw new Error(
    'Supabase URL or Service Role Key is missing. Check your .env file (or Render environment variables).'
  );
}

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

module.exports = { supabase };