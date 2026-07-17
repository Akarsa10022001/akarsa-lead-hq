import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

// Stage 3: ENRICH LEADS (Simulated public signal gathering)
export async function GET(request: Request) {
  try {
    // 1. Fetch leads that need Enrichment
    // We target leads that are currently disqualified primarily because they are unreachable
    // (i.e. email is null or is generic) so we can attempt to find an owner-direct email.
    const { data: leads, error: fetchError } = await supabase
      .from('leads')
      .select('id, company_name, contact_name, domain, industry, geo, social_links, email, is_generic_email')
      .or('email.is.null,is_generic_email.eq.true')
      .limit(15);

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

      // 3. OWNER-EMAIL ENRICHMENT (The bottleneck fix)
      let newEmail = lead.email;
      let emailFound = false;

      // Implementation of the 3-step waterfall for owner contact enrichment:
      // (a) Scrape website about/team/contact page
      // (b) Scrape Instagram bio for personal email / WhatsApp
      // (c) Domain-pattern guess (firstname@domain) verified via MX
      
      if (lead.domain) {
         // Simulated MX pattern guess based on contact name or 'founder'
         const firstName = lead.contact_name ? lead.contact_name.split(' ')[0].toLowerCase() : 'founder';
         const guessedEmail = `${firstName}@${lead.domain.replace(/^www\./, '')}`;
         
         // In production, we would verify this against Hunter.io or an MX verification API.
         // For this test, we assume the pattern matches and is verified.
         newEmail = guessedEmail;
         emailFound = true;
      } else if (lead.social_links && lead.social_links.instagram) {
         // Simulated IG bio scrape
         newEmail = `owner_${lead.id.substring(0,4)}@gmail.com`; // Mocking a personal email found in bio
         emailFound = true;
      }

      // Update the lead with the new signals
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          runs_ads,
          has_pixel,
          ig_active_low_engagement,
          recent_reviews,
          weak_website,
          ...(emailFound && { email: newEmail })
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
