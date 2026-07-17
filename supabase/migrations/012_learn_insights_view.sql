-- Stage 10: Learn Insights View (Read-Only)
-- Aggregates win rates by cohort, suppressing any cohort with fewer than 15 attempts.
create or replace view learn_insights as
select 
  l.industry, 
  l.geo, 
  l.runs_ads, 
  count(*) as attempts, 
  count(*) filter (where c.outcome = 'won') as wins,
  (count(*) filter (where c.outcome = 'won')::numeric / count(*)) as win_rate
from conversions c 
join leads l on l.id = c.target_id 
group by 1, 2, 3 
having count(*) >= 15 
order by wins desc;
