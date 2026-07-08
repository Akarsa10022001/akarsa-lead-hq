import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { callLLM } from '@/lib/llm';
import { isAgencyCategory } from '@/lib/connectors/industries';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const AGENCY_LABELS = [
  'Digital Marketing Agency', 'Social Media Agency', 'Advertising Agency',
  'Branding Studio', 'PR Firm', 'Marketing Consultant', 'SEO Agency', 'Web Design Agency',
  'advertising_agency', 'marketing'
];

function isAgencyLead(lead: any): boolean {
  // Check industry field against known agency labels
  const industry = (lead.industry || '').toLowerCase();
  return AGENCY_LABELS.some(a => industry.includes(a.toLowerCase())) || isAgencyCategory(lead.industry || '');
}

export async function POST(req: Request) {
  try {
    const { leadId } = await req.json();
    if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });

    const { data: lead, error } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (error || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    // Fetch signals safely (Supabase returns error object instead of throwing)
    const { data: signalsData } = await supabase.from('lead_signals').select('*').eq('lead_id', leadId);
    lead.lead_signals = signalsData || [];

    const signals = lead.lead_signals?.map((s: any) => s.evidence_text).join('; ') || 'No specific signals found.';
    const agency = isAgencyLead(lead);

    let prompt: string;

    if (agency) {
      // === AKARSA ONE PITCH (for marketing agencies) ===
      prompt = `You are writing a cold outreach message to a marketing agency: "${lead.company_name}" (${lead.industry}).
Your goal is to pitch "Akarsa One" — a multi-client analytics and reporting dashboard built for agencies.
Use ONLY these scraped facts to personalize the message: [${signals}].
If there are no facts provided, invent a highly unique, engaging question related to their company name or location to start the message. DO NOT use the exact same hook twice.
If the facts show they manage social media for multiple clients, mention how Akarsa One provides one dashboard for all their clients' Instagram/YouTube analytics and automated monthly reports.
Write a casual, 2-sentence English version and a Hinglish version.
Return valid JSON with keys "english" and "hinglish".`;
    } else {
      // === AKARSA STUDIO PITCH (for general businesses) ===
      prompt = `Write a short, highly personalized B2B outreach message (under 50 words) to "${lead.company_name}" (Industry: ${lead.industry}, Location: ${lead.location || 'N/A'}).
You are pitching web development, social media management, and digital marketing services from "Akarsa Studio".
Use this angle: ${lead.ai_hook_draft || 'Your business deserves a stronger online presence'}.
Use these facts if available: [${signals}].
Be casual, specific to their business. DO NOT include subject lines or placeholders. DO NOT repeat the same message for different businesses.
Make the message unique by referencing the company name, their industry, or their location.`;
    }

    // 8s abort controller
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let message: any = '';
    try {
      const result = await callLLM({
        task: 'Generate short outreach message',
        prompt,
        preferredProvider: 'groq'
      });
      message = result?.message || result?.hook || result?.text || result;
    } finally {
      clearTimeout(timeout);
    }

    let messageStr = '';
    if (typeof message === 'string') messageStr = message;
    else if (message?.english) messageStr = `[EN] ${message.english}\n\n[HI] ${message.hinglish || ''}`;

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
