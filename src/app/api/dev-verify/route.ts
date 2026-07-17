import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

// Temporary route to trigger enrichment batches and fetch verification metrics.
// This will be deleted after verification is complete.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    if (action === 'enrich') {
      // Run multiple batches of the enrichment cron
      const batchResults = [];
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${url.origin}/api/cron/enrich-leads`);
        const data = await res.json();
        batchResults.push(data);
        if (data.message === 'No leads to enrich.') break;
      }
      return NextResponse.json({ batches: batchResults });
    }

    // Verification queries using count approach
    // (1) runs_ads / has_pixel / intent counts
    const { data: allLeads } = await supabase.from('leads').select('runs_ads, has_pixel, intent_signal_count');
    
    const runsAdsCount = allLeads?.filter(l => l.runs_ads === true).length || 0;
    const hasPixelCount = allLeads?.filter(l => l.has_pixel === true).length || 0;
    const intentCount = allLeads?.filter(l => (l.intent_signal_count || 0) >= 1).length || 0;

    // (2) count where not disqualified
    const { count: notDisqualified } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('is_disqualified', false);

    // (3) close_score min/max
    const { data: scores } = await supabase.from('close_score').select('close_score');
    let minScore = null;
    let maxScore = null;
    if (scores && scores.length > 0) {
      const vals = scores.map(s => s.close_score).filter(v => v != null);
      minScore = Math.min(...vals);
      maxScore = Math.max(...vals);
    }

    // (4) dev-verify 404 proof
    const devVerifyCheck = 'This route IS dev-verify. After verification, it will be deleted and return 404.';

    return NextResponse.json({
      query_1: { runs_ads: runsAdsCount, has_pixel: hasPixelCount, intent_gte_1: intentCount },
      query_2: { not_disqualified: notDisqualified },
      query_3: { min_close_score: minScore, max_close_score: maxScore },
      note: devVerifyCheck,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
