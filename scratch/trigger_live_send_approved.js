const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function triggerLiveSendApproved() {
  console.log("=== TESTING LIVE GMAIL SMTP DISPATCH WITH VERIFIED APP PASSWORD ===");

  const user = 'beakarsa@gmail.com';
  const pass = 'kjdoqgnjdgcvmnrx';

  console.log(`Using Sender Account: ${user}`);
  console.log(`Using App Password: kjdo qgnj dgcv mnrx`);

  // Fetch approved items in touch_queue
  const { data: approvedItems, error: fetchErr } = await supabase
    .from('touch_queue')
    .select('id, target_id, channel, touch_type, draft_body, status')
    .eq('status', 'approved')
    .limit(3);

  if (fetchErr) {
    console.error("Fetch error:", fetchErr.message);
    return;
  }

  console.log(`Found ${approvedItems?.length || 0} approved items ready for live dispatch.`);
  if (!approvedItems || approvedItems.length === 0) return;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });

  for (const item of approvedItems) {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, company_name, email')
      .eq('id', item.target_id)
      .single();

    if (!lead || !lead.email) {
      console.log(`Skipping item ${item.id} (no recipient email)`);
      continue;
    }

    let content = item.draft_body || '';
    let subject = 'Outreach from Akarsa';

    const subjectRegex = /^Subject:\s*(.+)$/im;
    const match = content.match(subjectRegex);
    if (match) {
      subject = match[1].trim();
      content = content.replace(subjectRegex, '').trim();
    }

    console.log(`Dispatching live email to ${lead.company_name} (${lead.email})...`);

    try {
      const info = await transporter.sendMail({
        from: `"Akarsa" <${user}>`,
        to: lead.email,
        subject,
        text: content
      });

      console.log(`🎉 LIVE DISPATCH SUCCESS! MessageId: ${info.messageId}`);

      // Write touch record
      await supabase.from('touches').insert({
        target_id: item.target_id,
        channel: item.channel || 'email',
        touch_type: item.touch_type || 'initial_outreach',
        direction: 'outbound',
        notes: `Automated Gmail SMTP send: ${subject}`,
        queue_id: item.id,
        provider_msg_id: info.messageId,
        send_status: 'sent'
      });

      // Update queue item to sent
      await supabase.from('touch_queue').update({ status: 'sent' }).eq('id', item.id);
    } catch (sendError) {
      console.error(`Send error for ${lead.email}:`, sendError.message);
    }
  }
}

triggerLiveSendApproved().catch(console.error);
