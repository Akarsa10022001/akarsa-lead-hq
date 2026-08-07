import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { sendEmailViaResend } from '@/lib/outreach/resend-sender';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { queueId, targetEmail, emailSubject, emailBody } = body;

    let queueItem = null;
    let recipientEmail = targetEmail;
    let subject = emailSubject || 'Outreach from Akarsa';
    let content = emailBody || '';

    if (queueId) {
      const { data: item, error: qErr } = await supabase
        .from('touch_queue')
        .select('*, target_sequences!inner(lead_id, leads!inner(*))')
        .eq('id', queueId)
        .single();

      if (!qErr && item) {
        queueItem = item;
        recipientEmail = item.target_sequences?.leads?.email || targetEmail;
        content = item.draft_body || content;
        
        // Extract subject if present in draft_body
        const subjectRegex = /^Subject:\s*(.+)$/im;
        const match = content.match(subjectRegex);
        if (match) {
          subject = match[1].trim();
          content = content.replace(subjectRegex, '').trim();
        }
      }
    }

    if (!recipientEmail) {
      return NextResponse.json({ error: 'RECIPIENT_EMAIL_MISSING', message: 'No target email provided.' }, { status: 400 });
    }

    // Send email via Resend API (from be@akarsaone.xyz)
    const result = await sendEmailViaResend({
      to: recipientEmail,
      subject,
      text: content,
    });

    if (!result.success) {
      throw new Error(result.error || 'Email send failed');
    }

    console.log("Email dispatched via Resend:", result.messageId);

    // Record touch in Supabase DB with provider_msg_id
    if (queueItem) {
      await supabase.from('touches').insert({
        target_id: queueItem.target_id,
        channel: 'email',
        touch_type: queueItem.touch_type || 'initial_outreach',
        direction: 'outbound',
        notes: `Outbound email via Resend (be@akarsaone.xyz): ${subject}`,
        queue_id: queueItem.id,
        provider_msg_id: result.messageId,
        send_status: 'sent'
      });

      await supabase.from('touch_queue').update({ status: 'sent' }).eq('id', queueItem.id);
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      recipient: recipientEmail
    });
  } catch (error: any) {
    console.error("Resend dispatch error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
