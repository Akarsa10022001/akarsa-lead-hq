-- Migration 013: Add enriched_at timestamp to prevent re-processing
alter table leads add column if not exists enriched_at timestamptz;
