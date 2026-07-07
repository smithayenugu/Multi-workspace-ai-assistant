-- =============================================
-- Fix: Change vector dimension from 768 to 3072
-- No index needed for small datasets (exact search works fine)
-- =============================================

-- Drop the old vector index (it depends on the old dimension)
DROP INDEX IF EXISTS idx_chunks_embedding;

-- Alter the column type to accept 3072-dimensional vectors
ALTER TABLE document_chunks 
  ALTER COLUMN embedding TYPE vector(3072);