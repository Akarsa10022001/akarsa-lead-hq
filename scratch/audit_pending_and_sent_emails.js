const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function auditEmails() {
  console.log("=== AUDITING PENDING AND SENT EMAILS IN DATABASE ===");

  // 1. Audit touch_queue status breakdown
  const { data: queueItems } = await supabase
    .from('touch_queue')
    .select('id, channel, status, target_id, draft_body, created_at, approved_at');

  const queueStatus = {};
  (queueItems || []).forEach(q => {
    queueStatus[q.status] = (queueStatus[q.status] || 0) + 1;
  });
  console.log("touch_queue status breakdown:", queueStatus);

  // 2. Audit recent touches table entries (last 20 sent)
  const { data: recentTouches } = await supabase
    .from('touches')
    .select('id, target_id, channel, notes, provider_msg_id, send_status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log("\nRecent 10 items in `touches` table:");
  (recentTouches || []).forEach(t => {
    console.log(`- Touch ID ${t.id} | Target: ${t.target_id} | Channel: ${t.channel} | Status: ${t.send_status} | MsgId: ${t.provider_msg_id} | Time: ${t.created_at}`);
  });

  // 3. Count leads status breakdown
  let allLeads = [];
  let pageIndex = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data } = await supabase
      .from('leads')
      .select('id, company_name, email, status')
      .eq('is_test', false)
      .range(pageIndex * pageSize, (pageIndex + 1) * pageSize - 1);

    if (data && data.length > 0) {
      allLeads = allLeads.concat(data);
      if (data.length < pageSize) hasMore = false;
      else pageIndex++;
    } else {
      hasMore = false;
    }
  }

  const leadsStatus = {};
  const emailableLeadsStatus = {};
  allLeads.forEach(l => {
    leadsStatus[l.status] = (leadsStatus[l.status] || 0) + 1;
    if (l.email && l.email.includes('@')) {
      emailableLeadsStatus[l.status] = (emailableLeadsStatus[l.status] || 0) + 1;
    }
  });

  console.log("\nAll Leads status breakdown:", leadsStatus);
  console.log("Emailable Leads status breakdown:", emailableLeadsStatus);
}

auditEmails().catch(console.error);
