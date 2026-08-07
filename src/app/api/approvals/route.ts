import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { sendEmailViaResend } from '@/lib/outreach/resend-sender';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('touch_queue')
      .select(`
        *,
        leads!inner(*)
      `)
      .eq('status', 'pending_approval')
      .order('scheduled_for', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, draft_body, status, approved_by } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const updatePayload: any = {};
    if (draft_body !== undefined) updatePayload.draft_body = draft_body;
    if (status !== undefined) {
      updatePayload.status = status;
      if (status === 'approved') {
        updatePayload.approved_at = new Date().toISOString();
        updatePayload.approved_by = approved_by || 'system_operator';
      }
    }

    const { data: queueItem, error } = await supabase
      .from('touch_queue')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Enrollment Gate: If this was step 1 and it was approved, flip the sequence to 'active'
    if (status === 'approved' && queueItem.step_number === 1) {
      await supabase
        .from('target_sequences')
        .update({ status: 'active' })
        .eq('target_id', queueItem.target_id)
        .eq('status', 'pending_enrollment');
    }

    // If step is skipped, advance sequence step
    if (status === 'skipped') {
      await supabase
        .from('target_sequences')
        .update({ current_step: queueItem.step_number })
        .eq('target_id', queueItem.target_id);
        
      // Also log touch honestly as skipped
      await supabase
        .from('touches')
        .insert({
          target_id: queueItem.target_id,
          channel: queueItem.channel,
          touch_type: queueItem.touch_type,
          direction: 'outbound',
          notes: `Touchpoint skipped by operator. Step ${queueItem.step_number} of 17.`,
          queue_id: queueItem.id,
          send_status: 'skipped'
        });
    }

    return NextResponse.json({ success: true, data: queueItem });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Bulk Approvals & Immediate Resend Dispatch (replaces Gmail SMTP)
export async function POST(req: Request) {
  try {
    const { ids, approved_by } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Missing array of ids' }, { status: 400 });
    }

    // 1. Mark as approved
    const { data: approvedItems, error } = await supabase
      .from('touch_queue')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: approved_by || 'system_operator'
      })
      .in('id', ids)
      .select('id, target_id, channel, touch_type, draft_body, step_number');

    if (error) throw error;

    // 2. Immediately dispatch approved items via Resend API
    let dispatchedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    if (approvedItems && approvedItems.length > 0) {
      for (const item of approvedItems) {
        const { data: lead } = await supabase
          .from('leads')
          .select('id, company_name, email')
          .eq('id', item.target_id)
          .single();

        if (!lead || !lead.email || !lead.email.includes('@')) {
          errors.push(`Lead ${item.target_id}: No valid email`);
          failedCount++;
          continue;
        }

        let content = item.draft_body || '';
        let subject = `Quick question for ${lead.company_name}`;

        // Extract subject if present in draft_body
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
            text: content,
          });

          if (!result.success) {
            throw new Error(result.error || 'Resend send failed');
          }

          await supabase.from('touches').insert({
            target_id: item.target_id,
            channel: item.channel || 'email',
            touch_type: item.touch_type || 'initial_outreach',
            direction: 'outbound',
            notes: `Sent via Resend (be@akarsaone.xyz): ${subject}`,
            queue_id: item.id,
            provider_msg_id: result.messageId,
            send_status: 'sent'
          });

          await supabase.from('touch_queue').update({ status: 'sent' }).eq('id', item.id);
          await supabase.from('leads').update({ status: 'Contacted' }).eq('id', lead.id);

          dispatchedCount++;
        } catch (sendErr: any) {
          console.error(`Resend send error for ${lead.email}:`, sendErr.message);
          errors.push(`${lead.email}: ${sendErr.message}`);

          // Mark as failed in queue so it can be retried
          await supabase.from('touch_queue').update({ status: 'failed' }).eq('id', item.id);
          failedCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Approved ${ids.length} items. Dispatched ${dispatchedCount} via Resend, ${failedCount} failed.`,
      dispatched: dispatchedCount,
      failed: failedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
