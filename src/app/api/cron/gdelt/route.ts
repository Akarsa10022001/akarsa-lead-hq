import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { GDELTConnector } from '@/lib/connectors/gdelt';
import { registry } from '@/lib/skills/registry';

export async function POST() {
  try {
    const gdelt = new GDELTConnector();

    console.log("Starting GDELT trigger pipeline...");

    // 1. Fetch leads that we haven't checked recently, or just grab the top 5 for demo
    const { data: leads, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .order('score_total', { ascending: false })
      .limit(5);

    if (leadError) throw leadError;

    const updates = [];

    for (const lead of leads) {
      // 2. Query GDELT for recent news about the company
      const searchRes = await gdelt.search({ keyword: lead.company_name });
      const rawEvents = searchRes.results;
      
      if (rawEvents.length > 0) {
        // Extract evidence format
        const evidence = gdelt.getEvidence(rawEvents[0]);

        // 3. Use Intent Monitor Skill to analyze if this news is high-intent
        let intentScore = 0;
        let reason = '';
        try {
          const intentData = await registry.run('intent_monitor', {
            companyName: lead.company_name,
            industry: lead.industry || 'Unknown',
            evidence
          });
          intentScore = intentData.intent_score || 0;
          reason = intentData.reason || '';
        } catch (e) {
          console.warn("Intent analysis failed:", e);
        }

        // 4. If high intent (score > 6), raise the lead score by 20 points
        if (intentScore >= 6) {
          const newScore = lead.score_total + 20;
          let newGrade = lead.score_grade;
          if (newScore >= 80) newGrade = 'A';
          else if (newScore >= 60) newGrade = 'B';

          await supabase
            .from('leads')
            .update({ 
              score_total: newScore, 
              score_grade: newGrade 
            })
            .eq('id', lead.id);

          // Save the signal so it shows up in the UI as evidence
          await supabase
            .from('lead_signals')
            .insert({
              lead_id: lead.id,
              category: 'trigger',
              signal_type: 'high_intent_news',
              evidence_text: `[Intent Score: ${intentScore}] ${reason} (via GDELT)`
            });

          updates.push({
            company: lead.company_name,
            score_increased_to: newScore,
            intentReason: reason
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `GDELT trigger run completed. Raised scores for ${updates.length} leads.`,
      updates
    });

  } catch (error: any) {
    console.error("GDELT cron failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const GET = POST;
