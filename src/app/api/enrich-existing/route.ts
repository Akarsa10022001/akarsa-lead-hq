import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { enrichLead } from '@/lib/enrichment/scorer';
import { extractAgencySignals } from '@/lib/enrichment/agency-extractor';
import pLimit from 'p-limit';

export const maxDuration = 300; // 5 mins for large batches
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) { return POST(req); }
export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    const url = new URL(req.url);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const limitParam = parseInt(url.searchParams.get('limit') || '25', 10);

    // Fetch leads
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .order('id')
      .range(offset, offset + limitParam - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ message: "No leads to enrich at this offset." });
    }

    const limit = pLimit(4); // Run 4 concurrently
    let successCount = 0;
    let failCount = 0;

    // Dynamically import to avoid top-level issues if any
    const { scrapeWebsiteEmails } = await import('@/lib/connectors/email-scraper');

    await Promise.allSettled(leads.map(lead => limit(async () => {
      try {
        const locationHint = lead.location || '';
        
        let website_status = lead.website_status || 'none';
        let rating = lead.rating;
        let review_count = lead.review_count;

        // Try to get rating from raw_records if missing
        if (rating === null || rating === undefined) {
          const { data: rawRecord } = await supabase
            .from('raw_records')
            .select('raw_data')
            .eq('source_name', 'google_places')
            .contains('raw_data', { name: lead.company_name })
            .maybeSingle();
            
          if (rawRecord && rawRecord.raw_data) {
            rating = rawRecord.raw_data.rating;
            review_count = rawRecord.raw_data.user_ratings_total;
          }
        }

        // Try to get website_status if missing or basic
        if (lead.domain && (!website_status || website_status === 'live' || website_status === 'none')) {
          try {
             const scrapeResult = await scrapeWebsiteEmails(lead.domain);
             website_status = scrapeResult.website_status;
             
             if (scrapeResult.homepage_text) {
               const signals = await extractAgencySignals(scrapeResult.homepage_text, lead.domain);
               if (signals) {
                 const newEvidence = [];
                 if (signals.manages_multiple_clients) newEvidence.push({ category: 'budget', signal_type: 'multi_client', evidence_text: `Manages multiple clients: ${signals.manages_multiple_clients}` });
                 if (signals.platforms_managed) newEvidence.push({ category: 'budget', signal_type: 'platforms', evidence_text: `Platforms managed: ${signals.platforms_managed}` });
                 if (signals.team_size_or_client_count) newEvidence.push({ category: 'budget', signal_type: 'team_size', evidence_text: `Size/Clients: ${signals.team_size_or_client_count}` });
                 if (signals.reporting_analytics_offering) newEvidence.push({ category: 'budget', signal_type: 'reporting', evidence_text: `Reporting offering: ${signals.reporting_analytics_offering}` });
                 
                 for (const ev of newEvidence) {
                   await supabase.from('lead_signals').insert({
                     lead_id: lead.id,
                     category: ev.category,
                     signal_type: ev.signal_type,
                     evidence_text: ev.evidence_text
                   });
                 }
               }
             }
          } catch {
             website_status = 'dead';
          }
        }

        const enriched = await enrichLead({
          ...lead,
          website_status,
          has_website: !!lead.domain,
          rating,
          review_count
        }, locationHint);

        const { error: updateError } = await supabase
          .from('leads')
          .update({
            email_verified: enriched.email_verified,
            email_quality: enriched.email_quality,
            phone_e164: enriched.phone_e164,
            website_status: enriched.website_status,
            has_website: enriched.has_website,
            rating: rating,
            review_count: review_count,
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
