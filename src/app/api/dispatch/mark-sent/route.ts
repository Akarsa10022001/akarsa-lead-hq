import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function POST(req: Request) {
  try {
    const { queueId } = await req.json();
    if (!queueId) {
      return NextResponse.json({ error: 'Missing queueId' }, { status: 400 });
    }

    // 1. Fetch enqueued item
    const { data: queueItem, error: fetchError } = await supabase
      .from('touch_queue')
      .select(`
        *,
        dream_targets!inner(*)
      `)
      .eq('id', queueId)
      .single();

    if (fetchError || !queueItem) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 });
    }

    const target = queueItem.dream_targets;

    // 2. Log manual touch point honestly
    const { error: touchError } = await supabase
      .from('touches')
      .insert({
        target_id: target.id,
        channel: queueItem.channel,
        touch_type: queueItem.touch_type,
        direction: 'outbound',
        notes: `Manually dispatched touchpoint by operator. Step ${queueItem.step_number} of 17.`,
        queue_id: queueItem.id,
        send_status: 'sent'
      });

    if (touchError) throw touchError;

    // 3. Update queue status
    const { error: queueError } = await supabase
      .from('touch_queue')
      .update({
        status: 'sent',
        approved_at: new Date().toISOString()
      })
      .eq('id', queueItem.id);

    if (queueError) throw queueError;

    // 4. Advance target_sequences step
    const { error: seqError } = await supabase
      .from('target_sequences')
      .update({ current_step: queueItem.step_number })
      .eq('target_id', target.id);

    if (seqError) throw seqError;

    return NextResponse.json({ success: true, message: 'Message successfully marked as sent.' });

  } catch (error: any) {
    console.error('[Dispatch Mark Sent] Crashed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
