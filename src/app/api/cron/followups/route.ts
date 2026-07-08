import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { callLLM } from '@/lib/llm';

export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Find sequences that are 'active'
    const { data: sequences, error: seqError } = await supabase
      .from('outreach_sequences')
      .select(`
        id,
        lead_id,
        leads!inner(*),
        outreach_messages(
          id, step_number, status, sent_at, channel, classification, draft_content
        )
      `)
      .eq('status', 'active');

    if (seqError) throw seqError;
    if (!sequences || sequences.length === 0) {
      return NextResponse.json({ success: true, message: 'No active sequences.' });
    }

    let processed = 0;
    let archived = 0;

    for (const seq of sequences) {
      const messages = seq.outreach_messages || [];
      
      // Has a human replied?
      const hasHumanReply = messages.some(m => 
        m.status === 'received' && 
        (m.classification === 'human_interested' || m.classification === 'human_not_interested')
      );

      if (hasHumanReply) {
        // Stop sequence
        await supabase.from('outreach_sequences').update({ status: 'completed' }).eq('id', seq.id);
        continue;
      }

      // Find the latest outbound message
      const outboundMsgs = messages.filter(m => m.status === 'sent' && m.step_number < 99);
      if (outboundMsgs.length === 0) continue;

      const latestMsg = outboundMsgs.reduce((prev, current) => 
        (prev.step_number > current.step_number) ? prev : current
      );

      const daysSinceLastMsg = (Date.now() - new Date(latestMsg.sent_at).getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceLastMsg > 3) {
        const nextStep = latestMsg.step_number + 1;

        if (nextStep > 5) {
          // Auto-archive
          await supabase.from('outreach_sequences').update({ status: 'completed' }).eq('id', seq.id);
          await supabase.from('leads').update({ status: 'Lost' }).eq('id', seq.lead_id);
          archived++;
          continue;
        }

        // Draft next touch
        const lead: any = Array.isArray(seq.leads) ? seq.leads[0] : seq.leads;
        let prompt = '';
        if (nextStep === 2) prompt = `Write a short follow-up to this business: ${lead?.company_name || 'them'}. Provide a small case study or value metric. Max 2 sentences.`;
        if (nextStep === 3) prompt = `Write a short 3rd touch to ${lead?.company_name || 'them'} asking if they saw the previous note. Soft nudge. Max 2 sentences.`;
        if (nextStep === 4) prompt = `Write a short 4th touch to ${lead?.company_name || 'them'} about their digital presence. Max 2 sentences.`;
        if (nextStep === 5) prompt = `Write a professional break-up email to ${lead?.company_name || 'them'}. You won't bother them again, but leave the door open. Max 2 sentences.`;

        try {
          const llmResult = await callLLM({
            task: `Draft touch ${nextStep}`,
            prompt: `${prompt} Return JSON with key "message".`,
            preferredProvider: 'groq'
          });

          if (llmResult?.message) {
            await supabase.from('outreach_messages').insert({
              sequence_id: seq.id,
              step_number: nextStep,
              channel: latestMsg.channel,
              draft_content: llmResult.message,
              status: 'ready_to_send'
            });
            processed++;
          }
        } catch (e) {
          console.error(`Failed to draft step ${nextStep} for seq ${seq.id}`, e);
        }
      }
    }

    return NextResponse.json({ success: true, queued_followups: processed, archived_leads: archived });
  } catch (error: any) {
    console.error("Followups error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const GET = POST;
