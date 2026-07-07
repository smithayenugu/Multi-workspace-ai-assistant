-- =============================================
-- Migration 003: Add content_hash to documents
-- Enables content-based deduplication
-- =============================================

-- Add content_hash column to documents table
ALTER TABLE IF EXISTS documents 
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

-- Add duplicate_of column to reference the original document
ALTER TABLE IF EXISTS documents 
ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES documents(id) ON DELETE SET NULL;

-- Update status comment to include 'duplicate' status
-- status: pending, processing, processed, failed, duplicate

-- Add unique index on (workspace_id, content_hash) for fast dedup lookup
-- Only applies to non-null hashes
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_content_hash_workspace 
ON documents(workspace_id, content_hash) 
WHERE content_hash IS NOT NULL;