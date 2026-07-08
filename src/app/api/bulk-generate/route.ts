import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { callLLM } from '@/lib/llm';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { leadId } = await req.json();
    if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });

    const { data: lead, error } = await supabase.from('leads').select('*, lead_signals(*)').eq('id', leadId).single();
    if (error || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const signals = lead.lead_signals?.map((s: any) => s.evidence_text).join('; ') || 'No specific signals found.';

    const prompt = `You are writing a cold outreach message to a Marketing Agency: "${lead.company_name}".
Your goal is to pitch "Akarsa One" — a multi-client analytics and reporting dashboard for agencies.
Use ONLY these scraped facts to personalize the message: [${signals}].
If the facts show they manage social media for multiple clients, mention how Akarsa One provides one dashboard for all their clients' Instagram/YouTube analytics and automated monthly reports.
Write a casual, 2-sentence English version and a Hinglish version.
Return valid JSON with keys "english" and "hinglish".`;
    // 8s abort controller
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let message = '';
    try {
      const result = await callLLM({
        task: 'Generate short outreach message',
        prompt,
        preferredProvider: 'groq'
      });
      message = result?.message || result?.hook || result?.text || JSON.stringify(result);
    } finally {
      clearTimeout(timeout);
    }

    let messageStr = '';
    if (typeof message === 'string') messageStr = message;
    else if (message.english) messageStr = `[EN] ${message.english}\n\n[HI] ${message.hinglish || ''}`;

    if (!messageStr || messageStr.length < 5) {
      throw new Error("Invalid generation");
    }

    // Save back to lead for review
    await supabase.from('leads').update({ ai_hook_draft: messageStr }).eq('id', leadId);

    return NextResponse.json({ success: true, message: messageStr });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'Timeout' }, { status: 504 });
    }
    // Check for 429 string in error
    if (err.message?.includes('429')) {
      return NextResponse.json({ error: 'Rate limit' }, { status: 429 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
