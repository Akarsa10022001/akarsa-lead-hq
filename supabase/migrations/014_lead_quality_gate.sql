-- Migration 014: Lead Quality Gate (Rejection reason, clean company name)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rejected_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_name_clean TEXT;

-- Index for filtering out rejected leads quickly in queries
CREATE INDEX IF NOT EXISTS idx_leads_rejected_reason ON leads(rejected_reason);
