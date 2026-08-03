-- =========================================================
-- TELEGRAM INTENT INGEST MODULE — SPEC V1.0 SCHEMA MIGRATION
-- =========================================================

-- 1. Ensure workspaces and leads table exist minimum references
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Insert default workspace if missing
insert into workspaces (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Default Workspace')
on conflict (id) do nothing;

-- 2. Monitored Sources Table (§4.1)
create table if not exists tg_sources (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references workspaces(id) on delete cascade,
  tg_chat_id            bigint not null,
  tg_chat_username      text,                      -- public @handle; null if none
  title                 text not null,
  is_public             boolean not null default true,
  member_count_snapshot int,                       -- from chat metadata only; never enumerated
  vertical              text,                      -- 'd2c' | 'saas' | 'local_biz' | 'ecom' | ...
  region                text,                      -- 'indore' | 'mp' | 'india' | 'gcc'
  joined_at             timestamptz not null default now(),
  status                text not null default 'active'
                          check (status in ('active','paused','left','banned')),
  last_ingested_at      timestamptz,
  unique (workspace_id, tg_chat_id)
);

comment on column tg_sources.member_count_snapshot is
  'Read from chat metadata. Enumerating participants is prohibited — see spec §2.1.';

-- 3. Pseudonymous Authors Table (§4.2)
create table if not exists tg_authors (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  author_hash       text not null,        -- sha256(pepper || tg_user_id), pepper from env
  public_username   text,                 -- public @handle, nullable
  display_name      text,                 -- self-set public display name
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  signal_count      int not null default 0,
  converted_lead_id uuid references leads(id),
  unique (workspace_id, author_hash)
);

-- 4. Intent Signals Table (§4.3)
create table if not exists tg_signals (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references workspaces(id) on delete cascade,
  source_id          uuid not null references tg_sources(id),
  author_id          uuid not null references tg_authors(id),
  tg_message_id      bigint not null,
  message_text       text not null,        -- post-redaction
  redaction_applied  boolean not null default false,
  posted_at          timestamptz not null,
  ingested_at        timestamptz not null default now(),

  intent_tier        text not null
                       check (intent_tier in ('T1','T2','T3','T4')),
  intent_category    text not null
                       check (intent_category in
                         ('explicit_request','stated_problem','dissatisfaction','trigger_event')),
  confidence         numeric(3,2) not null check (confidence >= 0 and confidence <= 1),
  evidence_span      text not null,
  classifier_version text not null,
  classifier_model   text not null,

  status             text not null default 'new'
                       check (status in ('new','engaged','converted','dismissed','expired')),

  unique (workspace_id, source_id, tg_message_id),

  -- INTEGRITY: the evidence span must be verbatim from the message.
  constraint evidence_span_is_verbatim
    check (position(evidence_span in message_text) > 0)
);

create index if not exists idx_tg_signals_status_tier on tg_signals (workspace_id, status, intent_tier, posted_at desc);

-- 5. Engagement Log Table (§4.4)
create table if not exists tg_engagements (
  id            uuid primary key default gen_random_uuid(),
  signal_id     uuid not null references tg_signals(id) on delete cascade,
  operator      text not null,
  replied_at    timestamptz not null default now(),
  reply_channel text not null
                  check (reply_channel in ('public_thread','group_reply')),
  reply_text    text,
  outcome       text check (outcome in
                  ('no_response','replied','dm_initiated_by_them','converted','negative')),
  notes         text
);

-- 6. Consent Events Table (§4.5)
create table if not exists consent_events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id      uuid references leads(id),
  author_id    uuid references tg_authors(id),
  basis        text not null
                 check (basis in
                   ('inbound_dm','public_reply_with_contact','form_submission','explicit_optin')),
  evidence_ref text not null,     -- tg message id, screenshot path, or form submission id
  occurred_at  timestamptz not null,
  recorded_at  timestamptz not null default now()
);

-- 7. Touchpoint Queue & Consent Gate Trigger (§7)
create table if not exists touchpoint_queue (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id      uuid not null references leads(id),
  step_number  int not null default 1,
  channel      text not null,
  scheduled_at timestamptz not null default now(),
  status       text not null default 'pending'
);

create or replace function enforce_consent_before_touchpoint()
returns trigger as $$
begin
  if not exists (
    select 1 from consent_events
    where lead_id = new.lead_id
  ) then
    raise exception
      'Touchpoint enqueue blocked: no consent_event for lead %', new.lead_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touchpoint_consent_gate on touchpoint_queue;
create trigger trg_touchpoint_consent_gate
  before insert on touchpoint_queue
  for each row execute function enforce_consent_before_touchpoint();
