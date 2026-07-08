import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log("=== OUTREACH STATS ===");
  const { count: emailsCount } = await supabase.from('outreach_messages').select('*', { count: 'exact', head: true }).neq('status', 'received');
  const { count: repliesCount } = await supabase.from('outreach_messages').select('*', { count: 'exact', head: true }).eq('status', 'received');
  console.log(`sent: ${emailsCount}, replies: ${repliesCount}`);
}
run();
