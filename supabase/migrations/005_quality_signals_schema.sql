-- Add missing quality signal columns to the leads table
alter table public.leads
  add column if not exists email_verified boolean,
  add column if not exists email_quality text,
  add column if not exists phone_e164 text,
  add column if not exists phone_region text,
  add column if not exists website_status text,
  add column if not exists has_website boolean,
  add column if not exists rating numeric,
  add column if not exists review_count integer,
  add column if not exists social_links jsonb,
  add column if not exists quality_score integer default 0,
  add column if not exists score_factors jsonb,
  add column if not exists enriched_at timestamptz;
