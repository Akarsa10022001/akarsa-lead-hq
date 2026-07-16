import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function GET() {
  try {
    // Query directly from touch_queue using anon client
    const { data: queueAnon, error: errorAnon } = await supabase
      .from('touch_queue')
      .select('*');

    // Query dream_targets to see if any exist
    const { data: targetsAnon, error: targetsError } = await supabase
      .from('dream_targets')
      .select('*');

    return NextResponse.json({
      touch_queue_count: queueAnon?.length || 0,
      touch_queue_rows: queueAnon || [],
      anon_error: errorAnon?.message || null,
      dream_targets_count: targetsAnon?.length || 0,
      dream_targets_rows: targetsAnon || [],
      targets_error: targetsError?.message || null
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
