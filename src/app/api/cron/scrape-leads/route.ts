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

const TARGET_CITIES = ['indore', 'bengaluru', 'mumbai', 'delhi', 'london', 'manchester', 'dubai', 'abu dhabi', 'austin', 'san francisco', 'singapore'];
const COMPETITOR_PATTERNS = /marketing|agency|digital|seo|software|web design|web dev|media|consulting|solutions/i;

export async function POST(request: Request) {
  // EMERGENCY KILL-SWITCH ACTIVE: Ingestion is paused while scoring & filters are rewritten
  return NextResponse.json({
    error: 'INGESTION DISABLED',
    message: 'Lead ingestion is urgently disabled while quality gates and scoring logic are under remediation.'
  }, { status: 503 });

  /* INGESTION PIPELINE (PREPARED FOR RE-ACTIVATION AFTER GATES APPROVED) */
  try {
    const payload = await request.json();
    const records = Array.isArray(payload) ? payload : (payload.items || [payload]);
    
    if (!records || records.length === 0) {
      return NextResponse.json({ success: true, message: 'No records to process' });
    }

    let inserted = 0;
    
    for (const record of records) {
      const company_name = record.name || record.company_name;
      const domain = record.website || record.domain;
      const geo = record.address || record.geo || record.location || 'Unknown';
      const industry = record.category || record.industry || 'Unknown';
      const phone = record.phone || record.phone_e164;
      const email = record.email || record.emails?.[0];
      const rating = record.rating ? parseFloat(record.rating) : null;
      const review_count = record.review_count ? parseInt(record.review_count, 10) : 0;
      const social_links = record.social_links || {};
      const segment = record.segment || 'ingest';
      const source_query = record.source_query || record.searchQuery || record.query || null;
      const source_connector = record.source_connector || record.scraper || 'apify_google_maps';

      if (!company_name) continue;

      const company_name_clean = cleanCompanyName(company_name);
      let status = 'New';
      let rejection_reason: string | null = null;

      // Quality Gate 1: Competitor pattern check
      if (COMPETITOR_PATTERNS.test(company_name_clean) || COMPETITOR_PATTERNS.test(industry)) {
        status = 'Lost';
        rejection_reason = 'competitor';
      }
      // Quality Gate 2: Rating filter (< 3.8 stars)
      else if (rating !== null && (rating as number) < 3.8) {
        status = 'Lost';
        rejection_reason = 'low_rating';
      }
      // Quality Gate 3: Review count lower bound (< 30 reviews)
      else if (review_count < 30) {
        status = 'Lost';
        rejection_reason = 'review_count_below_30';
      }
      // Quality Gate 4: Review count upper bound (> 500 reviews)
      else if (review_count > 500) {
        status = 'Lost';
        rejection_reason = 'review_count_above_500';
      }
      // Quality Gate 5: Non-target city filter
      else if (!TARGET_CITIES.some(c => geo.toLowerCase().includes(c))) {
        status = 'Lost';
        rejection_reason = 'non_target_city';
      }
      // Quality Gate 6: Social / No-reply email
      else if (email && /facebook\.com|instagram\.com|linkedin\.com|noreply|no-reply/i.test(email)) {
        status = 'Lost';
        rejection_reason = 'social_or_noreply_email';
      } 
      // Quality Gate 7: No contact info
      else if (!email && !phone) {
        status = 'Lost';
        rejection_reason = 'no_contact_info';
      }

      // Quality Gate 8: Duplicate check on company_name_clean + geo
      if (status !== 'Lost') {
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .ilike('company_name', `%${company_name_clean}%`)
          .eq('geo', geo)
          .limit(1);

        const existingList = existing || [];
        if (existingList.length > 0) {
          status = 'Lost';
          rejection_reason = 'duplicate_lead';
        }
      }

      const score_factors = {
        company_name_clean,
        rejection_reason,
        source_query,
        source_connector
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
        rejected_reason: rejection_reason,
        score_factors,
        has_website: !!domain,
        source_query,
        source_connector
      });

      if (!error) inserted++;
    }

    return NextResponse.json({ success: true, inserted });
  } catch (error: any) {
    console.error("Ingest error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
