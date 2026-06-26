import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { OSMOverpassConnector } from '@/lib/connectors/osm';
import { CustomTechConnector } from '@/lib/connectors/tech';
import { callLLM } from '@/lib/llm';
import dns from 'dns';

export async function POST() {
  try {
    const osmConnector = new OSMOverpassConnector();
    const techConnector = new CustomTechConnector();

    console.log("Starting discovery run for Indore F&B...");

    // 1. Discover local leads using free OSM Overpass API
    const rawOsmLeads = await osmConnector.search({ location: "Indore", tags: ["amenity=restaurant", "amenity=cafe"] });
    
    // Process first 3 leads for demonstration purposes to avoid timeouts in the serverless function
    const leadsToProcess = rawOsmLeads.slice(0, 3);
    const results = [];

    for (const rawRecord of leadsToProcess) {
      // 2. Normalize OSM data
      const normalizedOsm = osmConnector.normalize(rawRecord);
      
      // Check for existing lead to prevent duplicates
      const externalId = (rawRecord.place_id || rawRecord.id || Date.now()).toString();
      const { data: existingRaw } = await supabase
        .from('raw_records')
        .select('id')
        .eq('external_id', externalId)
        .maybeSingle();

      if (existingRaw) {
        continue; // Skip processing if we already scraped this lead
      }
      
      // Save Raw Record
      const { data: rawDbRecord, error: rawError } = await supabase
        .from('raw_records')
        .insert({
          source_name: osmConnector.name,
          external_id: externalId,
          raw_data: rawRecord,
          lawful_basis: 'public_data',
          processed: true
        })
        .select()
        .single();
        
      if (rawError) continue; // Skip if db error

      // 3. Enrich with Custom Tech-Detection if website exists
      let techEvidence: any[] = [];
      if (normalizedOsm.domain) {
        const techResults = await techConnector.search({ url: normalizedOsm.domain });
        if (techResults.length > 0) {
          techEvidence = techConnector.getEvidence(techResults[0]);
        }
      }

      // Combine all evidence
      const allEvidence = [...normalizedOsm.evidence, ...techEvidence];
      
      let emailVerified = false;
      let discoveredEmail = normalizedOsm.email || null;
      
      // If we don't have an email from OSM, try to extract one from tech results if present
      if (!discoveredEmail && techEvidence.length > 0) {
        // Just mock extracting an email if one existed in the raw text, for now we assume tech connector doesn't return emails, but if it did:
      }

      // Check MX Record if we have an email
      if (discoveredEmail) {
        try {
          const domain = discoveredEmail.split('@')[1];
          if (domain) {
            const mxRecords = await dns.promises.resolveMx(domain);
            if (mxRecords && mxRecords.length > 0) {
              emailVerified = true;
              allEvidence.push({
                category: 'reachability',
                signal_type: 'email_verified',
                evidence_text: `Verified MX records for ${domain}`
              });
            }
          }
        } catch (err) {
          console.warn(`MX check failed for ${discoveredEmail}`);
        }
      }

      // 4. Calculate a basic score based on evidence
      let score = 50; // Base score
      if (allEvidence.find(e => e.signal_type === 'website_found')) score += 15;
      if (allEvidence.find(e => e.signal_type === 'phone_found')) score += 15;
      if (allEvidence.find(e => e.signal_type === 'no_pixel')) score += 10;
      
      let grade = 'C';
      if (score >= 80) grade = 'A';
      else if (score >= 60) grade = 'B';

      // 5. Generate AI Hook using free LLM router
      let aiHook = 'No Hook Generated';
      try {
        const prompt = `Based on this restaurant in Indore: ${normalizedOsm.company_name} (Industry: ${normalizedOsm.industry}). Write a very short 2-5 word compelling hook about digital growth. Return valid JSON with key "hook".`;
        const llmResult = await callLLM({
          task: 'Generate short hook for F&B lead.',
          prompt,
          preferredProvider: 'groq'
        });
        if (llmResult?.hook) aiHook = llmResult.hook;
      } catch (e) {
        console.warn("LLM hook generation failed, using fallback:", e);
      }

      // 6. Insert Lead
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .insert({
          company_name: normalizedOsm.company_name,
          domain: normalizedOsm.domain,
          industry: normalizedOsm.industry,
          phone: normalizedOsm.phone,
          location: normalizedOsm.location,
          status: 'New',
          score_total: score,
          score_grade: grade,
          ai_hook_draft: aiHook,
          opted_out: false
        })
        .select()
        .single();

      if (leadError) continue;

      // 7. Insert Signals/Evidence
      for (const ev of allEvidence) {
        await supabase
          .from('lead_signals')
          .insert({
            lead_id: lead.id,
            category: ev.category,
            signal_type: ev.signal_type,
            evidence_text: ev.evidence_text,
            raw_record_id: rawDbRecord.id
          });
      }

      results.push(lead);
    }

    return NextResponse.json({
      success: true,
      message: `Discovery run completed. Ingested ${results.length} F&B leads.`,
      leads: results
    });

  } catch (error: any) {
    console.error("Discovery cron failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const GET = POST;
