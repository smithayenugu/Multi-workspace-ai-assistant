-- =============================================
-- Migration 004: Add observability columns to chat_messages
-- Enables per-request latency, token count, and retrieval hit tracking
-- =============================================

-- Add observability columns to chat_messages table
ALTER TABLE IF EXISTS chat_messages 
ADD COLUMN IF NOT EXISTS latency_ms INTEGER;

ALTER TABLE IF EXISTS chat_messages 
ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER;

ALTER TABLE IF EXISTS chat_messages 
ADD COLUMN IF NOT EXISTS completion_tokens INTEGER;

ALTER TABLE IF EXISTS chat_messages 
ADD COLUMN IF NOT EXISTS retrieval_hit BOOLEAN DEFAULT FALSE;