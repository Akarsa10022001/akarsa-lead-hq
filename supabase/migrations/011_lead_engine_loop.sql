-- Stage 1 & 2: Core Engine Schema Additions

-- 1. Enrichment Columns
alter table leads add column if not exists runs_ads boolean default false;
alter table leads add column if not exists has_pixel boolean default false;
alter table leads add column if not exists ig_active_low_engagement boolean default false;
alter table leads add column if not exists recent_reviews boolean default false;
alter table leads add column if not exists weak_website boolean default false;
alter table leads add column if not exists segment text; -- To handle 'test_ingest' tags

-- Calculate total intent signals automatically
alter table leads add column if not exists intent_signal_count integer 
  generated always as (
    (case when runs_ads then 1 else 0 end) +
    (case when has_pixel then 1 else 0 end) +
    (case when ig_active_low_engagement then 1 else 0 end) +
    (case when recent_reviews then 1 else 0 end)
  ) stored;

-- 2. Compliance Layer (EU Flagging)
alter table leads add column if not exists is_eu_lead boolean
  generated always as (
    geo ilike '%ital%' or 
    geo ilike '%europ%' or 
    geo ilike '%germany%' or 
    geo ilike '%france%' or 
    geo ilike '%spain%' or
    geo ilike '%netherlands%' or
    geo ilike '%belgium%' or
    geo ilike '%sweden%' or
    geo ilike '%denmark%' or
    geo ilike '%ireland%' or
    geo = 'EU'
  ) stored;

-- 3. Inversion Disqualification Logic
drop view if exists sequence_ready_leads cascade;
drop view if exists lead_scores cascade;
alter table leads drop column if exists is_disqualified cascade;
alter table leads add column is_disqualified boolean
  generated always as (
    COALESCE(
      -- 1. Unreachable (email is null OR matches generic pattern OR fails validity regex)
      (email is null or 
       (email ~* '^(info|contact|hello|admin|reservations?|bookings?|groups|sales|enquir|restaurants?|catering|membership|reception|office|team|support)@') or 
       not (email ~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' and length(email) < 100 and email !~ '[0-9]{6,}')) or
      -- 2. No digital footprint at all
      (not coalesce(has_website, false) and (social_links is null or social_links::text = '{}') and not coalesce(whatsapp_valid, false)) or
      -- 3. Competitors
      (industry ilike '%digital marketing%' or industry ilike '%social media%' or industry ilike '%advertising%' or industry ilike '%seo%' or industry ilike '%pr %' or industry ilike '%branding%' or industry ilike '%web%design%' or industry ilike '%creative agency%' or industry ilike '%marketing consultant%') or
      -- 4. Structural non-buyers
      (industry ilike '%school%' or industry ilike '%college%' or industry ilike '%university%' or industry ilike '%government%' or industry ilike '%municipal%' or industry ilike '%hospital%') or
      -- 5. Low-spend verticals
      (industry ilike '%manufacturing%' or industry ilike '%energy%' or industry ilike '%utilities%' or industry ilike '%transportation%' or industry ilike '%logistics%' or industry ilike '%industrial%'),
      false
    )
  ) stored;

-- 4. Close Score View (The Scoring Engine)
create or replace view close_score as
select 
  id as lead_id,
  (
    -- Reachability (0-25)
    (case when is_personal_email then 25 when email_is_valid and not is_generic_email then 18 else 0 end) +
    -- Vertical Budget (0-25)
    (case 
        when industry ilike '%clinic%' or industry ilike '%derma%' or industry ilike '%spa%' or industry ilike '%d2c%' or industry ilike '%e-commerce%' or industry ilike '%coaching%' then 25
        when industry ilike '%restaurant%' or industry ilike '%cafe%' or industry ilike '%fitness%' or industry ilike '%gym%' or industry ilike '%real estate%' then 20
        when industry ilike '%retail%' or industry ilike '%boutique%' or industry ilike '%florist%' or industry ilike '%bakery%' or industry ilike '%event%' then 15
        else 5
    end) +
    -- Buying Intent (0-30)
    (case when runs_ads then 15 else 0 end) +
    (case when has_pixel then 5 else 0 end) +
    (case when ig_active_low_engagement then 5 else 0 end) +
    (case when recent_reviews then 5 else 0 end) +
    -- Gap to Fix (0-20)
    (case when weak_website then 10 else 0 end) +
    (case when ig_active_low_engagement then 10 else 0 end)
  ) as close_score
from leads;

-- 5. Strict Gate: sequence_ready_leads
create or replace view sequence_ready_leads as
select l.id, l.company_name, l.contact_name, l.contact_title, l.score_grade, l.email, l.phone_e164, l.geo,
       l.is_personal_email, l.industry, l.domain, l.social_links, l.is_eu_lead, s.close_score,
       l.runs_ads, l.has_pixel, l.ig_active_low_engagement, l.recent_reviews, l.weak_website
from leads l
join close_score s on l.id = s.lead_id
where l.email_verified = true
  and l.email_is_valid = true
  and l.is_generic_email = false
  and l.is_disqualified = false
  and s.close_score >= 40
order by s.close_score desc;
