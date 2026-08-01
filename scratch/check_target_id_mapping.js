const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMapping() {
  const { data: item } = await supabase.from('touch_queue').select('*').limit(1).single();
  console.log("Sample touch_queue item:", item);

  const { data: targetSeq } = await supabase.from('target_sequences').select('*').eq('id', item.target_id);
  console.log("Match in target_sequences by id:", targetSeq);

  const { data: leadMatch } = await supabase.from('leads').select('*').eq('id', item.target_id);
  console.log("Match in leads by id:", leadMatch);
}

checkMapping();
