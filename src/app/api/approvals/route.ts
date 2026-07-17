import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

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

// Bulk Approvals
export async function POST(req: Request) {
  try {
    const { ids, approved_by } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Missing array of ids' }, { status: 400 });
    }

    const { data: approvedItems, error } = await supabase
      .from('touch_queue')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: approved_by || 'system_operator'
      })
      .in('id', ids)
      .select('target_id, step_number');

    if (error) throw error;

    // Enrollment Gate: Flip any step 1s to active
    if (approvedItems && approvedItems.length > 0) {
      const step1TargetIds = approvedItems.filter(item => item.step_number === 1).map(item => item.target_id);
      
      if (step1TargetIds.length > 0) {
        await supabase
          .from('target_sequences')
          .update({ status: 'active' })
          .in('target_id', step1TargetIds)
          .eq('status', 'pending_enrollment');
      }
    }

    return NextResponse.json({ success: true, message: `Successfully approved ${ids.length} items.` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
