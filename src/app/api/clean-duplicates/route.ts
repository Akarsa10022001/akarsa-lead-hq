import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ success: false, error: 'Supabase credentials missing' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Fetch all leads
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, company_name, created_at')
      .order('created_at', { ascending: true }); // Keep oldest, delete newer duplicates

    if (error || !leads) {
      return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
    }

    const seen = new Map<string, string>();
    const duplicateIdsToDelete: string[] = [];

    for (const lead of leads) {
      const key = (lead.company_name || '').trim().toLowerCase();
      if (!key) continue;

      if (seen.has(key)) {
        duplicateIdsToDelete.push(lead.id);
      } else {
        seen.set(key, lead.id);
      }
    }

    let deletedCount = 0;
    if (duplicateIdsToDelete.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < duplicateIdsToDelete.length; i += BATCH_SIZE) {
        const batch = duplicateIdsToDelete.slice(i, i + BATCH_SIZE);
        const { error: delErr } = await supabase
          .from('leads')
          .delete()
          .in('id', batch);

        if (!delErr) {
          deletedCount += batch.length;
        }
      }
    }

    const { count: finalCount } = await supabase.from('leads').select('*', { count: 'exact', head: true });

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${deletedCount} duplicate lead rows.`,
      initial_total: leads.length,
      deleted_duplicates: deletedCount,
      final_unique_leads: finalCount
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
