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
    const igHandle = target.instagram_handle ? target.instagram_handle.replace(/^@/, '') : '';

    if (!igHandle) {
      return NextResponse.json({ error: 'Target has no Instagram handle' }, { status: 400 });
    }

    const igProfileUrl = `https://instagram.com/${igHandle}`;

    // 1. Check if there was an inbound touch on Instagram in the last 24 hours
    const limitTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentInbound } = await supabase
      .from('touches')
      .select('id, occurred_at, provider_msg_id')
      .eq('target_id', target.id)
      .eq('channel', 'instagram')
      .eq('direction', 'inbound')
      .gte('occurred_at', limitTime)
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 2. Fetch credentials from social_accounts if available
    const { data: account } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('channel', 'instagram')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    const canAutoSend = recentInbound && account?.access_token && account?.meta?.page_id;

    if (canAutoSend) {
      // 24-hour customer service window is open! Send via Meta Graph API
      const pageId = account.meta.page_id;
      const recipientId = recentInbound.provider_msg_id || target.instagram_handle; // Sender ID from hook
      const bodyText = queueItem.draft_body.replace(/^["'\n]+|["'\n]+$/g, '').trim();

      const url = `https://graph.facebook.com/v19.0/${pageId}/messages`;
      const payload = {
        recipient: { id: recipientId },
        message: { text: bodyText }
      };

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${account.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(`Meta IG API Error: ${JSON.stringify(data)}`);
        }

        const providerMsgId = data?.message_id || `ig_auto_${Date.now()}`;

        // Log honest success
        await supabase
          .from('touches')
          .insert({
            target_id: target.id,
            channel: 'instagram',
            touch_type: queueItem.touch_type,
            direction: 'outbound',
            notes: `Auto-replied via Meta IG API (24h customer window active). MsgId: ${providerMsgId}`,
            queue_id: queueItem.id,
            send_status: 'sent',
            provider_msg_id: providerMsgId
          });

        await supabase
          .from('touch_queue')
          .update({
            status: 'sent',
            approved_at: new Date().toISOString()
          })
          .eq('id', queueItem.id);

        await supabase
          .from('target_sequences')
          .update({ current_step: queueItem.step_number })
          .eq('target_id', target.id);

        return NextResponse.json({
          success: true,
          status: 'sent',
          messageId: providerMsgId,
          method: 'automated'
        });

      } catch (sendError: any) {
        console.warn('[Dispatch Instagram] Meta API auto-send failed, falling back to manual:', sendError.message);
      }
    }

    // Default Assisted-send path: Update status to awaiting_manual_send
    const { error: updateError } = await supabase
      .from('touch_queue')
      .update({ status: 'awaiting_manual_send' })
      .eq('id', queueItem.id);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      status: 'awaiting_manual_send',
      instagramUrl: igProfileUrl,
      draftBody: queueItem.draft_body,
      method: 'assisted'
    });

  } catch (error: any) {
    console.error('[Dispatch Instagram] Crashed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
