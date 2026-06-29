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

    const { data: lead, error } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (error || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const prompt = `Write a short, highly personalized B2B outreach message (under 50 words) to "${lead.company_name}" (Industry: ${lead.industry}). Use this angle: ${lead.ai_hook_draft || 'You have a great business'}. Do NOT include subject lines or placeholders.`;
    
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

    if (!message || message.length < 5) {
      throw new Error("Invalid generation");
    }

    // Save back to lead for review
    await supabase.from('leads').update({ ai_hook_draft: message }).eq('id', leadId);

    return NextResponse.json({ success: true, message });
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
