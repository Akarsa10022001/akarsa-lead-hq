import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    if (action === 'domains') {
      // Show what domains look like in the DB
      const { data } = await supabase
        .from('leads')
        .select('id, domain, has_website, company_name')
        .not('domain', 'is', null)
        .eq('runs_ads', false)
        .limit(20);
      return NextResponse.json({ sample_domains: data });
    }

    if (action === 'test-fetch') {
      // Actually try to fetch a specific domain and show what we get
      const testDomain = url.searchParams.get('domain');
      if (!testDomain) return NextResponse.json({ error: 'provide ?domain=example.com' });

      const urls = [`https://${testDomain}`, `https://www.${testDomain}`, `http://${testDomain}`];
      const results: any[] = [];

      for (const u of urls) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(u, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            redirect: 'follow',
          });
          clearTimeout(timer);
          const text = await res.text();
          const lower = text.toLowerCase();
          results.push({
            url: u,
            status: res.status,
            html_length: text.length,
            has_fbevents: lower.includes('fbevents.js'),
            has_fbq: lower.includes("fbq("),
            has_fb_tr: lower.includes('facebook.com/tr'),
            has_gtm: lower.includes('googletagmanager.com'),
            has_gtag: lower.includes('gtag/js'),
            has_ga: lower.includes('google-analytics.com'),
            has_google_ads: lower.includes('googleads.g.doubleclick.net'),
            first_500_chars: text.substring(0, 500),
          });
          break; // got a response
        } catch (e: any) {
          results.push({ url: u, error: e.message || 'fetch failed' });
        }
      }
      return NextResponse.json({ domain: testDomain, results });
    }

    if (action === 'enrich') {
      const batchResults = [];
      for (let i = 0; i < 6; i++) {
        const res = await fetch(`${url.origin}/api/cron/enrich-leads`);
        const data = await res.json();
        batchResults.push(data);
        if (data.message === 'No leads to enrich.') break;
      }
      return NextResponse.json({ batches: batchResults });
    }

    // Verification queries
    const { data: allLeads } = await supabase.from('leads').select('runs_ads, has_pixel, intent_signal_count');
    const runsAdsCount = allLeads?.filter(l => l.runs_ads === true).length || 0;
    const hasPixelCount = allLeads?.filter(l => l.has_pixel === true).length || 0;
    const intentCount = allLeads?.filter(l => (l.intent_signal_count || 0) >= 1).length || 0;

    const { count: notDisqualified } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('is_disqualified', false);

    const { data: scores } = await supabase.from('close_score').select('close_score');
    let minScore = null, maxScore = null;
    if (scores && scores.length > 0) {
      const vals = scores.map(s => s.close_score).filter(v => v != null);
      minScore = Math.min(...vals);
      maxScore = Math.max(...vals);
    }

    return NextResponse.json({
      query_1: { runs_ads: runsAdsCount, has_pixel: hasPixelCount, intent_gte_1: intentCount },
      query_2: { not_disqualified: notDisqualified },
      query_3: { min_close_score: minScore, max_close_score: maxScore },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
