import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { enrichLead } from '@/lib/enrichment/scorer';
import pLimit from 'p-limit';

export const maxDuration = 300; // 5 mins for large batches
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    // Fetch all leads that haven't been enriched yet, or just all leads if we want to force re-enrich
    // We will just process the first 150 non-enriched to stay within safe timeout limits
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .is('enriched_at', null)
      .limit(150);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ message: "No leads to enrich." });
    }

    const limit = pLimit(4); // Run 4 concurrently
    let successCount = 0;
    let failCount = 0;

    await Promise.allSettled(leads.map(lead => limit(async () => {
      try {
        const locationHint = lead.location || '';
        
        // We do not re-scrape websites here to save time, we just use existing data for now
        // A full re-enrich would also call scrapeWebsiteEmails, but that's heavy.
        // We'll just run the scorer based on what we have (phone, email).
        const enriched = await enrichLead({
          ...lead,
          website_status: lead.website_status || (lead.domain ? 'live' : 'none'), // basic assumption
          has_website: lead.has_website !== undefined ? lead.has_website : !!lead.domain
        }, locationHint);

        const { error: updateError } = await supabase
          .from('leads')
          .update({
            email_verified: enriched.email_verified,
            email_quality: enriched.email_quality,
            phone_e164: enriched.phone_e164,
            website_status: enriched.website_status,
            has_website: enriched.has_website,
            quality_score: enriched.quality_score,
            score_factors: enriched.score_factors,
            enriched_at: enriched.enriched_at,
            // Sync legacy fields
            score_total: enriched.quality_score,
            score_grade: enriched.quality_score >= 80 ? 'A' : (enriched.quality_score >= 65 ? 'B' : 'C'),
          })
          .eq('id', lead.id);

        if (updateError) {
          console.warn(`[EnrichExisting] Error updating lead ${lead.id}: ${updateError.message}`);
          failCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        console.warn(`[EnrichExisting] Error processing lead ${lead.id}:`, err);
        failCount++;
      }
    })));

    return NextResponse.json({
      message: `Enrichment complete.`,
      stats: {
        attempted: leads.length,
        success: successCount,
        failed: failCount,
        duration_ms: Date.now() - startTime
      }
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
