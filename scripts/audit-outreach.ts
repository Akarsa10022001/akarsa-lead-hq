// Real-time Outreach Audit Script
// Pulls actual data from Supabase to analyze outreach effectiveness

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
  console.log('═══════════════════════════════════════════');
  console.log('  AKARSA LEAD HQ — FULL OUTREACH AUDIT');
  console.log('═══════════════════════════════════════════\n');

  // 1. Total Leads in Database
  const { count: totalLeads } = await supabase.from('leads').select('*', { count: 'exact', head: true });
  console.log(`📊 TOTAL LEADS IN DATABASE: ${totalLeads}`);

  // 2. Leads by Status
  for (const status of ['New', 'Contacted', 'Replied', 'Qualified', 'Converted', 'Lost']) {
    const { count } = await supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', status);
    console.log(`   └─ ${status}: ${count || 0}`);
  }

  // 3. Outreach Messages
  const { data: allMessages, count: totalMessages } = await supabase
    .from('outreach_messages')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });
  
  console.log(`\n📬 TOTAL OUTREACH MESSAGES LOGGED: ${totalMessages || 0}`);
  
  if (allMessages && allMessages.length > 0) {
    // Status breakdown
    const statusMap: Record<string, number> = {};
    allMessages.forEach((m: any) => {
      const s = m.status || m.send_status || 'unknown';
      statusMap[s] = (statusMap[s] || 0) + 1;
    });
    console.log('   Status breakdown:');
    for (const [s, c] of Object.entries(statusMap)) {
      console.log(`   └─ ${s}: ${c}`);
    }
    
    // Show last 10 messages
    console.log('\n📨 LAST 10 OUTREACH MESSAGES:');
    allMessages.slice(0, 10).forEach((m: any, i: number) => {
      console.log(`   ${i+1}. [${m.channel || 'email'}] To: ${m.recipient || m.target_email || 'N/A'} | Status: ${m.status || m.send_status || 'N/A'} | ${m.created_at || m.sent_at || 'no date'}`);
      if (m.subject) console.log(`      Subject: ${m.subject}`);
      if (m.draft_content) console.log(`      Content: ${(m.draft_content || '').substring(0, 80)}...`);
    });
  }

  // 4. Touches Table
  const { data: allTouches, count: totalTouches } = await supabase
    .from('touches')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });
  
  console.log(`\n🤝 TOTAL TOUCHES LOGGED: ${totalTouches || 0}`);
  if (allTouches && allTouches.length > 0) {
    const channelMap: Record<string, number> = {};
    const directionMap: Record<string, number> = {};
    const sendStatusMap: Record<string, number> = {};
    allTouches.forEach((t: any) => {
      channelMap[t.channel || 'unknown'] = (channelMap[t.channel || 'unknown'] || 0) + 1;
      directionMap[t.direction || 'unknown'] = (directionMap[t.direction || 'unknown'] || 0) + 1;
      sendStatusMap[t.send_status || 'unknown'] = (sendStatusMap[t.send_status || 'unknown'] || 0) + 1;
    });
    console.log('   By Channel:', channelMap);
    console.log('   By Direction:', directionMap);
    console.log('   By Send Status:', sendStatusMap);
    
    // Inbound touches (replies!)
    const inbound = allTouches.filter((t: any) => t.direction === 'inbound');
    console.log(`\n   🔔 INBOUND REPLIES: ${inbound.length}`);
    inbound.forEach((t: any, i: number) => {
      console.log(`      ${i+1}. [${t.channel}] ${t.notes || 'No notes'} | ${t.created_at}`);
    });
  }

  // 5. Touch Queue
  const { data: queueItems, count: totalQueue } = await supabase
    .from('touch_queue')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });
  
  console.log(`\n📋 TOUCH QUEUE ITEMS: ${totalQueue || 0}`);
  if (queueItems && queueItems.length > 0) {
    const qStatusMap: Record<string, number> = {};
    queueItems.forEach((q: any) => {
      qStatusMap[q.status || 'unknown'] = (qStatusMap[q.status || 'unknown'] || 0) + 1;
    });
    console.log('   By Status:', qStatusMap);
  }

  // 6. Dream Targets
  const { count: dreamCount } = await supabase.from('dream_targets').select('*', { count: 'exact', head: true });
  console.log(`\n🎯 DREAM 25 TARGETS: ${dreamCount || 0}`);

  // 7. Target Sequences
  const { data: sequences } = await supabase.from('target_sequences').select('*');
  console.log(`📜 ACTIVE SEQUENCES: ${sequences?.length || 0}`);
  if (sequences && sequences.length > 0) {
    const seqStatusMap: Record<string, number> = {};
    sequences.forEach((s: any) => {
      seqStatusMap[s.status || 'unknown'] = (seqStatusMap[s.status || 'unknown'] || 0) + 1;
    });
    console.log('   By Status:', seqStatusMap);
  }

  // 8. Inbox Messages
  const { data: inboxMessages, count: inboxCount } = await supabase
    .from('inbox_messages')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });
  
  console.log(`\n📥 INBOX MESSAGES: ${inboxCount || 0}`);
  if (inboxMessages && inboxMessages.length > 0) {
    inboxMessages.slice(0, 10).forEach((m: any, i: number) => {
      console.log(`   ${i+1}. [${m.channel || 'unknown'}] From: ${m.sender_name || m.from || 'N/A'} | ${m.content?.substring(0, 60) || m.draft_content?.substring(0, 60) || 'no content'}... | ${m.created_at}`);
    });
  }

  // 9. Conversions
  const { data: conversions, count: convCount } = await supabase
    .from('conversions')
    .select('*', { count: 'exact' });
  
  console.log(`\n💰 CONVERSIONS: ${convCount || 0}`);
  if (conversions && conversions.length > 0) {
    conversions.forEach((c: any, i: number) => {
      console.log(`   ${i+1}. ${c.company_name || 'N/A'} | Amount: ${c.amount || 'N/A'} | ${c.created_at}`);
    });
  }

  // 10. Contacted leads with actual content sent
  const { data: contactedLeads } = await supabase
    .from('leads')
    .select('id, company_name, email, phone, status, ai_hook_draft, industry, geo, contacted_at, created_at')
    .eq('status', 'Contacted')
    .order('contacted_at', { ascending: false })
    .limit(20);
  
  console.log(`\n📞 LAST 20 CONTACTED LEADS:`);
  if (contactedLeads && contactedLeads.length > 0) {
    contactedLeads.forEach((l: any, i: number) => {
      console.log(`   ${i+1}. ${l.company_name} | ${l.email || 'no email'} | ${l.phone || 'no phone'} | ${l.industry || 'N/A'} | ${l.geo || 'N/A'} | Contacted: ${l.contacted_at || 'N/A'}`);
    });
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  AUDIT COMPLETE');
  console.log('═══════════════════════════════════════════');
}

runAudit().catch(err => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});
