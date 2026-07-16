-- 1. Fix the lying metric: recompute contactability_score
update leads set contactability_score =
    (case when email_verified then 40 else 0 end)
  + (case when phone_e164 is not null and phone_e164 <> '' then 25 else 0 end)
  + (case when whatsapp_valid then 20 else 0 end)
  + (case when social_links is not null and social_links::text <> '{}' then 10 else 0 end)
  + (case when has_website then 5 else 0 end);

-- 2. Owner-direct is a HARD GATE (the core rule)
alter table leads add column if not exists is_generic_email boolean
  generated always as (
    email ~* '^(info|contact|hello|admin|reservations?|bookings?|groups|sales|enquir|restaurants?|catering|membership|reception|office|team|support)@'
  ) stored;

alter table leads add column if not exists is_personal_email boolean
  generated always as (
    email ~* '@(gmail|yahoo|hotmail|outlook|rediffmail|proton)\.'
  ) stored;

-- 3. Email validation
alter table leads add column if not exists email_is_valid boolean
  generated always as (
    email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and length(email) < 100
    and email !~ '[0-9]{6,}'
  ) stored;

-- 4. The approval-ready view
create or replace view sequence_ready_leads as
select id, company_name, contact_name, contact_title, score_grade, email, phone_e164, geo,
       is_personal_email, industry, domain, social_links
from leads
where email_verified
  and email_is_valid
  and not is_generic_email
order by is_personal_email desc, score_grade asc;

-- 5. Wipe old test data from the dream_targets paradigm
truncate table touch_queue, target_sequences, conversions, touches, consents cascade;

-- 6. Repoint foreign keys from dream_targets to leads
alter table target_sequences drop constraint if exists target_sequences_target_id_fkey;
alter table target_sequences add constraint target_sequences_target_id_fkey foreign key (target_id) references leads(id) on delete cascade;

alter table touch_queue drop constraint if exists touch_queue_target_id_fkey;
alter table touch_queue add constraint touch_queue_target_id_fkey foreign key (target_id) references leads(id) on delete cascade;

alter table conversions drop constraint if exists conversions_target_id_fkey;
alter table conversions add constraint conversions_target_id_fkey foreign key (target_id) references leads(id) on delete cascade;

alter table touches drop constraint if exists touches_target_id_fkey;
alter table touches add constraint touches_target_id_fkey foreign key (target_id) references leads(id) on delete cascade;

alter table consents drop constraint if exists consents_target_id_fkey;
alter table consents add constraint consents_target_id_fkey foreign key (target_id) references leads(id) on delete cascade;

-- 7. Add pending_enrollment status to target_sequences
alter table target_sequences drop constraint if exists target_sequences_status_check;
alter table target_sequences add constraint target_sequences_status_check check (status in ('active', 'paused', 'completed', 'bounced', 'replied', 'pending_enrollment'));

-- 8. Collapse the sequence to Email-First / Phone-Secondary
delete from sequence_steps where sequence_id = 'd3b07384-d113-4c9b-8c5d-2b47d3d19117';

insert into sequence_steps (sequence_id, step_number, channel, touch_type, delay_days, prompt_hint) values
  ('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 1, 'email', 'initial_outreach', 0, 'Highly personalized cold email highlighting a specific observation about their business.'),
  ('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 2, 'phone', 'manual_call', 2, 'First attempt to call the owner directly. Keep it brief, reference the email sent 2 days ago.'),
  ('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 3, 'email', 'follow_up', 3, 'Value-add follow up email. Share a quick win or insight.'),
  ('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 4, 'email', 'case_study', 4, 'Share a relevant case study of another local business we helped.'),
  ('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 5, 'phone', 'manual_call', 3, 'Second call attempt. Leave a voicemail if no answer.'),
  ('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 6, 'email', 'check_in', 5, 'Brief check-in email.'),
  ('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 7, 'email', 'break_up', 7, 'Professional break-up email. Leave the door open for future contact.');
