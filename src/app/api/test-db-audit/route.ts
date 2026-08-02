import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Total Leads Count
    const { count: totalLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });

    // 2. Leads Data Query
    const { data: leads } = await supabase
      .from('leads')
      .select('id, company_name, industry, location, email, phone, phone_e164, domain, score_grade, quality_score, created_at')
      .limit(5000);

    const grades = { A: 0, B: 0, C: 0, D: 0, Unknown: 0 };
    let hasEmail = 0;
    let hasPhone = 0;
    let hasWebsite = 0;
    let hasBoth = 0;

    (leads || []).forEach(l => {
      const g = l.score_grade || 'Unknown';
      grades[g] = (grades[g] || 0) + 1;

      if (l.email) hasEmail++;
      if (l.phone || l.phone_e164) hasPhone++;
      if (l.domain) hasWebsite++;
      if (l.email && (l.phone || l.phone_e164)) hasBoth++;
    });

    // 3. Raw Ingestion Records
    const { data: rawRecords } = await supabase
      .from('raw_records')
      .select('source_name')
      .limit(5000);

    const sources: Record<string, number> = {};
    (rawRecords || []).forEach(r => {
      const s = r.source_name || 'other';
      sources[s] = (sources[s] || 0) + 1;
    });

    // 4. Sample Recent Saved Leads
    const recentLeads = (leads || [])
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    return NextResponse.json({
      success: true,
      audit: {
        total_leads_in_supabase: totalLeads || leads?.length || 0,
        grade_breakdown: grades,
        verified_contact_data: {
          scraped_emails: hasEmail,
          phone_numbers: hasPhone,
          websites: hasWebsite,
          both_email_and_phone: hasBoth
        },
        discovery_launchpads_ingestion: sources,
        sample_recent_saved_leads: recentLeads
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
