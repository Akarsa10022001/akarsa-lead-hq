import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { Resend } from 'resend';

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
    if (!target.email) {
      return NextResponse.json({ error: 'Target has no email address' }, { status: 400 });
    }

    // 2. Fetch Resend key from social_accounts table
    const { data: account } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('channel', 'email')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let apiKey = account?.access_token;
    let senderEmail = account?.handle || 'onboarding@resend.dev';

    if (!apiKey) {
      apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        console.warn('[Dispatch Email] Warning: Falling back to process.env.RESEND_API_KEY. This path is deprecated; please connect a social_account entry.');
      }
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'Resend API key not configured. Add it to social_accounts or env vars.' }, { status: 500 });
    }

    // 3. Parse subject and body from draft_body
    let subject = `Quick question for ${target.company_name}`;
    let body = queueItem.draft_body;

    const subjectRegex = /^(?:Subject|subject):\s*(.*)$/m;
    const match = body.match(subjectRegex);
    if (match) {
      subject = match[1].trim();
      body = body.replace(subjectRegex, '').trim();
    }

    // Clean up any remaining leading/trailing quotes or markdown
    body = body.replace(/^["'\n]+|["'\n]+$/g, '').trim();

    // Convert newlines to html line breaks
    const htmlBody = body.replace(/\n/g, '<br/>');

    // 4. Handle Resend Sandbox Mode (Free Tier)
    let finalToEmail = target.email;
    let finalSubject = subject;

    if (senderEmail === 'onboarding@resend.dev') {
      // In Resend Sandbox, you can only send to your own registered email address
      finalToEmail = 'beakarsa@gmail.com';
      finalSubject = `[TEST FOR: ${target.email}] ${subject}`;
    }

    // 5. Send email using Resend
    const resend = new Resend(apiKey);
    const { data: resendResult, error: resendError } = await resend.emails.send({
      from: `Akarsa <${senderEmail}>`,
      to: finalToEmail,
      subject: finalSubject,
      html: `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #333;">${htmlBody}</div>`,
    });

    if (resendError) {
      // Log honest failure
      await supabase
        .from('touches')
        .insert({
          target_id: target.id,
          channel: 'email',
          touch_type: queueItem.touch_type,
          direction: 'outbound',
          notes: `Resend dispatch failed: ${resendError.message}`,
          queue_id: queueItem.id,
          send_status: 'failed'
        });

      await supabase
        .from('touch_queue')
        .update({ status: 'failed' })
        .eq('id', queueItem.id);

      return NextResponse.json({ success: false, error: resendError.message });
    }

    const providerMsgId = resendResult?.id || '';

    // 5. Log honest success
    await supabase
      .from('touches')
      .insert({
        target_id: target.id,
        channel: 'email',
        touch_type: queueItem.touch_type,
        direction: 'outbound',
        notes: `Sent email touchpoint to ${target.email}. Subject: "${subject}"`,
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

  } catch (error: any) {
    console.error('[Dispatch Email] Crashed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
