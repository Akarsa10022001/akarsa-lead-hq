import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { checkWebsiteTechStack } from '@/lib/enrichment/pixel-scraper';
import { checkOpenCorporates } from '@/lib/enrichment/opencorporates';
import { checkGdeltNews } from '@/lib/enrichment/gdelt';
import { checkRedditIntent } from '@/lib/enrichment/reddit';

// Allow this route to run for up to 5 minutes if invoked manually/via cron
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  try {
    // 1. Fetch up to 10 leads that haven't been enriched yet
    const { data: leads, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .is('enriched_at', null)
      .eq('status', 'New')
      .order('created_at', { ascending: false })
      .limit(5); // Small batch size to avoid timeouts

    if (fetchError) {
      throw new Error(`Failed to fetch leads for enrichment: ${fetchError.message}`);
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: true, message: 'No leads pending enrichment.' });
    }

    const results = [];

    // 2. Process each lead
    for (const lead of leads) {
      console.log(`[Enrichment] Processing lead: ${lead.company_name}`);
      
      const updates: any = {
        enriched_at: new Date().toISOString()
      };
      const scoreFactors = typeof lead.score_factors === 'object' && lead.score_factors !== null ? { ...lead.score_factors } : {};

      // A. Pixel & Tech Stack
      if (lead.domain) {
        const tech = await checkWebsiteTechStack(lead.domain);
        updates.runs_ads = tech.hasMetaPixel;
        updates.has_pixel = tech.hasMetaPixel || tech.hasGoogleAnalytics;
        scoreFactors.tech_stack = tech;
      }

      // B. OpenCorporates
      if (lead.company_name) {
        // Simple country code heuristic based on phone or location
        let country = 'ae'; // default Dubai/UAE
        if (lead.phone?.startsWith('+1')) country = 'us';
        else if (lead.phone?.startsWith('+44')) country = 'gb';
        
        const oc = await checkOpenCorporates(lead.company_name, country);
        scoreFactors.opencorporates = oc;
      }

      // C. GDELT News
      if (lead.company_name) {
        const gdelt = await checkGdeltNews(lead.company_name);
        scoreFactors.gdelt = gdelt;
      }

      // D. Reddit Intent
      if (lead.industry && lead.location) {
        const reddit = await checkRedditIntent(lead.industry, lead.location);
        scoreFactors.reddit = reddit;
      }

      updates.score_factors = scoreFactors;

      // 3. Save updates back to database
      const { error: updateError } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', lead.id);

      if (updateError) {
        console.error(`[Enrichment] Failed to update lead ${lead.id}:`, updateError);
        results.push({ id: lead.id, success: false, error: updateError.message });
      } else {
        results.push({ id: lead.id, success: true, company: lead.company_name });
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed: results.length,
      results 
    });

  } catch (error: any) {
    console.error('[Enrichment] Critical error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
