import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { queueId, targetEmail, emailSubject, emailBody } = body;

    const user = process.env.GMAIL_USER || 'beakarsa@gmail.com';
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (!pass) {
      return NextResponse.json({
        error: 'MISSING_CREDENTIALS',
        message: 'GMAIL_APP_PASSWORD is not set in environment.'
      }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });

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

    // Send email via Gmail SMTP
    const info = await transporter.sendMail({
      from: `"Akarsa" <${user}>`,
      to: recipientEmail,
      subject,
      text: content
    });

    console.log("Email dispatched via Gmail SMTP:", info.messageId);

    // Record touch in Supabase DB with provider_msg_id
    if (queueItem) {
      await supabase.from('touches').insert({
        target_id: queueItem.target_id,
        channel: 'email',
        touch_type: queueItem.touch_type || 'initial_outreach',
        direction: 'outbound',
        notes: `Outbound email dispatched via Gmail SMTP: ${subject}`,
        queue_id: queueItem.id,
        provider_msg_id: info.messageId,
        send_status: 'sent'
      });

      await supabase.from('touch_queue').update({ status: 'sent' }).eq('id', queueItem.id);
    }

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      recipient: recipientEmail
    });
  } catch (error: any) {
    console.error("Gmail dispatch error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
