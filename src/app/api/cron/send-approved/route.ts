import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { sendEmailViaResend } from '@/lib/outreach/resend-sender';

export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
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
      let subject = `Quick question for ${lead.company_name}`;

      const subjectRegex = /^Subject:\s*(.+)$/im;
      const match = content.match(subjectRegex);
      if (match) {
        subject = match[1].trim();
        content = content.replace(subjectRegex, '').trim();
      }

      try {
        const result = await sendEmailViaResend({
          to: lead.email,
          subject,
          text: content
        });

        if (!result.success) {
          throw new Error(result.error || 'Resend send failed');
        }

        // Write touch record
        await supabase.from('touches').insert({
          target_id: item.target_id,
          channel: item.channel || 'email',
          touch_type: item.touch_type || 'initial_outreach',
          direction: 'outbound',
          notes: `Automated Resend API send (be@akarsaone.xyz): ${subject}`,
          queue_id: item.id,
          provider_msg_id: result.messageId,
          send_status: 'sent'
        });

        // Update queue item to sent
        await supabase.from('touch_queue').update({ status: 'sent' }).eq('id', item.id);

        sentCount++;
        sentResults.push({ id: item.id, company: lead.company_name, recipient: lead.email, messageId: result.messageId });
      } catch (sendError: any) {
        console.error(`Error sending to ${lead.email}:`, sendError.message);
        await supabase.from('touch_queue').update({ status: 'failed' }).eq('id', item.id);
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
