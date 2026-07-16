import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { executeEnrichment } from '@/lib/enrichment/engine';

export async function POST(req: Request) {
  try {
    // Optionally take a specific target_id to enrich
    const url = new URL(req.url);
    const targetId = url.searchParams.get('target_id');

    let query = supabase
      .from('dream_targets')
      .select('*')
      .is('linkedin_url', null); // Primary trigger for enrichment right now

    if (targetId) {
      query = query.eq('id', targetId);
    } else {
      query = query.limit(5); // Process in batches if running via cron
    }

    const { data: targets, error } = await query;

    if (error) throw error;
    if (!targets || targets.length === 0) {
      return NextResponse.json({ success: true, message: 'No targets need enrichment.' });
    }

    let enrichedCount = 0;
    const logs = [];

    for (const target of targets) {
      const enrichment = await executeEnrichment(target);

      if (enrichment && Object.keys(enrichment.data).length > 0) {
        // Merge the new data provenance with existing
        const existingProvenance = target.data_provenance || {};
        const newProvenance = { ...existingProvenance, ...enrichment.provenance };

        const { error: updateError } = await supabase
          .from('dream_targets')
          .update({
            ...enrichment.data,
            data_provenance: newProvenance,
            updated_at: new Date().toISOString()
          })
          .eq('id', target.id);

        if (updateError) {
          logs.push(`Failed to save enrichment for ${target.company_name}: ${updateError.message}`);
        } else {
          logs.push(`Successfully enriched ${target.company_name}: found ${Object.keys(enrichment.data).join(', ')}`);
          enrichedCount++;
        }
      } else {
        logs.push(`No enrichment data found for ${target.company_name}.`);
      }
    }

    return NextResponse.json({ success: true, enrichedCount, logs });
  } catch (error: any) {
    console.error('[Enrich Targets] Failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
