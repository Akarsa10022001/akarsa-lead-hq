create table if not exists public.discovery_cursor (
  id          bigserial primary key,
  source      text not null,            -- 'google_places' | 'foursquare' | 'osm'
  location    text not null,            -- e.g. 'Mumbai, India'
  category    text,                     -- optional category/businessType
  next_token  text,                     -- next-page token / cursor from the provider
  page        int default 0,
  exhausted   boolean default false,    -- true when the provider has no more pages
  updated_at  timestamptz default now(),
  unique (source, location, category)
);

-- Enable RLS and add public access policy for the cursor table
alter table public.discovery_cursor enable row level security;

create policy "Allow public access to discovery_cursor"
on public.discovery_cursor
for all
using (true)
with check (true);
