import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

export async function GET(request: Request) {
  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'new';

  try {
    const { data: signals, error } = await supabase
      .from('tg_signals')
      .select(`
        id,
        tg_message_id,
        message_text,
        redaction_applied,
        posted_at,
        intent_tier,
        intent_category,
        confidence,
        evidence_span,
        status,
        tg_sources ( title, tg_chat_username, vertical, region ),
        tg_authors ( author_hash, public_username, display_name, signal_count )
      `)
      .eq('status', status)
      .order('posted_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      signals: signals || []
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
