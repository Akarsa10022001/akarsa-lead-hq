import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const eventType = payload.type;
    const emailId = payload.data?.email_id;

    if (!emailId || !eventType) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    // Map Resend events to honest touches send_status
    let status = 'sent';
    if (eventType === 'email.delivered') status = 'delivered';
    else if (eventType === 'email.opened') status = 'opened';
    else if (eventType === 'email.bounced') status = 'bounced';
    else if (eventType === 'email.complained') status = 'failed'; // spam report

    // Update touches send_status honestly
    const { data: touch, error } = await supabase
      .from('touches')
      .update({ send_status: status })
      .eq('provider_msg_id', emailId)
      .eq('channel', 'email')
      .select('id, target_id')
      .maybeSingle();

    if (error) {
      console.error('[Resend Webhook] Error updating touch:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (touch && eventType === 'email.bounced') {
      // If bounced, mark target sequence as dropped
      await supabase
        .from('target_sequences')
        .update({ status: 'dropped' })
        .eq('target_id', touch.target_id);
    }

    return NextResponse.json({ success: true, updatedStatus: status });

  } catch (err: any) {
    console.error('[Resend Webhook] Webhook crashed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
