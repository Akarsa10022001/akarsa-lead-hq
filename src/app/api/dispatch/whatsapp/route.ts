import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { sendWhatsAppTemplate } from '@/lib/outreach/whatsapp';

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
        leads!inner(*)
      `)
      .eq('id', queueId)
      .single();

    if (fetchError || !queueItem) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 });
    }

    const target = queueItem.leads;
    if (!target.phone) {
      return NextResponse.json({ error: 'Target has no phone number' }, { status: 400 });
    }

    // Clean phone number
    const cleanPhone = target.phone.replace(/[\s\-()]/g, '').replace(/^\+/, '');

    // 2. Check consents table for WhatsApp opt-in
    const { data: consent } = await supabase
      .from('consents')
      .select('*')
      .eq('target_id', target.id)
      .eq('channel', 'whatsapp')
      .maybeSingle();

    const isOptedIn = consent?.opted_in === true;

    if (!isOptedIn) {
      // Gated by platform legality -> Set to awaiting_manual_send and abort auto-send
      await supabase
        .from('touch_queue')
        .update({
          status: 'awaiting_manual_send',
          draft_body: queueItem.draft_body + '\n\n[Warning: No recorded WhatsApp opt-in. Please send manually using WhatsApp Web/App.]'
        })
        .eq('id', queueItem.id);

      return NextResponse.json({
        success: false,
        status: 'awaiting_manual_send',
        message: 'No recorded WhatsApp opt-in. Touch queued for manual send.'
      });
    }

    // 3. Fetch WhatsApp credentials from social_accounts table
    const { data: account } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('channel', 'whatsapp')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let accessToken = account?.access_token;
    let phoneNumberId = account?.meta?.phone_number_id;

    if (!accessToken || !phoneNumberId) {
      accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
      phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      
      if (accessToken) {
        console.warn('[Dispatch WhatsApp] Warning: Falling back to process.env.WHATSAPP_ACCESS_TOKEN. This path is deprecated; please connect a social_account entry.');
      }
    }

    if (!accessToken || !phoneNumberId) {
      return NextResponse.json({ error: 'WhatsApp Cloud API credentials not configured.' }, { status: 500 });
    }

    // 4. Send WhatsApp Template Message
    // Standard template intro parameter matching: {{1}} = contact_name, {{2}} = custom pitch/hook snippet
    const bodyText = queueItem.draft_body.replace(/^["'\n]+|["'\n]+$/g, '').trim();

    try {
      // Temporarily override process env credentials for this call if reading from database
      if (account?.access_token) {
        process.env.WHATSAPP_ACCESS_TOKEN = account.access_token;
        process.env.WHATSAPP_PHONE_NUMBER_ID = account.meta?.phone_number_id;
      }

      const result = await sendWhatsAppTemplate({
        to: cleanPhone,
        templateName: 'dream25_intro', // Pre-approved introductions template name
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: target.contact_name },
              { type: 'text', text: bodyText.substring(0, 1000) } // WhatsApp dynamic parameter length limit
            ]
          }
        ]
      });

      const providerMsgId = result?.messages?.[0]?.id || `mock_${Date.now()}`;

      // 5. Log honest success
      await supabase
        .from('touches')
        .insert({
          target_id: target.id,
          channel: 'whatsapp',
          touch_type: queueItem.touch_type,
          direction: 'outbound',
          notes: `Sent official WhatsApp template introduction. MsgId: ${providerMsgId}`,
          queue_id: queueItem.id,
          send_status: 'sent',
          provider_msg_id: providerMsgId
        });

      // 6. Update queue status
      await supabase
        .from('touch_queue')
        .update({
          status: 'sent',
          approved_at: new Date().toISOString()
        })
        .eq('id', queueItem.id);

      // 7. Advance target_sequences step
      await supabase
        .from('target_sequences')
        .update({ current_step: queueItem.step_number })
        .eq('target_id', target.id);

      return NextResponse.json({ success: true, messageId: providerMsgId });

    } catch (sendError: any) {
      // Log honest failure
      await supabase
        .from('touches')
        .insert({
          target_id: target.id,
          channel: 'whatsapp',
          touch_type: queueItem.touch_type,
          direction: 'outbound',
          notes: `WhatsApp dispatch failed: ${sendError.message}`,
          queue_id: queueItem.id,
          send_status: 'failed'
        });

      await supabase
        .from('touch_queue')
        .update({ status: 'failed' })
        .eq('id', queueItem.id);

      return NextResponse.json({ success: false, error: sendError.message }, { status: 500 });
    }

  } catch (error: any) {
    console.error('[Dispatch WhatsApp] Crashed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
