-- Add missing columns for Contactability & Quality engine
alter table public.leads
  add column if not exists email_verified boolean default false,
  add column if not exists email_quality text,
  add column if not exists phone_e164 text,
  add column if not exists website_status text,
  add column if not exists has_website boolean default false,
  add column if not exists rating numeric,
  add column if not exists review_count int,
  add column if not exists social_links jsonb,
  add column if not exists quality_score int default 0,
  add column if not exists score_factors jsonb,
  add column if not exists enriched_at timestamptz;
