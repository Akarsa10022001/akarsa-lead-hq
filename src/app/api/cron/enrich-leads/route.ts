import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

// Stage 3: ENRICH LEADS (Simulated public signal gathering)
export async function GET(request: Request) {
  try {
    // 1. Fetch leads that are NOT disqualified and haven't been enriched recently
    // For this build, we just grab 10 non-disqualified leads where intent_signal_count is 0 
    // (assuming they start at 0 before enrichment)
    const { data: leads, error: fetchError } = await supabase
      .from('leads')
      .select('id, company_name, domain, industry, geo, social_links')
      .eq('is_disqualified', false)
      .limit(10);

    if (fetchError) throw fetchError;

    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: true, message: 'No leads to enrich.' });
    }

    let enriched = 0;

    for (const lead of leads) {
      // In a real scenario, this is where you'd call out to Apify / PhantomBuster APIs to check Meta Ad Library or scrape the domain.
      // For this build requirement, we implement the logic based on the prompt's rules to mock the enrichment signals cleanly:
      
      let runs_ads = false;
      let has_pixel = false;
      let ig_active_low_engagement = false;
      let recent_reviews = false;
      let weak_website = !lead.domain;

      // Deterministic mock enrichment based on vertical to prove the schema works:
      if (['clinic', 'derma', 'spa', 'd2c', 'e-commerce', 'fitness'].some(kw => lead.industry?.toLowerCase().includes(kw))) {
        runs_ads = true;
        has_pixel = true;
      }
      
      if (['restaurant', 'cafe', 'florist', 'bakery'].some(kw => lead.industry?.toLowerCase().includes(kw))) {
        ig_active_low_engagement = true;
        recent_reviews = true;
      }

      // Update the lead with the new signals
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          runs_ads,
          has_pixel,
          ig_active_low_engagement,
          recent_reviews,
          weak_website
        })
        .eq('id', lead.id);

      if (!updateError) enriched++;
    }

    return NextResponse.json({ success: true, enriched });

  } catch (error: any) {
    console.error("Enrich error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
