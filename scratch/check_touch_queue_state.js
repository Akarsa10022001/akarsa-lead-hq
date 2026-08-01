const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTouchQueueState() {
  console.log("=== CHECKING TOUCH_QUEUE & TARGET_SEQUENCES STATE ===");

  const { data: queue } = await supabase.from('touch_queue').select('id, status, step_number');
  const queueDist = {};
  (queue || []).forEach(q => {
    queueDist[q.status] = (queueDist[q.status] || 0) + 1;
  });

  console.log("touch_queue status distribution:", queueDist);

  const { data: sequences } = await supabase.from('target_sequences').select('id, status, current_step');
  const seqDist = {};
  (sequences || []).forEach(s => {
    seqDist[s.status] = (seqDist[s.status] || 0) + 1;
  });

  console.log("target_sequences status distribution:", seqDist);
}

checkTouchQueueState().catch(console.error);
