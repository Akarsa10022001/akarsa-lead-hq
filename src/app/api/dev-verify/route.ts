import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    if (action === 'enrich-all') {
      // Run intent batches, then email recovery batches
      const allResults: any[] = [];
      
      // Intent signal batches (6 rounds = up to 30 leads)
      for (let i = 0; i < 6; i++) {
        const res = await fetch(`${url.origin}/api/cron/enrich-leads?mode=intent`);
        const data = await res.json();
        allResults.push({ type: 'intent', ...data });
        if (data.message) break;
      }

      // Email recovery batches (6 rounds = up to 30 disqualified leads)
      for (let i = 0; i < 6; i++) {
        const res = await fetch(`${url.origin}/api/cron/enrich-leads?mode=email`);
        const data = await res.json();
        allResults.push({ type: 'email', ...data });
        if (data.message) break;
      }

      return NextResponse.json({ batches: allResults });
    }

    // Verification queries
    const { data: allLeads } = await supabase.from('leads').select('runs_ads, has_pixel, intent_signal_count');
    const runsAdsCount = allLeads?.filter(l => l.runs_ads === true).length || 0;
    const hasPixelCount = allLeads?.filter(l => l.has_pixel === true).length || 0;
    const intentCount = allLeads?.filter(l => (l.intent_signal_count || 0) >= 1).length || 0;

    const { count: notDisqualified } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('is_disqualified', false);

    const { data: scores } = await supabase.from('close_score').select('close_score');
    let minScore = null, maxScore = null;
    if (scores && scores.length > 0) {
      const vals = scores.map(s => s.close_score).filter(v => v != null);
      minScore = Math.min(...vals);
      maxScore = Math.max(...vals);
    }

    return NextResponse.json({
      query_1: { runs_ads: runsAdsCount, has_pixel: hasPixelCount, intent_gte_1: intentCount },
      query_2: { not_disqualified: notDisqualified },
      query_3: { min_close_score: minScore, max_close_score: maxScore },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
