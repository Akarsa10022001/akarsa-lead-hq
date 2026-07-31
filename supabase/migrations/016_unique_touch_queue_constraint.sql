-- Migration 016: Enforce UNIQUE constraint on touch_queue (target_id, step_number)

-- Remove any duplicate pending/failed rows in touch_queue before applying constraint
DELETE FROM touch_queue a USING touch_queue b
WHERE a.id < b.id 
  AND a.target_id = b.target_id 
  AND a.step_number = b.step_number;

-- Add UNIQUE constraint to prevent duplicate drafts for the same lead and step
ALTER TABLE touch_queue 
ADD CONSTRAINT unique_target_step UNIQUE (target_id, step_number);
