import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { callLLM } from '@/lib/llm';

export const maxDuration = 300; // 5 mins
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // CRON_SECRET Protection
  const authHeader = req.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  let stagedCount = 0;
  const logs: string[] = [];

  try {
    // 1. Fetch leads from sequence_ready_leads that do NOT have a sequence yet
    // To do this, we get all sequence_ready_leads, then filter out those in target_sequences
    const { data: readyLeads, error: leadsError } = await supabase
      .from('sequence_ready_leads')
      .select('*')
      .limit(10); // Batch of 10 to avoid timeouts

    if (leadsError) throw leadsError;

    if (!readyLeads || readyLeads.length === 0) {
      return NextResponse.json({ success: true, message: 'No ready leads found to enroll.' });
    }

    const leadIds = readyLeads.map(l => l.id);

    // Get existing sequences for these leads
    const { data: existingSeqs, error: seqError } = await supabase
      .from('target_sequences')
      .select('target_id')
      .in('target_id', leadIds);

    if (seqError) throw seqError;

    const existingSeqIds = new Set(existingSeqs?.map(s => s.target_id) || []);
    const leadsToStage = readyLeads.filter(l => !existingSeqIds.has(l.id));

    if (leadsToStage.length === 0) {
      return NextResponse.json({ success: true, message: 'All fetched ready leads already have sequences.' });
    }

    for (const lead of leadsToStage) {
      try {
        // Fetch Step 1
        const { data: nextStep, error: stepError } = await supabase
          .from('sequence_steps')
          .select('*')
          .eq('sequence_id', 'd3b07384-d113-4c9b-8c5d-2b47d3d19117')
          .eq('step_number', 1)
          .single();

        if (stepError || !nextStep) throw new Error('Failed to fetch step 1');

        // Draft the first touch
        // Fear-Match Prompting based on Geo Tier
        let geoStrategy = "Lead with ROI and traceability ('every number tied to revenue').";
        let complianceRules = "Include a polite, low-friction opt-out mechanism (e.g. 'Let me know if you are not the right person').";

        const geoLower = (lead.geo || '').toLowerCase();
        if (geoLower.includes('uae') || geoLower.includes('dubai') || geoLower.includes('emirates')) {
          geoStrategy = "Lead with premium quality and prestige, NOT cheapness or discounting.";
        } else if (geoLower.includes('india') || geoLower.includes('sea') || geoLower.includes('singapore') || geoLower.includes('malaysia') || geoLower.includes('philippines')) {
          geoStrategy = "Lead with anti-vanity-metrics. Focus on real walk-ins and avoiding fabricated numbers or agencies that just sell 'likes'.";
        } else if (lead.is_eu_lead) {
          geoStrategy = "Ensure a highly professional, transparent tone. Offer value upfront before asking for a meeting.";
          complianceRules = "STRICT COMPLIANCE: Must include GDPR-compliant double opt-in language and state exactly why you are emailing them. (e.g. 'I am reaching out because I saw your business on Google Maps and believe we can help. If you do not wish to receive further emails, please reply UNSUBSCRIBE.'). Do not use tracking pixels.";
        }

        // Build Intent Signals String
        const signals = [];
        if (lead.runs_ads) signals.push("They are currently running Meta/Facebook Ads.");
        if (lead.has_pixel) signals.push("They have a tracking pixel on their website.");
        if (lead.ig_active_low_engagement) signals.push("They post on Instagram but get very low engagement/likes.");
        if (lead.recent_reviews) signals.push("They recently got reviews on Google Maps.");
        if (lead.weak_website) signals.push("They have a weak or non-existent website.");

        const signalContext = signals.length > 0 
          ? `Specific Observations (Use these to fear-match and hook them):\\n- ${signals.join('\\n- ')}` 
          : 'Observation: They are a local business trying to grow.';

        const prompt = `You are a high-end sales copywriter drafting the first cold outreach email for a local business owner.
Target Profile:
- Company Name: ${lead.company_name}
- Contact Person: ${lead.contact_name} (Title: ${lead.contact_title || 'Owner/Founder'})
- Industry: ${lead.industry || 'Local Business'}
- Location: ${lead.geo || 'Unknown'}

Strategy & Constraints:
- Geo-Specific Strategy: ${geoStrategy}
- Compliance: ${complianceRules}
- ${signalContext}

Outreach Channel: ${nextStep.channel.toUpperCase()}
Instruction Hint: ${nextStep.prompt_hint}

Goal:
Write a highly personalized, short, compelling cold email. No buzzwords, no standard marketing speak. Focus on local context if available. It must feel like a 1-to-1 email written by a human.
Include a Subject line.

Return a JSON object with:
{
  "body": "The drafted message body including subject line"
}`;

        const response = await callLLM({
          task: 'Draft initial outreach touchpoint',
          prompt,
          temperature: 0.7
        });

        const draftText = response?.body || '';
        
        if (!draftText) throw new Error('LLM returned empty draft body');

        // ATOMIC STAGING: Only create the sequence if the draft succeeded
        const { error: insertSeqError } = await supabase
          .from('target_sequences')
          .insert({
            target_id: lead.id,
            sequence_id: 'd3b07384-d113-4c9b-8c5d-2b47d3d19117',
            current_step: 0,
            status: 'pending_enrollment'
          });

        if (insertSeqError) throw insertSeqError;

        // Insert into touch_queue as pending_approval
        const { error: queueError } = await supabase
          .from('touch_queue')
          .insert({
            target_id: lead.id,
            step_number: 1,
            channel: nextStep.channel,
            touch_type: nextStep.touch_type,
            draft_body: draftText,
            status: 'pending_approval',
            scheduled_for: new Date().toISOString()
          });

        if (queueError) throw queueError;

        logs.push(`Successfully staged Step 1 for ${lead.company_name} (Pending Enrollment)`);
        stagedCount++;

      } catch (err: any) {
        logs.push(`Failed staging for ${lead.company_name}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        staged: stagedCount,
        duration_ms: Date.now() - startTime
      },
      logs
    });

  } catch (error: any) {
    console.error('[Enroll Leads] Pipeline crashed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
