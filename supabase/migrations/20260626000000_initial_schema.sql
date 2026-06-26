-- Enable pgvector extension
create extension if not exists vector;

-- Enums
create type lead_status as enum ('New', 'Contacted', 'Engaged', 'Meeting_Booked', 'Won', 'Lost');
create type channel_type as enum ('whatsapp', 'email', 'linkedin');
create type lawful_basis_type as enum ('consent', 'legitimate_interest', 'public_data');

-- 1. Raw Records (for data provenance)
create table if not exists public.raw_records (
    id uuid default gen_random_uuid() primary key,
    source_name text not null, -- e.g., 'osm', 'common_crawl', 'meta_ad_library'
    external_id text,
    raw_data jsonb not null,
    fetched_at timestamp with time zone default now() not null,
    lawful_basis lawful_basis_type default 'public_data',
    processed boolean default false
);

-- 2. Leads (Core entity)
create table if not exists public.leads (
    id uuid default gen_random_uuid() primary key,
    company_name text not null,
    domain text,
    industry text,
    contact_name text,
    contact_title text,
    email text,
    phone text,
    whatsapp_valid boolean,
    location text,
    status lead_status default 'New' not null,
    score_total integer default 0,
    score_grade text, -- A, B, C, D
    ai_hook_draft text, -- The short hook string like 'Lab-like Hygiene'
    opted_out boolean default false,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
);

-- 3. Lead Signals (Evidence/Chips)
create table if not exists public.lead_signals (
    id uuid default gen_random_uuid() primary key,
    lead_id uuid references public.leads(id) on delete cascade not null,
    category text not null, -- 'budget', 'gap', 'reachability', 'trigger'
    signal_type text not null, -- e.g., 'no_pixel', 'indiamart_verified'
    evidence_text text not null,
    evidence_url text,
    raw_record_id uuid references public.raw_records(id) on delete set null,
    created_at timestamp with time zone default now() not null
);

-- 4. Outreach Campaigns & Sequences
create table if not exists public.outreach_sequences (
    id uuid default gen_random_uuid() primary key,
    lead_id uuid references public.leads(id) on delete cascade not null,
    status text default 'draft' not null, -- 'draft', 'active', 'paused', 'completed'
    created_at timestamp with time zone default now() not null
);

create table if not exists public.outreach_messages (
    id uuid default gen_random_uuid() primary key,
    sequence_id uuid references public.outreach_sequences(id) on delete cascade not null,
    step_number integer not null,
    channel channel_type not null,
    draft_content text not null,
    scheduled_for timestamp with time zone,
    sent_at timestamp with time zone,
    status text default 'pending' not null, -- 'pending', 'queued', 'sent', 'failed'
    created_at timestamp with time zone default now() not null
);

-- 5. Embeddings (pgvector)
create table if not exists public.lead_embeddings (
    id uuid default gen_random_uuid() primary key,
    lead_id uuid references public.leads(id) on delete cascade not null,
    content text not null, -- The concatenated context for vector search
    embedding vector(1536),
    created_at timestamp with time zone default now() not null
);

-- Trigger for updated_at on leads
create or replace function update_modified_column() 
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language 'plpgsql';

create trigger update_leads_modtime
    before update on public.leads
    for each row
    execute procedure update_modified_column();

-- Enable Row Level Security (RLS)
alter table public.raw_records enable row level security;
alter table public.leads enable row level security;
alter table public.lead_signals enable row level security;
alter table public.outreach_sequences enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.lead_embeddings enable row level security;

-- Create policies (for testing, allow all authenticated/anon for now, strict down later)
create policy "Allow public read/write" on public.leads for all using (true) with check (true);
create policy "Allow public read/write" on public.lead_signals for all using (true) with check (true);
create policy "Allow public read/write" on public.outreach_sequences for all using (true) with check (true);
create policy "Allow public read/write" on public.outreach_messages for all using (true) with check (true);
create policy "Allow public read/write" on public.raw_records for all using (true) with check (true);
