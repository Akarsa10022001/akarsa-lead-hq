const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSchema() {
  const { data } = await supabase.from('target_sequences').select('*').limit(1);
  console.log("target_sequences sample:", data);
}

inspectSchema();
