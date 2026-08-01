const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function enrollAndEnqueueDrafts() {
  console.log("=== ENROLLING QUALIFIED LEADS & GENERATING APPROVAL DRAFTS ===");

  // 1. Fetch Grade A & B leads (score_total >= 35)
  const { data: qualifiedLeads } = await supabase
    .from('leads')
    .select('id, company_name, email, phone, phone_e164, geo, score_total, score_grade')
    .eq('is_test', false)
    .gte('score_total', 35)
    .order('score_total', { ascending: false });

  console.log(`Found ${qualifiedLeads?.length || 0} qualified Grade A & B leads.`);

  // 2. Fetch lead_signals for evidence-based personalized draft generation
  const { data: signals } = await supabase
    .from('lead_signals')
    .select('lead_id, signal_type, evidence_text');

  const signalsByLead = {};
  (signals || []).forEach(s => {
    signalsByLead[s.lead_id] = signalsByLead[s.lead_id] || [];
    signalsByLead[s.lead_id].push(s.evidence_text);
  });

  const { data: defaultSeq } = await supabase.from('sequences').select('id').limit(1);
  const sequenceId = defaultSeq?.[0]?.id;

  let enqueuedCount = 0;

  for (const lead of (qualifiedLeads || [])) {
    // Check if target_sequence exists (target_id = lead.id)
    const { data: existingTarget } = await supabase
      .from('target_sequences')
      .select('id')
      .eq('target_id', lead.id)
      .limit(1);

    let targetId;
    if (existingTarget && existingTarget.length > 0) {
      targetId = existingTarget[0].id;
    } else {
      const { data: newTarget, error: targetErr } = await supabase
        .from('target_sequences')
        .insert({
          target_id: lead.id,
          sequence_id: sequenceId,
          status: 'pending_enrollment',
          current_step: 0
        })
        .select('id');

      if (targetErr) {
        console.error(`Target insert error for ${lead.company_name}:`, targetErr.message);
        continue;
      }
      targetId = newTarget[0].id;
    }

    // Check if step 1 touch_queue already exists
    const { data: existingQueue } = await supabase
      .from('touch_queue')
      .select('id')
      .eq('target_id', targetId)
      .eq('step_number', 1)
      .limit(1);

    if (existingQueue && existingQueue.length > 0) continue;

    // Determine channel (email if available, else whatsapp)
    const channel = lead.email ? 'email' : 'whatsapp';
    const leadEvidences = signalsByLead[lead.id] || [];
    const primaryEvidence = leadEvidences[0] || `Established business in ${lead.geo || 'Indore'}`;

    let draftBody = "";
    if (channel === 'email') {
      draftBody = `Subject: Quick question regarding ${lead.company_name}\n\nHi ${lead.company_name} Team,\n\nI was looking into local market leaders in ${lead.geo || 'Indore'} and noticed: ${primaryEvidence}.\n\nWe help top local businesses scale revenue with automated client acquisition infrastructure. Would you be open to a quick 5-minute chat this week?\n\nBest regards,\nAkarsa Team`;
    } else {
      draftBody = `Hi ${lead.company_name} Team! Saw your profile in ${lead.geo || 'Indore'} (${primaryEvidence}). We help top local businesses scale revenue with automated client acquisition. Would you be open to a quick chat?`;
    }

    const { error: queueErr } = await supabase
      .from('touch_queue')
      .insert({
        target_id: targetId,
        step_number: 1,
        channel,
        touch_type: 'initial_outreach',
        scheduled_for: new Date().toISOString(),
        draft_body: draftBody,
        status: 'pending_approval'
      });

    if (!queueErr) enqueuedCount++;
  }

  console.log(`Successfully generated and enqueued ${enqueuedCount} personalized drafts into Approvals Queue!`);
}

enrollAndEnqueueDrafts().catch(console.error);
