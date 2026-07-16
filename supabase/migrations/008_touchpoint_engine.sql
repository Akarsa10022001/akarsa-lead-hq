-- Supabase Migration: Touchpoint Engine Schema

-- 1. Dream Targets (The Dream 25 targets)
create table if not exists public.dream_targets (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid references public.leads(id) on delete set null,
  company_name   text not null,
  contact_name   text not null, -- Enforced owner/founder/director
  contact_title  text,
  email          text,
  phone          text,
  linkedin_url   text,
  instagram_handle text,
  industry       text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 2. Per-channel connected accounts + tokens (NOT env vars)
create table if not exists public.social_accounts (
  id            uuid primary key default gen_random_uuid(),
  channel       text not null,              -- email | whatsapp | linkedin | instagram
  handle        text,                       -- the sending identity
  access_token  text,                       -- encrypted at rest
  refresh_token text,
  meta          jsonb default '{}',
  status        text not null default 'active',
  created_at    timestamptz not null default now()
);

-- 3. Contact-level opt-in / consent record
create table if not exists public.consents (
  id          uuid primary key default gen_random_uuid(),
  target_id   uuid not null references public.dream_targets(id) on delete cascade,
  channel     text not null,
  opted_in    boolean not null default false,
  source      text,                         -- where consent came from
  recorded_at timestamptz not null default now(),
  unique (target_id, channel)
);

-- 4. The 17-touch sequence template
create table if not exists public.sequences (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  is_active  boolean not null default true
);

create table if not exists public.sequence_steps (
  id           uuid primary key default gen_random_uuid(),
  sequence_id  uuid not null references public.sequences(id) on delete cascade,
  step_number  int not null,                -- 1..17
  channel      text not null,               -- email | whatsapp | linkedin | instagram | ads
  touch_type   text not null,               -- connect | comment | loom_audit | value_drop | dm | ask_call ...
  delay_days   int not null default 0,      -- days after previous step
  prompt_hint  text,                        -- guidance passed to the AI drafter
  unique (sequence_id, step_number)
);

-- 5. What each target is currently running
create table if not exists public.target_sequences (
  id             uuid primary key default gen_random_uuid(),
  target_id      uuid not null references public.dream_targets(id) on delete cascade,
  sequence_id    uuid not null references public.sequences(id),
  current_step   int not null default 0,
  status         text not null default 'active',   -- active | paused | replied | won | dropped
  started_at     timestamptz not null default now(),
  unique (target_id)
);

-- 6. Drafts waiting for the human gate
create table if not exists public.touch_queue (
  id            uuid primary key default gen_random_uuid(),
  target_id     uuid not null references public.dream_targets(id) on delete cascade,
  step_number   int not null,
  channel       text not null,
  touch_type    text not null,
  draft_body    text,                        -- AI-generated, human-editable
  status        text not null default 'pending_approval',
  -- pending_approval | approved | awaiting_manual_send | sent | failed | skipped
  scheduled_for timestamptz not null default now(),
  approved_by   text,
  approved_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- 7. The immutable log of touches that actually happened
create table if not exists public.touches (
  id            uuid primary key default gen_random_uuid(),
  target_id     uuid not null references public.dream_targets(id) on delete cascade,
  channel       text not null,
  touch_type    text not null,
  direction     text not null default 'outbound', -- outbound | inbound | passive
  occurred_at   timestamptz not null default now(),
  notes         text,
  queue_id      uuid references public.touch_queue(id) on delete set null,
  send_status   text,   -- sent | delivered | opened | replied | bounced | failed
  provider_msg_id text,
  created_at    timestamptz not null default now()
);

-- 8. Conversion / outcome recording — the "what worked" data
create table if not exists public.conversions (
  id            uuid primary key default gen_random_uuid(),
  target_id     uuid not null references public.dream_targets(id) on delete cascade,
  outcome       text not null,               -- replied | meeting_booked | won | lost | no_response
  first_reply_at timestamptz,
  won_at        timestamptz,
  touches_to_outcome int,                    -- how many touches it took
  channel_of_reply   text,                   -- which channel they replied on
  notes         text,
  recorded_at   timestamptz not null default now()
);

-- 9. Views for analytics
create or replace view public.channel_performance as
select channel_of_reply as channel,
       count(*) as replies,
       count(*) filter (where outcome = 'won') as wins
from public.conversions
where channel_of_reply is not null
group by channel_of_reply;

create or replace view public.touch_number_effectiveness as
select touches_to_outcome as touch_number,
       count(*) as replies
from public.conversions
where outcome in ('replied','meeting_booked','won')
group by touches_to_outcome
order by touch_number;

-- 10. Indexes
create index if not exists idx_touch_queue_status on public.touch_queue(status, scheduled_for);
create index if not exists idx_touches_target on public.touches(target_id);

-- Enable RLS for all new tables
alter table public.dream_targets enable row level security;
alter table public.social_accounts enable row level security;
alter table public.consents enable row level security;
alter table public.sequences enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.target_sequences enable row level security;
alter table public.touch_queue enable row level security;
alter table public.touches enable row level security;
alter table public.conversions enable row level security;

-- Open policies for public access (Lead HQ pattern)
create policy "Allow public read/write" on public.dream_targets for all using (true) with check (true);
create policy "Allow public read/write" on public.social_accounts for all using (true) with check (true);
create policy "Allow public read/write" on public.consents for all using (true) with check (true);
create policy "Allow public read/write" on public.sequences for all using (true) with check (true);
create policy "Allow public read/write" on public.sequence_steps for all using (true) with check (true);
create policy "Allow public read/write" on public.target_sequences for all using (true) with check (true);
create policy "Allow public read/write" on public.touch_queue for all using (true) with check (true);
create policy "Allow public read/write" on public.touches for all using (true) with check (true);
create policy "Allow public read/write" on public.conversions for all using (true) with check (true);

-- 11. Seed default 17-step outreach sequence
insert into public.sequences (id, name, is_active) values ('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 'Dream 25 17-Touch Outreach Sequence', true) on conflict do nothing;

insert into public.sequence_steps (sequence_id, step_number, channel, touch_type, delay_days, prompt_hint) values
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 1, 'linkedin', 'connect', 0, 'Send a friendly, no-pitch LinkedIn connection request mentioning their business growth.'),
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 2, 'linkedin', 'comment', 2, 'Find a recent post by them or their company and draft an insightful comment or feedback.'),
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 3, 'email', 'loom_audit', 3, 'Pitch a 2-minute Loom audit analyzing their website and conversion gaps.'),
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 4, 'whatsapp', 'value_drop', 2, 'Send a brief value drop via WhatsApp template: share one quick optimization tip for their site.'),
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 5, 'linkedin', 'dm', 3, 'Send a LinkedIn message following up on the Loom pitch, asking if they saw it.'),
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 6, 'instagram', 'dm', 2, 'Interact with them on Instagram: drop a comment or friendly DM referencing their recent post.'),
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 7, 'email', 'value_drop', 3, 'Send a second value drop email: share a case study relevant to their vertical.'),
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 8, 'ads', 'passive', 2, 'Passive touch point: retargeting ad impression (log directly to touches, skip queue).'),
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 9, 'linkedin', 'comment', 3, 'Leave another thoughtful comment on their company LinkedIn update.'),
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 10, 'whatsapp', 'ask_call', 2, 'Ask for a quick 10-minute brainstorming call on WhatsApp (template gated).'),
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 11, 'email', 'ask_call', 3, 'Send a formal email asking for a 10-minute call to discuss their custom roadmap.'),
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 12, 'linkedin', 'dm', 3, 'LinkedIn check-in: mention the roadmap idea and ask if they are open to seeing it.'),
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 13, 'instagram', 'dm', 2, 'Instagram DM check-in: casual, friendly touch point.'),
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 14, 'email', 'value_drop', 4, 'Send a final resource/cheatsheet showing how similar businesses increased sales.'),
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 15, 'linkedin', 'dm', 3, 'LinkedIn message: final soft break-up. Ask if they want to pause communications.'),
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 16, 'whatsapp', 'dm', 2, 'WhatsApp break-up message: final check if they want the optimization resource.'),
('d3b07384-d113-4c9b-8c5d-2b47d3d19117', 17, 'email', 'break_up', 4, 'Final break-up email. Close the loop politely.')
on conflict (sequence_id, step_number) do nothing;
