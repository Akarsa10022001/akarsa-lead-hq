import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function POST(req: Request) {
  try {
    const { targetId, outcome, channelOfReply, notes } = await req.json();

    if (!targetId || !outcome) {
      return NextResponse.json({ error: 'Missing targetId or outcome' }, { status: 400 });
    }

    // 1. Calculate touches to outcome (honest count of touches before this reply/conversion)
    const { count, error: countError } = await supabase
      .from('touches')
      .select('*', { count: 'exact', head: true })
      .eq('target_id', targetId);

    if (countError) throw countError;

    const touchesCount = count || 0;

    // 2. Prepare payload
    const now = new Date().toISOString();
    const payload: any = {
      target_id: targetId,
      outcome,
      touches_to_outcome: touchesCount,
      channel_of_reply: channelOfReply || null,
      notes: notes || ''
    };

    if (outcome === 'replied' || outcome === 'meeting_booked' || outcome === 'won') {
      payload.first_reply_at = now;
    }

    if (outcome === 'won') {
      payload.won_at = now;
    }

    // 3. Upsert conversions table (target_id is unique/cascade-linked)
    const { error: upsertError } = await supabase
      .from('conversions')
      .upsert(payload, { onConflict: 'target_id' });

    if (upsertError) throw upsertError;

    // 4. Update sequence status based on outcome to pause automation
    let seqStatus = 'active';
    if (outcome === 'replied' || outcome === 'meeting_booked') {
      seqStatus = 'replied';
    } else if (outcome === 'won') {
      seqStatus = 'won';
    } else if (outcome === 'lost') {
      seqStatus = 'dropped';
    }

    const { error: seqError } = await supabase
      .from('target_sequences')
      .update({ status: seqStatus })
      .eq('target_id', targetId);

    if (seqError) throw seqError;

    return NextResponse.json({ success: true, touchesToOutcome: touchesCount, newStatus: seqStatus });

  } catch (error: any) {
    console.error('[Conversions API] Crashed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
