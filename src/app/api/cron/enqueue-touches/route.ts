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
  let enqueuedCount = 0;
  let skippedCount = 0;
  let adsCount = 0;
  const logs: string[] = [];

  try {
    // 1. Fetch active targets sequences
    const { data: activeTargets, error: fetchError } = await supabase
      .from('target_sequences')
      .select(`
        *,
        dream_targets!inner(*),
        sequences!inner(*)
      `)
      .eq('status', 'active');

    if (fetchError) throw fetchError;

    if (!activeTargets || activeTargets.length === 0) {
      return NextResponse.json({ success: true, message: 'No active target sequences found.' });
    }

    for (const targetSeq of activeTargets) {
      const target = targetSeq.dream_targets;
      const nextStepNum = targetSeq.current_step + 1;

      // Stop condition: Check if target has an open conversion row with status = 'replied' or similar
      const { data: convs } = await supabase
        .from('conversions')
        .select('*')
        .eq('target_id', target.id)
        .eq('outcome', 'replied')
        .limit(1);

      if (convs && convs.length > 0) {
        logs.push(`Target ${target.company_name} has a reply logged. Pausing sequence.`);
        await supabase
          .from('target_sequences')
          .update({ status: 'replied' })
          .eq('id', targetSeq.id);
        continue;
      }

      // Fetch the next step in the sequence
      const { data: nextStep, error: stepError } = await supabase
        .from('sequence_steps')
        .select('*')
        .eq('sequence_id', targetSeq.sequence_id)
        .eq('step_number', nextStepNum)
        .maybeSingle();

      if (stepError) {
        logs.push(`Error fetching step ${nextStepNum} for ${target.company_name}: ${stepError.message}`);
        continue;
      }

      // If there are no more steps, complete the sequence
      if (!nextStep) {
        logs.push(`Completed all steps for target ${target.company_name}.`);
        await supabase
          .from('target_sequences')
          .update({ status: 'completed' })
          .eq('id', targetSeq.id);
        continue;
      }

      // Check if delay_days has elapsed
      const { data: lastTouches } = await supabase
        .from('touches')
        .select('occurred_at')
        .eq('target_id', target.id)
        .order('occurred_at', { ascending: false })
        .limit(1);

      const baseTime = lastTouches && lastTouches.length > 0
        ? new Date(lastTouches[0].occurred_at).getTime()
        : new Date(targetSeq.started_at).getTime();

      const elapsedDays = (Date.now() - baseTime) / (1000 * 60 * 60 * 24);
      if (elapsedDays < nextStep.delay_days) {
        logs.push(`Skipping step ${nextStepNum} for ${target.company_name}: delay not met (${elapsedDays.toFixed(1)}/${nextStep.delay_days} days).`);
        skippedCount++;
        continue;
      }

      // Check if there is already a pending draft for this step in queue to avoid duplicates
      const { data: existingQueue } = await supabase
        .from('touch_queue')
        .select('id')
        .eq('target_id', target.id)
        .eq('step_number', nextStepNum)
        .in('status', ['pending_approval', 'approved', 'awaiting_manual_send'])
        .limit(1);

      if (existingQueue && existingQueue.length > 0) {
        logs.push(`Draft already exists in queue for step ${nextStepNum} of ${target.company_name}.`);
        continue;
      }

      // Guardrail: Check if we have the necessary data for the intended channel
      const hasContactFor = (ch: string) => {
        if (ch === 'linkedin') return !!target.linkedin_url;
        if (ch === 'email') return !!target.email;
        if (ch === 'whatsapp') return !!target.phone;
        if (ch === 'instagram') return !!target.instagram_handle;
        return true; // ads, etc.
      };

      if (!hasContactFor(nextStep.channel)) {
        // Calculate remaining usable channels
        const availableChannels = ['linkedin', 'email', 'whatsapp', 'instagram'].filter(ch => hasContactFor(ch));
        
        // Diversity Floor Exception: If dropping to 1 or 0 channels, pause entire sequence
        if (availableChannels.length <= 1) {
          logs.push(`Diversity Floor hit for ${target.company_name}: only ${availableChannels.length} channels available. Pausing sequence.`);
          await supabase
            .from('target_sequences')
            .update({ 
              status: 'paused',
              channel_diversity_status: 'critical'
            })
            .eq('id', targetSeq.id);
            
          // Trigger async enrichment for everything we can
          fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://akarsa-lead-hq.vercel.app'}/api/cron/enrich-targets?target_id=${target.id}`, { method: 'POST' }).catch(() => {});
          continue;
        }

        // Standard Block & Skip: Log block in queue, advance sequence pointer, trigger enrichment
        logs.push(`Blocked step ${nextStepNum} (${nextStep.channel}) for ${target.company_name}: missing data. Continuing timeline.`);
        
        await supabase
          .from('touch_queue')
          .insert({
            target_id: target.id,
            step_number: nextStepNum,
            channel: nextStep.channel,
            touch_type: nextStep.touch_type,
            draft_body: `Blocked: Missing ${nextStep.channel} contact info.`,
            status: 'blocked_missing_data',
            scheduled_for: new Date().toISOString()
          });

        await supabase
          .from('target_sequences')
          .update({ 
            current_step: nextStepNum,
            channel_diversity_status: 'under_diversified'
          })
          .eq('id', targetSeq.id);

        // Async Enrichment Trigger
        fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://akarsa-lead-hq.vercel.app'}/api/cron/enrich-targets?target_id=${target.id}`, { method: 'POST' }).catch(() => {});
        
        skippedCount++;
        continue;
      }

      // Passive touch: ads (log directly, skip queue, advance step)
      if (nextStep.channel === 'ads') {
        const { error: touchError } = await supabase
          .from('touches')
          .insert({
            target_id: target.id,
            channel: 'ads',
            touch_type: nextStep.touch_type,
            direction: 'passive',
            notes: 'Passive touch point: retargeting ad impression logged automatically.',
            send_status: 'sent'
          });

        if (!touchError) {
          await supabase
            .from('target_sequences')
            .update({ current_step: nextStepNum })
            .eq('id', targetSeq.id);
          adsCount++;
          logs.push(`Passive step ${nextStepNum} (ads) logged directly for ${target.company_name}.`);
        } else {
          logs.push(`Failed to log passive step for ${target.company_name}: ${touchError.message}`);
        }
        continue;
      }

      // AI Drafter abstraction integration
      const isAgency = (target.industry || '').toLowerCase().includes('agency') || 
                       (target.industry || '').toLowerCase().includes('marketing') ||
                       (target.industry || '').toLowerCase().includes('advertising') ||
                       (target.industry || '').toLowerCase().includes('seo') ||
                       (target.industry || '').toLowerCase().includes('design') ||
                       (target.industry || '').toLowerCase().includes('branding') ||
                       (target.industry || '').toLowerCase().includes('pr');

      const pitchFocus = isAgency
        ? 'Pitch "Akarsa One" — a premium multi-client analytics dashboard designed for agencies to track client results, automate reporting, and scale digital operations.'
        : 'Pitch "Akarsa Studio" — elite web development, tailored social media management, organic search optimization, and direct client acquisition services.';

      const prompt = `You are the lead sales copywriter drafting outreach for a high-value prospect.
Target Profile:
- Company Name: ${target.company_name}
- Contact Person: ${target.contact_name} (Title: ${target.contact_title || 'Decision Maker'})
- Industry: ${target.industry || 'General Business'}
- Custom Notes: ${target.notes || 'None provided'}

Outreach Channel: ${nextStep.channel.toUpperCase()}
Touch Point Type: ${nextStep.touch_type.toUpperCase()}
Step Number: ${nextStepNum} of 17
Instruction Hint: ${nextStep.prompt_hint || 'Write a personalized, concise message.'}

Offer details:
${pitchFocus}

Goal:
Write a message that is short, compelling, and natural. Avoid buzzwords, excessive pleasantries, and standard marketing speak. If the channel is email, include a Subject line. If it is LinkedIn, WhatsApp, or Instagram, do NOT include a subject line.

Return a JSON object with:
{
  "body": "The drafted message body"
}`;

      try {
        const response = await callLLM({
          task: 'Generate multi-channel outreach touchpoint draft',
          prompt,
          temperature: 0.7
        });

        const draftText = response?.body || '';
        
        if (!draftText) {
          throw new Error('LLM returned empty draft body');
        }

        // Insert into touch_queue
        const { error: queueError } = await supabase
          .from('touch_queue')
          .insert({
            target_id: target.id,
            step_number: nextStepNum,
            channel: nextStep.channel,
            touch_type: nextStep.touch_type,
            draft_body: draftText,
            status: 'pending_approval',
            scheduled_for: new Date().toISOString()
          });

        if (queueError) throw queueError;

        logs.push(`Successfully queued step ${nextStepNum} (${nextStep.channel}) for ${target.company_name}.`);
        enqueuedCount++;

      } catch (err: any) {
        logs.push(`Failed drafting step ${nextStepNum} for ${target.company_name}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        enqueued: enqueuedCount,
        skipped: skippedCount,
        ads_logged: adsCount,
        duration_ms: Date.now() - startTime
      },
      logs
    });

  } catch (error: any) {
    console.error('[EnqueueTouches] Pipeline crashed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const GET = POST;
