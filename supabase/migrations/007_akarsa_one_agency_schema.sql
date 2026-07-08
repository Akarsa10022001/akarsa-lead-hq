-- Phase 1 Schema additions for Akarsa One Pivot (Law 1 Provenance & Segments)

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS segment text DEFAULT 'marketing_agency',
  ADD COLUMN IF NOT EXISTS sub_type text,
  ADD COLUMN IF NOT EXISTS geo text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS email_source_url text,
  ADD COLUMN IF NOT EXISTS phone_source_url text,
  ADD COLUMN IF NOT EXISTS agency_fit_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contactability_score integer DEFAULT 0;
