const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function executeBulkOutreachNow() {
  console.log("=== EXECUTING 1-CLICK BULK OUTREACH DISPATCH ===");

  const user = 'beakarsa@gmail.com';
  const pass = 'kjdoqgnjdgcvmnrx';

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });

  // 1. Fetch emailable leads with status = 'New'
  let allLeads = [];
  let pageIndex = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data } = await supabase
      .from('leads')
      .select('id, company_name, email, phone, geo, location, rating, review_count, status')
      .eq('is_test', false)
      .not('email', 'is', null)
      .not('email', 'eq', '')
      .eq('status', 'New')
      .range(pageIndex * pageSize, (pageIndex + 1) * pageSize - 1);

    if (data && data.length > 0) {
      allLeads = allLeads.concat(data);
      if (data.length < pageSize) hasMore = false;
      else pageIndex++;
    } else {
      hasMore = false;
    }
  }

  // Filter valid emails
  allLeads = allLeads.filter(l => l.email && l.email.includes('@'));
  console.log(`Found ${allLeads.length} valid emailable New leads ready for outreach.`);

  // 2. Fetch signals for evidence text
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

  // Process batch of 15 leads per execution for smooth deliverability
  const batch = allLeads.slice(0, 15);
  let sentCount = 0;

  for (const lead of batch) {
    const leadEvidences = signalsByLead[lead.id] || [];
    const primaryEvidence = leadEvidences[0] || `Established business in ${lead.geo || lead.location || 'your area'}`;

    const subject = `Quick question regarding ${lead.company_name}`;
    const body = `Hi ${lead.company_name} Team,\n\nI was looking into local market leaders in ${lead.geo || lead.location || 'your area'} and noticed: ${primaryEvidence}.\n\nWe help top local businesses scale revenue with automated client acquisition infrastructure. Would you be open to a quick 5-minute chat this week?\n\nBest regards,\nAkarsa Team`;

    console.log(`Sending to ${lead.company_name} (${lead.email})...`);

    try {
      const info = await transporter.sendMail({
        from: `"Akarsa" <${user}>`,
        to: lead.email,
        subject,
        text: body
      });

      console.log(`🎉 SENT SUCCESS! MessageId: ${info.messageId}`);

      // Create target_sequence if missing
      const { data: targetSeq } = await supabase
        .from('target_sequences')
        .select('id')
        .eq('target_id', lead.id)
        .maybeSingle();

      let targetId = targetSeq?.id;
      if (!targetId) {
        const { data: newTarget } = await supabase
          .from('target_sequences')
          .insert({
            target_id: lead.id,
            sequence_id: sequenceId,
            status: 'active',
            current_step: 1
          })
          .select('id')
          .single();

        targetId = newTarget?.id;
      }

      // Record touch & update status to 'Contacted'
      await supabase.from('touches').insert({
        target_id: lead.id,
        channel: 'email',
        touch_type: 'initial_outreach',
        direction: 'outbound',
        notes: `1-Click Bulk Outreach: ${subject}`,
        provider_msg_id: info.messageId,
        send_status: 'sent'
      });

      await supabase.from('leads').update({ status: 'Contacted' }).eq('id', lead.id);
      sentCount++;
    } catch (err) {
      console.error(`Send error for ${lead.company_name}:`, err.message);
    }
  }

  console.log(`\n=== BATCH DISPATCH COMPLETED ===`);
  console.log(`Successfully sent ${sentCount} live emails to Gmail Sent box.`);
  console.log(`Remaining New emailable leads: ${allLeads.length - sentCount}`);
}

executeBulkOutreachNow().catch(console.error);
