-- Migration 017: Source Attribution Columns on leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS source_query TEXT,
ADD COLUMN IF NOT EXISTS source_connector TEXT;
