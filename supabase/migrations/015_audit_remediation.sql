-- Migration 015: Audit Remediation, Test Isolation & Provider Msg ID Constraints

-- 1. Add is_test flag to leads and touches
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;
ALTER TABLE touches ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;

-- 2. Add domain_mx_verified column to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS domain_mx_verified BOOLEAN DEFAULT false;

-- Backfill domain_mx_verified from email_verified
UPDATE leads SET domain_mx_verified = email_verified WHERE email_verified IS NOT NULL;

-- 3. Add check constraint on touches to prevent mock provider_msg_id inserts on sent status
ALTER TABLE touches ADD CONSTRAINT check_real_provider_msg_id CHECK (
  send_status != 'sent' OR (
    provider_msg_id IS NOT NULL 
    AND provider_msg_id != 'null' 
    AND provider_msg_id NOT LIKE 'resend-test-%'
  )
);
