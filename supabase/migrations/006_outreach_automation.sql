-- Migration 006: Outreach Automation fields

-- Add classification and channel_account to outreach_messages
alter table public.outreach_messages 
add column if not exists classification text,
add column if not exists channel_account text;

-- Add updated_at to outreach_messages to track state changes
alter table public.outreach_messages 
add column if not exists updated_at timestamp with time zone default now();
