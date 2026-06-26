import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { callLLM } from '@/lib/llm';

export async function POST() {
  try {
    // 1. Insert a raw record to represent data provenance
    const { data: rawRecord, error: rawError } = await supabase
      .from('raw_records')
      .insert({
        source_name: 'test_script',
        raw_data: { test: true, note: 'Mock data from Phase 1 test' },
        lawful_basis: 'legitimate_interest',
        processed: true
      })
      .select()
      .single();

    if (rawError) throw rawError;

    // 2. Test LLM extraction (simulating extracting a hook)
    // We try to callLLM, but if it fails due to missing keys, we catch it and use a fallback hook
    let aiHook = 'Test AI Hook (Fallback)';
    try {
      const llmResult = await callLLM({
        task: 'Extract a 3-word hook from this text.',
        prompt: 'The company is Acme Corp and they make really great anvils.',
        preferredProvider: 'groq'
      });
      if (llmResult && typeof llmResult === 'object' && llmResult.hook) {
        aiHook = llmResult.hook;
      }
    } catch (e) {
      console.warn("LLM call failed (expected if API keys are missing):", e);
    }

    // 3. Insert a mock lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        company_name: 'Acme Test Corp',
        contact_name: 'Wile E. Coyote',
        industry: 'Hardware',
        status: 'New',
        score_total: 95,
        score_grade: 'A',
        ai_hook_draft: aiHook,
        opted_out: false
      })
      .select()
      .single();

    if (leadError) throw leadError;

    // 4. Insert a lead signal (evidence) linked to the raw record
    const { data: signal, error: signalError } = await supabase
      .from('lead_signals')
      .insert({
        lead_id: lead.id,
        category: 'trigger',
        signal_type: 'test_signal',
        evidence_text: 'Detected in test API call',
        raw_record_id: rawRecord.id
      })
      .select()
      .single();

    if (signalError) throw signalError;

    return NextResponse.json({
      success: true,
      message: 'Successfully inserted test lead with provenance.',
      data: { lead, signal, rawRecord }
    });

  } catch (error: any) {
    console.error("Test insert failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
