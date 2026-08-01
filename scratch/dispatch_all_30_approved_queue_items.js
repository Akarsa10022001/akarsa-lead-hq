const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function dispatchAll30ApprovedQueueItems() {
  console.log("=== DISPATCHING ALL 30 APPROVED ITEMS IN TOUCH QUEUE VIA GMAIL SMTP ===");

  const user = 'beakarsa@gmail.com';
  const pass = 'kjdoqgnjdgcvmnrx';

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });

  // Fetch approved queue items
  const { data: queueItems, error: fetchErr } = await supabase
    .from('touch_queue')
    .select('id, target_id, channel, touch_type, draft_body, status')
    .eq('status', 'approved');

  if (fetchErr) {
    console.error("Fetch error:", fetchErr.message);
    return;
  }

  console.log(`Found ${queueItems?.length || 0} approved items in touch_queue ready for dispatch.`);
  if (!queueItems || queueItems.length === 0) return;

  let sentCount = 0;

  for (const item of queueItems) {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, company_name, email')
      .eq('id', item.target_id)
      .single();

    if (!lead || !lead.email || !lead.email.includes('@')) {
      console.log(`Skipping item ${item.id} for target ${item.target_id} (no valid email)`);
      continue;
    }

    let content = item.draft_body || '';
    let subject = `Outreach from Akarsa for ${lead.company_name}`;

    const subjectRegex = /^Subject:\s*(.+)$/im;
    const match = content.match(subjectRegex);
    if (match) {
      subject = match[1].trim();
      content = content.replace(subjectRegex, '').trim();
    }

    console.log(`Dispatching to ${lead.company_name} (${lead.email})...`);

    try {
      const info = await transporter.sendMail({
        from: `"Akarsa" <${user}>`,
        to: lead.email,
        subject,
        text: content
      });

      console.log(`🎉 DISPATCH SUCCESS! MessageId: ${info.messageId}`);

      // Log touch entry
      await supabase.from('touches').insert({
        target_id: item.target_id,
        channel: item.channel || 'email',
        touch_type: item.touch_type || 'initial_outreach',
        direction: 'outbound',
        notes: `Automated Gmail SMTP Send: ${subject}`,
        queue_id: item.id,
        provider_msg_id: info.messageId,
        send_status: 'sent'
      });

      // Update queue item to sent
      await supabase.from('touch_queue').update({ status: 'sent' }).eq('id', item.id);

      // Update lead status to Contacted
      await supabase.from('leads').update({ status: 'Contacted' }).eq('id', lead.id);

      sentCount++;
    } catch (sendErr) {
      console.error(`Send error for ${lead.email}:`, sendErr.message);
    }
  }

  console.log(`\n=== DISPATCH COMPLETED ===`);
  console.log(`Successfully dispatched ${sentCount} approved queue items to Gmail Sent box!`);
}

dispatchAll30ApprovedQueueItems().catch(console.error);
