import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

// Stage 1: INGESTION ENDPOINT (Apify Webhook)
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    
    // Apify usually sends an array of items, or a single object if configured differently.
    const records = Array.isArray(payload) ? payload : (payload.items || [payload]);
    
    if (!records || records.length === 0) {
      return NextResponse.json({ success: true, message: 'No records to process' });
    }

    let inserted = 0;
    
    for (const record of records) {
      // Parse Apify output shape
      const company_name = record.name || record.company_name;
      const domain = record.website || record.domain;
      const geo = record.address || record.geo || record.location || 'Unknown';
      const industry = record.category || record.industry || 'Unknown';
      const phone = record.phone || record.phone_e164;
      const email = record.email || record.emails?.[0];
      const rating = record.rating ? parseFloat(record.rating) : null;
      const review_count = record.review_count || record.reviews || 0;
      const social_links = record.social_links || {};
      const segment = record.segment || 'ingest'; // Allows test_ingest tagging

      if (!company_name) continue;

      // Note: is_generic_email, email_is_valid, and is_disqualified are generated columns in the DB!
      // But the prompt said: "Run email_is_valid and is_generic_email checks ON INGEST so garbage never lands as clean."
      // Since they are generated columns in Postgres, they will automatically be evaluated on insert.
      // But we can also just let Supabase handle the generation.
      
      const { error } = await supabase.from('leads').insert({
        company_name,
        domain,
        geo,
        industry,
        phone_e164: phone,
        email,
        rating,
        review_count,
        social_links,
        segment,
        has_website: !!domain
      });

      // Deduplication is handled by unique constraints on the DB, so we ignore insertion errors for duplicates
      if (!error) inserted++;
    }

    return NextResponse.json({ success: true, inserted });

  } catch (error: any) {
    console.error("Ingest error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
