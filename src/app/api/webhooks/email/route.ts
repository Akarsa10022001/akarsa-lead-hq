import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { callLLM } from '@/lib/llm';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Resend Inbound Parse payload format usually has from, to, text, subject
    const fromEmail = body.from || '';
    const textContent = body.text || body.html || '';

    if (!fromEmail || !textContent) {
      return new NextResponse('Missing required fields', { status: 400 });
    }

    // Extract email address if format is "Name <email@domain.com>"
    const emailMatch = fromEmail.match(/<([^>]+)>/);
    const cleanFromEmail = emailMatch ? emailMatch[1].toLowerCase() : fromEmail.toLowerCase();

    // 1. Find the lead in Supabase by matching email
    const { data: leads, error: leadError } = await supabase
      .from('leads')
      .select('id')
      .ilike('email', cleanFromEmail)
      .limit(1);

    if (!leadError && leads && leads.length > 0) {
      const leadId = leads[0].id;

      // 2. Find their active sequence
      let { data: sequence } = await supabase
        .from('outreach_sequences')
        .select('id')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!sequence) {
        const { data: newSeq } = await supabase
          .from('outreach_sequences')
          .insert({ lead_id: leadId, status: 'completed' })
          .select('id')
          .single();
        sequence = newSeq;
      }

      // 3. Classify incoming message
      let classification = 'unclear';
      try {
        const prompt = `Classify this incoming email reply from a lead. Options: human_interested, human_not_interested, auto_reply_bot, unclear. Reply: "${textContent}". Return JSON with key "classification".`;
        const llmResult = await callLLM({
          task: 'Classify reply',
          prompt,
          preferredProvider: 'groq'
        });
        if (llmResult?.classification) {
          classification = llmResult.classification;
        }
      } catch (e) {
        console.warn('Email Webhook classification failed', e);
      }

      // 4. Log the incoming message
      if (sequence) {
        await supabase
          .from('outreach_messages')
          .insert({
            sequence_id: sequence.id,
            step_number: 99, 
            channel: 'email',
            draft_content: textContent,
            sent_at: new Date().toISOString(),
            status: 'received',
            classification: classification
          });
          
        if (classification === 'human_interested') {
          await supabase
            .from('leads')
            .update({ status: 'Engaged' })
            .eq('id', leadId);
        }
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email Webhook processing error:", error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
