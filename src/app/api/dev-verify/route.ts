import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'enrich') {
       // Trigger the enrichment
       const res = await fetch(`${url.origin}/api/cron/enrich-leads`);
       const enrichData = await res.json();
       return NextResponse.json({ enrichData });
    }

    // (a) select count(*) from leads where is_disqualified is null
    const { data: q1, error: e1 } = await supabase.from('leads').select('id').is('is_disqualified', null);
    const nullCount = q1 ? q1.length : (e1 ? e1.message : 0);

    // (b) select score_grade, round(avg(close_score),1), count(*) from leads where not is_disqualified group by 1
    // We can't do round/avg in JS client easily without raw SQL. I will just fetch them and reduce.
    const { data: q2, error: e2 } = await supabase.from('sequence_ready_leads').select('score_grade, close_score');
    
    // Actually, wait! sequence_ready_leads has close_score, but the user asked for:
    // `select score_grade, round(avg(close_score),1), count(*) from leads where not is_disqualified group by 1`
    // Since we don't have raw SQL, we will fetch `leads` joined with `close_score`.
    const { data: scores, error: eScores } = await supabase
      .from('leads')
      .select('score_grade, close_score:close_score(close_score)')
      .eq('is_disqualified', false);

    const agg: Record<string, { sum: number, count: number }> = {};
    if (scores) {
      scores.forEach(s => {
        const grade = s.score_grade || 'None';
        const val = s.close_score?.[0]?.close_score || 0;
        if (!agg[grade]) agg[grade] = { sum: 0, count: 0 };
        agg[grade].sum += val;
        agg[grade].count += 1;
      });
    }

    const bResult = Object.keys(agg).map(k => ({
      score_grade: k,
      avg_close_score: (agg[k].sum / agg[k].count).toFixed(1),
      count: agg[k].count
    }));

    // (c) count(*) from leads where not is_disqualified
    const { count: notDisqualifiedCount, error: e3 } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('is_disqualified', false);

    return NextResponse.json({
      a_null_count: nullCount,
      b_scores: bResult,
      c_not_disqualified: notDisqualifiedCount
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
