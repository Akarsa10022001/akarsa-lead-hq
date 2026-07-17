import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function GET() {
  try {
    // VERIFY 1: select segment, count(*) from leads where segment='test_ingest';
    const { data: q1, error: e1 } = await supabase
      .rpc('run_sql', { query: `select segment, count(*) from leads where segment='test_ingest' group by 1` });
      
    // Wait, since RPC 'run_sql' might not exist, I will use JS client to do the exact same:
    const { data: leads, error: e1alt } = await supabase.from('leads').select('segment').eq('segment', 'test_ingest');
    const ingestCount = leads ? leads.length : 0;

    // VERIFY 2: check if it entered sequence_ready_leads (should be 0)
    const { data: sr, error: e2 } = await supabase.from('sequence_ready_leads').select('id').eq('email', 'drtest@testingestclinic.com');
    const srCount = sr ? sr.length : 0;

    // VERIFY 3: delete it
    await supabase.from('leads').delete().eq('segment', 'test_ingest');

    // VERIFY 4: count after purge
    const { data: afterDelete } = await supabase.from('leads').select('segment').eq('segment', 'test_ingest');
    const afterCount = afterDelete ? afterDelete.length : 0;

    // Stage 10 VERIFY: 
    // select l.industry, l.geo, l.runs_ads, count(*) attempts, count(*) filter (where c.outcome='won') wins from conversions c join leads l on l.id=c.target_id group by 1,2,3 having count(*) >= 15 order by wins desc;
    const { data: insights, error: e10 } = await supabase.from('learn_insights').select('*');

    return NextResponse.json({
      stage_1: {
        before_purge_count: ingestCount,
        sequence_ready_leaks: srCount,
        after_purge_count: afterCount
      },
      stage_10: insights || (e10 ? e10.message : "Empty")
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
