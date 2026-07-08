import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  } else {
    return new NextResponse('Forbidden', { status: 403 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Check if it's a WhatsApp status update or message
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.value.messages) {
            // It's an incoming message
            for (const msg of change.value.messages) {
              const fromPhone = msg.from; // Sender's phone number
              let textContent = '';
              
              if (msg.type === 'text') {
                textContent = msg.text.body;
              } else {
                textContent = `[Received non-text message of type: ${msg.type}]`;
              }

              // 1. Find the lead in Supabase by matching phone number
              // Strip all non-numeric characters from the fromPhone for robust matching
              const cleanFromPhone = fromPhone.replace(/\D/g, '');

              const { data: leads, error: leadError } = await supabase
                .from('leads')
                .select('id')
                .filter('phone', 'like', `%${cleanFromPhone.slice(-10)}%`) // Match last 10 digits
                .limit(1);

              if (!leadError && leads && leads.length > 0) {
                const leadId = leads[0].id;

                // 2. Find their active sequence (or create a dummy one for tracking)
                let { data: sequence } = await supabase
                  .from('outreach_sequences')
                  .select('id')
                  .eq('lead_id', leadId)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .single();

                if (!sequence) {
                  // Fallback: create a dummy sequence to attach the message to
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
                  const { callLLM } = require('@/lib/llm');
                  const prompt = `Classify this incoming reply from a lead. Options: human_interested, human_not_interested, auto_reply_bot, unclear. Reply: "${textContent}". Return JSON with key "classification".`;
                  const llmResult = await callLLM({
                    task: 'Classify reply',
                    prompt,
                    preferredProvider: 'groq'
                  });
                  if (llmResult?.classification) {
                    classification = llmResult.classification;
                  }
                } catch (e) {
                  console.warn('Webhook classification failed', e);
                }

                // 4. Log the incoming message
                if (sequence) {
                  await supabase
                    .from('outreach_messages')
                    .insert({
                      sequence_id: sequence.id,
                      step_number: 99, // High number for incoming replies
                      channel: 'whatsapp',
                      draft_content: textContent,
                      sent_at: new Date().toISOString(),
                      status: 'received',
                      classification: classification
                    });
                    
                  // Update lead status if interested
                  if (classification === 'human_interested') {
                    await supabase
                      .from('leads')
                      .update({ status: 'Engaged' })
                      .eq('id', leadId);
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // Meta requires a 200 OK immediately
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
