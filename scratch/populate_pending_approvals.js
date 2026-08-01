const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function populatePendingApprovals() {
  console.log("=== POPULATING PENDING APPROVALS QUEUE ===");

  const { data: updated, error } = await supabase
    .from('touch_queue')
    .update({ status: 'pending_approval' })
    .not('draft_body', 'is', null)
    .select('id');

  if (error) {
    console.error("Error setting status to pending_approval:", error.message);
  } else {
    console.log(`Successfully populated ${updated.length} items to status = 'pending_approval'!`);
  }
}

populatePendingApprovals().catch(console.error);
