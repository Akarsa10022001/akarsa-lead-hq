import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function GET() {
  try {
    // 1. Fetch channel performance view
    const { data: channelPerf, error: channelErr } = await supabase
      .from('channel_performance')
      .select('*');

    if (channelErr) throw channelErr;

    // 2. Fetch touch effectiveness view
    const { data: touchEff, error: touchErr } = await supabase
      .from('touch_number_effectiveness')
      .select('*');

    if (touchErr) throw touchErr;

    // 3. Fetch summary stats
    const { data: conversions, error: convErr } = await supabase
      .from('conversions')
      .select('outcome, touches_to_outcome');

    if (convErr) throw convErr;

    const totalConvs = conversions?.length || 0;
    const totalWon = conversions?.filter(c => c.outcome === 'won').length || 0;
    const totalReplies = conversions?.filter(c => ['replied', 'meeting_booked', 'won'].includes(c.outcome)).length || 0;
    
    // Average touches to outcome calculation
    const withTouches = conversions?.filter(c => c.touches_to_outcome > 0) || [];
    const avgTouches = withTouches.length > 0
      ? withTouches.reduce((acc, curr) => acc + curr.touches_to_outcome, 0) / withTouches.length
      : 0;

    return NextResponse.json({
      channelPerformance: channelPerf || [],
      touchEffectiveness: touchEff || [],
      summary: {
        totalConversions: totalConvs,
        totalWon,
        totalReplies,
        winRatePercent: totalConvs > 0 ? ((totalWon / totalConvs) * 100).toFixed(1) : 0,
        averageTouches: avgTouches.toFixed(1)
      }
    });

  } catch (error: any) {
    console.error('[Insights API] Failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
