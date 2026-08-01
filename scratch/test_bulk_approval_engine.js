const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testBulkApprovalEngine() {
  console.log("=== TESTING 1-CLICK BULK APPROVAL ENGINE ===");

  const { data: queue, error } = await supabase
    .from('touch_queue')
    .select('id, target_id, step_number, status')
    .eq('status', 'pending_approval');

  if (error) {
    console.error("Fetch pending approvals error:", error.message);
    return;
  }

  console.log(`Current items pending approval in queue: ${queue?.length || 0}`);

  if (queue && queue.length > 0) {
    const ids = queue.map(q => q.id);
    const { data: updated, error: upErr } = await supabase
      .from('touch_queue')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: 'system_operator'
      })
      .in('id', ids)
      .select('target_id, step_number');

    if (upErr) {
      console.error("Bulk approval error:", upErr.message);
    } else {
      console.log(`Successfully approved ${updated.length} queue items in 1-Click!`);

      const step1TargetIds = updated.filter(item => item.step_number === 1).map(item => item.target_id);
      if (step1TargetIds.length > 0) {
        await supabase
          .from('target_sequences')
          .update({ status: 'active' })
          .in('target_id', step1TargetIds)
          .eq('status', 'pending_enrollment');

        console.log(`Activated ${step1TargetIds.length} target_sequences to active status.`);
      }
    }
  }
}

testBulkApprovalEngine().catch(console.error);
