import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import nodemailer from 'nodemailer';

export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const user = process.env.GMAIL_USER || 'beakarsa@gmail.com';
    const pass = process.env.GMAIL_APP_PASSWORD || 'kjdoqgnjdgcvmnrx';

    // 1. Fetch all 'New' leads with an email
    let allLeads: any[] = [];
    let pageIndex = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('leads')
        .select('id, company_name, email, phone, geo, location, rating, review_count, status')
        .eq('is_test', false)
        .not('email', 'is', null)
        .not('email', 'eq', '')
        .eq('status', 'New')
        .range(pageIndex * pageSize, (pageIndex + 1) * pageSize - 1);

      if (error) break;
      if (data && data.length > 0) {
        allLeads = allLeads.concat(data);
        if (data.length < pageSize) hasMore = false;
        else pageIndex++;
      } else {
        hasMore = false;
      }
    }

    allLeads = allLeads.filter(l => l.email && l.email.includes('@'));

    if (!allLeads || allLeads.length === 0) {
      return NextResponse.json({ success: true, message: 'No new emailable leads pending bulk send.', sentCount: 0, totalRemainingNew: 0 });
    }

    // 2. Fetch signals for evidence text
    const { data: signals } = await supabase
      .from('lead_signals')
      .select('lead_id, signal_type, evidence_text');

    const signalsByLead: Record<string, string[]> = {};
    (signals || []).forEach(s => {
      signalsByLead[s.lead_id] = signalsByLead[s.lead_id] || [];
      signalsByLead[s.lead_id].push(s.evidence_text);
    });

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });

    const { data: defaultSeq } = await supabase.from('sequences').select('id').limit(1);
    const sequenceId = defaultSeq?.[0]?.id;

    let sentCount = 0;
    const sentResults = [];

    // Process top 25 leads per click for fast, reliable deliverability
    const leadsToProcess = allLeads.slice(0, 25);

    for (const lead of leadsToProcess) {
      const leadEvidences = signalsByLead[lead.id] || [];
      const primaryEvidence = leadEvidences[0] || `Established business in ${lead.geo || lead.location || 'your area'}`;

      const subject = `Quick question regarding ${lead.company_name}`;
      const body = `Hi ${lead.company_name} Team,\n\nI was looking into local market leaders in ${lead.geo || lead.location || 'your area'} and noticed: ${primaryEvidence}.\n\nWe help top local businesses scale revenue with automated client acquisition infrastructure. Would you be open to a quick 5-minute chat this week?\n\nBest regards,\nAkarsa Team`;

      try {
        const info = await transporter.sendMail({
          from: `"Akarsa" <${user}>`,
          to: lead.email,
          subject,
          text: body
        });

        // Create target_sequence if missing
        const { data: targetSeq } = await supabase
          .from('target_sequences')
          .select('id')
          .eq('target_id', lead.id)
          .maybeSingle();

        let targetId = targetSeq?.id;
        if (!targetId) {
          const { data: newTarget } = await supabase
            .from('target_sequences')
            .insert({
              target_id: lead.id,
              sequence_id: sequenceId,
              status: 'active',
              current_step: 1
            })
            .select('id')
            .single();

          targetId = newTarget?.id;
        }

        // Record touch & update status to 'Contacted'
        await supabase.from('touches').insert({
          target_id: lead.id,
          channel: 'email',
          touch_type: 'initial_outreach',
          direction: 'outbound',
          notes: `1-Click Bulk Outreach: ${subject}`,
          provider_msg_id: info.messageId,
          send_status: 'sent'
        });

        await supabase.from('leads').update({ status: 'Contacted' }).eq('id', lead.id);

        sentCount++;
        sentResults.push({ id: lead.id, company: lead.company_name, email: lead.email, messageId: info.messageId });
      } catch (sendErr: any) {
        console.error(`Bulk send error for ${lead.company_name}:`, sendErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      sentCount,
      totalRemainingNew: allLeads.length - sentCount,
      sentResults
    });
  } catch (error: any) {
    console.error("enroll-and-send-bulk error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
