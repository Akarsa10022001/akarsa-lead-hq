import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function POST(req: Request) {
  try {
    const { messageIds } = await req.json();

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json({ success: false, error: 'messageIds array required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('outreach_messages')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .in('id', messageIds)
      .eq('status', 'ready_to_send')
      .select();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: `Approved ${data.length} messages for sending.`,
      approved_count: data.length
    });

  } catch (error: any) {
    console.error("Outreach approve failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
