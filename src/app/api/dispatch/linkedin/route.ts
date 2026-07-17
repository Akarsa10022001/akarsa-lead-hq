import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function POST(req: Request) {
  try {
    const { queueId } = await req.json();
    if (!queueId) {
      return NextResponse.json({ error: 'Missing queueId' }, { status: 400 });
    }

    // Fetch queue item
    const { data: queueItem, error: fetchError } = await supabase
      .from('touch_queue')
      .select(`
        *,
        leads!inner(*)
      `)
      .eq('id', queueId)
      .single();

    if (fetchError || !queueItem) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 });
    }

    const target = queueItem.leads;
    if (!target.linkedin_url) {
      return NextResponse.json({ error: 'Target has no LinkedIn URL' }, { status: 400 });
    }

    // Assisted-send path: Update status to awaiting_manual_send
    const { error: updateError } = await supabase
      .from('touch_queue')
      .update({ status: 'awaiting_manual_send' })
      .eq('id', queueItem.id);

    if (updateError) throw updateError;

    // Return the profile URL so the UI can open it, and the draft body to copy
    return NextResponse.json({
      success: true,
      status: 'awaiting_manual_send',
      linkedinUrl: target.linkedin_url,
      draftBody: queueItem.draft_body
    });

  } catch (error: any) {
    console.error('[Dispatch LinkedIn] Crashed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
