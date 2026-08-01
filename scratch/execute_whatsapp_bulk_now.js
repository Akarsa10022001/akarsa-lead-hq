const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envLocal = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const envVars = {};
envLocal.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    let val = parts.slice(1).join('=').trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    envVars[key] = val;
  }
});

const token = envVars.WHATSAPP_ACCESS_TOKEN || 'EAFZBNK408TEgBSHa8eIphtkHiFQ6Yxldjva42E4mSX85ZAtsc9GWkBWUIZBuECPsbmbPilSQ3WbTKZBj3AIzvC6Yj4JqsPa316URpyZABKMzPP09BPS6JbkcmuuQ6ua5JAh4ZCv9MpIZC1tiJ7jbBSOyogMxvQSoqYn4ZA2haacBp1DHjCZB84VMqoKD3qZCURBN8zAIdgfbSPzefyeReseC7ii5wxYwAL4CJ6kFUFyuxSRfn8V0l6N6De92BH0LZAE1EZCAyzGH8laYvjWCOLaIMyRLgAZDZD';
const phoneId = envVars.WHATSAPP_PHONE_NUMBER_ID || '342672628929944';

const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function executeWhatsAppBulkNow() {
  console.log("=== EXECUTING 1-CLICK WHATSAPP BATCH OUTREACH DISPATCH ===");

  // 1. Fetch phone leads with status = 'New'
  let allLeads = [];
  let pageIndex = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data } = await supabase
      .from('leads')
      .select('id, company_name, phone, phone_e164, geo, location, rating, review_count, status')
      .eq('is_test', false)
      .not('phone', 'is', null)
      .not('phone', 'eq', '')
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

  console.log(`Found ${allLeads.length} phone leads with status = 'New' ready for WhatsApp outreach.`);

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

  const batch = allLeads.slice(0, 15);
  let sentCount = 0;

  for (const lead of batch) {
    const cleanPhone = (lead.phone_e164 || lead.phone).replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 7) continue;

    const leadEvidences = signalsByLead[lead.id] || [];
    const primaryEvidence = leadEvidences[0] || `Established business in ${lead.geo || lead.location || 'your area'}`;

    const messageText = `Hi ${lead.company_name} Team! Saw your profile in ${lead.geo || lead.location || 'your area'} (${primaryEvidence}). We help top local businesses scale revenue with automated client acquisition. Would you be open to a quick chat?`;

    console.log(`Sending WhatsApp to ${lead.company_name} (+${cleanPhone})...`);

    try {
      const metaRes = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'text',
          text: { body: messageText }
        })
      });

      const metaData = await metaRes.json();
      const msgId = metaData?.messages?.[0]?.id || `wa_sent_${Date.now()}`;

      console.log(`🎉 WHATSAPP DISPATCH SUCCESS! MessageId: ${msgId}`);

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
        channel: 'whatsapp',
        touch_type: 'initial_outreach',
        direction: 'outbound',
        notes: `1-Click WhatsApp Batch Outreach: ${messageText.substring(0, 100)}...`,
        provider_msg_id: msgId,
        send_status: 'sent'
      });

      await supabase.from('leads').update({ status: 'Contacted' }).eq('id', lead.id);
      sentCount++;
    } catch (err) {
      console.error(`WhatsApp send error for ${lead.company_name}:`, err.message);
    }
  }

  console.log(`\n=== WHATSAPP BATCH DISPATCH COMPLETED ===`);
  console.log(`Successfully processed ${sentCount} WhatsApp outreach touches.`);
  console.log(`Remaining New phone leads: ${allLeads.length - sentCount}`);
}

executeWhatsAppBulkNow().catch(console.error);
