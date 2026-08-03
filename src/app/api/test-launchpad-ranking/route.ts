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
    // 1. Fetch leads with source and grade info
    const { data: leads, error: leadErr } = await supabase
      .from('leads')
      .select('id, company_name, score_grade, quality_score, email, phone, phone_e164, domain, created_at, source_url')
      .limit(5000);

    // 2. Fetch raw records by source_name to get exact agent contribution
    const { data: rawRecords, error: rawErr } = await supabase
      .from('raw_records')
      .select('id, source_name, external_id')
      .limit(5000);

    if (leadErr) {
      return NextResponse.json({ success: false, error: leadErr.message }, { status: 500 });
    }

    // Mapping raw_records count by source
    const rawCounts: Record<string, number> = {};
    (rawRecords || []).forEach(r => {
      const src = r.source_name || 'google_maps';
      rawCounts[src] = (rawCounts[src] || 0) + 1;
    });

    // Grouping saved leads by source (inferred from domain / source_url / evidence or distribution)
    const agentStats: Record<string, {
      name: string;
      total_saved: number;
      grade_a: number;
      grade_b: number;
      grade_c: number;
      grade_d: number;
      with_email: number;
      with_phone: number;
    }> = {
      'google_maps': { name: '📍 Google Maps API', total_saved: 0, grade_a: 0, grade_b: 0, grade_c: 0, grade_d: 0, with_email: 0, with_phone: 0 },
      'foursquare': { name: '🟣 Foursquare Places', total_saved: 0, grade_a: 0, grade_b: 0, grade_c: 0, grade_d: 0, with_email: 0, with_phone: 0 },
      'osm': { name: '🗺️ OSM / Nominatim', total_saved: 0, grade_a: 0, grade_b: 0, grade_c: 0, grade_d: 0, with_email: 0, with_phone: 0 },
      'reddit_intent': { name: '🔥 Reddit & RFP Intent', total_saved: 0, grade_a: 0, grade_b: 0, grade_c: 0, grade_d: 0, with_email: 0, with_phone: 0 },
      'gdelt_news': { name: '📰 GDELT News Triggers', total_saved: 0, grade_a: 0, grade_b: 0, grade_c: 0, grade_d: 0, with_email: 0, with_phone: 0 },
      'opencorporates': { name: '🏢 OpenCorporates Registry', total_saved: 0, grade_a: 0, grade_b: 0, grade_c: 0, grade_d: 0, with_email: 0, with_phone: 0 },
      'meta_ads': { name: '📣 Meta Ad Library', total_saved: 0, grade_a: 0, grade_b: 0, grade_c: 0, grade_d: 0, with_email: 0, with_phone: 0 },
      'telegram_intent': { name: '✈️ Telegram & Social Intent', total_saved: 0, grade_a: 0, grade_b: 0, grade_c: 0, grade_d: 0, with_email: 0, with_phone: 0 }
    };

    // Classify each saved lead into its primary agent source
    (leads || []).forEach(lead => {
      const srcUrl = (lead.source_url || '').toLowerCase();
      let agentKey = 'google_maps';

      if (srcUrl.includes('facebook.com/ads') || srcUrl.includes('meta') || srcUrl.includes('instagram.com')) {
        agentKey = 'meta_ads';
      } else if (srcUrl.includes('reddit.com')) {
        agentKey = 'reddit_intent';
      } else if (srcUrl.includes('t.me') || srcUrl.includes('discord')) {
        agentKey = 'telegram_intent';
      } else if (srcUrl.includes('foursquare.com')) {
        agentKey = 'foursquare';
      } else if (srcUrl.includes('openstreetmap.org')) {
        agentKey = 'osm';
      } else if (srcUrl.includes('gdelt') || srcUrl.includes('news')) {
        agentKey = 'gdelt_news';
      } else if (srcUrl.includes('opencorporates.com')) {
        agentKey = 'opencorporates';
      }

      const stats = agentStats[agentKey] || agentStats['google_maps'];
      stats.total_saved++;
      
      const grade = lead.score_grade || 'C';
      if (grade === 'A') stats.grade_a++;
      else if (grade === 'B') stats.grade_b++;
      else if (grade === 'C') stats.grade_c++;
      else stats.grade_d++;

      if (lead.email) stats.with_email++;
      if (lead.phone || lead.phone_e164) stats.with_phone++;
    });

    // Add raw record baseline data
    Object.keys(agentStats).forEach(k => {
      if (rawCounts[k] && agentStats[k].total_saved === 0) {
        agentStats[k].total_saved = rawCounts[k];
      }
    });

    // Rank by Grade A Quality
    const qualityRanked = Object.values(agentStats)
      .sort((a, b) => (b.grade_a * 100 + b.grade_b * 10 + b.total_saved) - (a.grade_a * 100 + a.grade_b * 10 + a.total_saved));

    // Rank by Volume
    const volumeRanked = Object.values(agentStats)
      .sort((a, b) => b.total_saved - a.total_saved);

    return NextResponse.json({
      success: true,
      total_leads_in_database: leads?.length || 0,
      quality_leaderboard: qualityRanked,
      volume_leaderboard: volumeRanked,
      raw_ingestion_counts: rawCounts
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
