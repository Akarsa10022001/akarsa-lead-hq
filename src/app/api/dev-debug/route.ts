import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { data: queue } = await supabase
      .from('touch_queue')
      .select('id, target_id, step_number, status, leads(company_name)');
      
    const { data: seqs } = await supabase
      .from('target_sequences')
      .select('id, target_id, status, leads(company_name)');

    return NextResponse.json({
      queue_summary: queue,
      sequences_summary: seqs
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
