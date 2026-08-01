import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import nodemailer from 'nodemailer';

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

// Bulk Approvals & Immediate Gmail Dispatch
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

    // 2. Immediately dispatch approved items via Gmail SMTP
    const user = process.env.GMAIL_USER || 'beakarsa@gmail.com';
    const pass = process.env.GMAIL_APP_PASSWORD || 'kjdoqgnjdgcvmnrx';

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });

    let dispatchedCount = 0;

    if (approvedItems && approvedItems.length > 0) {
      for (const item of approvedItems) {
        const { data: lead } = await supabase
          .from('leads')
          .select('id, company_name, email')
          .eq('id', item.target_id)
          .single();

        if (!lead || !lead.email || !lead.email.includes('@')) continue;

        let content = item.draft_body || '';
        let subject = `Outreach from Akarsa for ${lead.company_name}`;

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

          await supabase.from('touches').insert({
            target_id: item.target_id,
            channel: item.channel || 'email',
            touch_type: item.touch_type || 'initial_outreach',
            direction: 'outbound',
            notes: `Automated Gmail SMTP Send: ${subject}`,
            queue_id: item.id,
            provider_msg_id: info.messageId,
            send_status: 'sent'
          });

          await supabase.from('touch_queue').update({ status: 'sent' }).eq('id', item.id);
          await supabase.from('leads').update({ status: 'Contacted' }).eq('id', lead.id);

          dispatchedCount++;
        } catch (sendErr: any) {
          console.error(`Gmail send error for ${lead.email}:`, sendErr.message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully approved ${ids.length} items and dispatched ${dispatchedCount} live emails to Gmail Sent box.`
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
