import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

function cleanCompanyName(rawName: string): string {
  if (!rawName) return '';
  let cleaned = rawName.replace(/\(.*?\)/g, '');
  if (cleaned.includes('|')) cleaned = cleaned.split('|')[0];
  if (cleaned.length > 40 && cleaned.includes(' - ')) cleaned = cleaned.split(' - ')[0];
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

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

      const company_name_clean = cleanCompanyName(company_name);
      let status = 'New';
      let rejection_reason: string | null = null;

      // 1. Negative Filter: Social / No-reply email
      if (email && /facebook\.com|instagram\.com|linkedin\.com|noreply|no-reply/i.test(email)) {
        status = 'Rejected';
        rejection_reason = 'social_or_noreply_email';
      } 
      // 2. Negative Filter: No contact info
      else if (!email && !phone) {
        status = 'Rejected';
        rejection_reason = 'no_contact_info';
      }

      // 3. Negative Filter: Duplicate check on company_name_clean + geo
      if (status !== 'Rejected') {
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .ilike('company_name', `%${company_name_clean}%`)
          .eq('geo', geo)
          .limit(1);

        if (existing && existing.length > 0) {
          status = 'Rejected';
          rejection_reason = 'duplicate_lead';
        }
      }

      const score_factors = {
        company_name_clean,
        rejection_reason
      };

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
        status,
        score_factors,
        has_website: !!domain
      });

      if (!error) inserted++;
    }

    return NextResponse.json({ success: true, inserted });

  } catch (error: any) {
    console.error("Ingest error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
