import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import nodemailer from 'nodemailer';

export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const user = process.env.GMAIL_USER || 'beakarsa@gmail.com';
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (!pass) {
      return NextResponse.json({ error: 'GMAIL_APP_PASSWORD missing' }, { status: 400 });
    }

    // 1. Fetch approved items in touch_queue
    const { data: approvedItems, error: fetchErr } = await supabase
      .from('touch_queue')
      .select('id, target_id, channel, touch_type, draft_body, status')
      .eq('status', 'approved')
      .limit(20);

    if (fetchErr) throw fetchErr;

    if (!approvedItems || approvedItems.length === 0) {
      return NextResponse.json({ success: true, message: 'No approved items pending dispatch.', sentCount: 0 });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });

    let sentCount = 0;
    const sentResults = [];

    for (const item of approvedItems) {
      // Fetch lead directly by target_id
      const { data: lead } = await supabase
        .from('leads')
        .select('id, company_name, email')
        .eq('id', item.target_id)
        .single();

      if (!lead || !lead.email) {
        await supabase.from('touch_queue').update({ status: 'skipped' }).eq('id', item.id);
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

      try {
        const info = await transporter.sendMail({
          from: `"Akarsa" <${user}>`,
          to: lead.email,
          subject,
          text: content
        });

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

        sentCount++;
        sentResults.push({ id: item.id, company: lead.company_name, recipient: lead.email, messageId: info.messageId });
      } catch (sendError: any) {
        console.error(`Error sending to ${lead.email}:`, sendError.message);
      }
    }

    return NextResponse.json({
      success: true,
      sentCount,
      sentResults
    });
  } catch (error: any) {
    console.error("send-approved cron error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
