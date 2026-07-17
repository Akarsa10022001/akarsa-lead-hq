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
        const prompt = `You are a high-end sales copywriter drafting the first cold outreach email for a local business owner.
Target Profile:
- Company Name: ${lead.company_name}
- Contact Person: ${lead.contact_name} (Title: ${lead.contact_title || 'Owner/Founder'})
- Industry: ${lead.industry || 'Local Business'}

Outreach Channel: ${nextStep.channel.toUpperCase()}
Instruction Hint: ${nextStep.prompt_hint}

Goal:
Write a highly personalized, short, compelling cold email. No buzzwords, no standard marketing speak. Focus on local context if available. Include a Subject line.

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
