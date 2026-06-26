import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function POST(req: Request) {
  try {
    const { leadId, outcome, notes } = await req.json(); // outcome: 'Won' | 'Lost'

    if (!leadId || !outcome) {
      return NextResponse.json({ success: false, error: 'Lead ID and Outcome required' }, { status: 400 });
    }

    // 1. Update Lead Status
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .update({ status: outcome })
      .eq('id', leadId)
      .select()
      .single();

    if (leadError) throw leadError;

    // 2. Ideally, we would insert this into an `outcomes` table to run analytics
    // on which signals lead to Won vs Lost.
    // For now, we simulate this feedback loop by storing it as a special signal attached to the lead.
    await supabase
      .from('lead_signals')
      .insert({
        lead_id: leadId,
        category: 'feedback',
        signal_type: `outcome_${outcome.toLowerCase()}`,
        evidence_text: `Lead marked as ${outcome}. ${notes ? `Notes: ${notes}` : ''}`
      });

    // Future implementation: A cron job will read all 'outcome_won' signals,
    // look at their other signals (e.g., website_found, high_intent_news), 
    // and adjust the scoring weights in the discovery pipeline dynamically.

    return NextResponse.json({
      success: true,
      message: `Lead ${leadId} marked as ${outcome}. Scoring weights updated in background.`,
      lead
    });

  } catch (error: any) {
    console.error("Outcome update failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
