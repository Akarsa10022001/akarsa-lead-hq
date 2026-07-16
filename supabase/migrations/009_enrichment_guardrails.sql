-- Add data provenance tracking to dream_targets
alter table public.dream_targets 
  add column if not exists data_provenance jsonb default '{}'::jsonb;

-- Add channel diversity status to target_sequences
alter table public.target_sequences
  add column if not exists channel_diversity_status text default 'healthy';

-- Update existing touch_queue to support blocked status
alter table public.touch_queue
  drop constraint if exists touch_queue_status_check;

alter table public.touch_queue
  add constraint touch_queue_status_check
  check (status in ('pending_approval', 'approved', 'awaiting_manual_send', 'dispatched', 'skipped', 'blocked_missing_data'));
