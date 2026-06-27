import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { GooglePlacesConnector } from '@/lib/connectors/google-places';
import { OSMOverpassConnector } from '@/lib/connectors/osm';
import { CustomTechConnector } from '@/lib/connectors/tech';
import { scrapeWebsiteEmails, extractDomain } from '@/lib/connectors/email-scraper';
import { guessEmails, verifyEmail } from '@/lib/connectors/email-guesser';
import { hunterDomainSearch } from '@/lib/connectors/hunter';
import { callLLM } from '@/lib/llm';

/**
 * Discovery Pipeline — 4-Stage Real Contact Data Engine
 * 
 * Stage 1: Google Places API (or OSM fallback) → real businesses with phone, website, rating
 * Stage 2: Website Email Scraper → crawl each website for email addresses
 * Stage 3: Email Pattern Guesser → try common patterns + MX verification
 * Stage 4: Hunter.io (optional fallback) → verified emails from Hunter's database
 */

interface DiscoveryConfig {
  location: string;
  businessType: string;  // Google Places type (e.g. 'restaurant', 'beauty_salon')
  osmTags?: string[];    // OSM tags for fallback
  maxLeads?: number;
}

const DEFAULT_CONFIG: DiscoveryConfig = {
  location: 'Indore',
  businessType: 'restaurant',
  osmTags: ['amenity=restaurant', 'amenity=cafe'],
  maxLeads: 10,
};

export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    // Allow config override from request body
    let config = DEFAULT_CONFIG;
    try {
      const body = await req.json();
      if (body.location) config = { ...config, ...body };
    } catch { /* Use defaults if no body */ }

    console.log(`[Discovery] Starting pipeline for "${config.businessType}" in "${config.location}"...`);

    // ====================================================================
    // STAGE 1: Discover businesses (Google Places primary, OSM fallback)
    // ====================================================================
    let rawLeads: any[] = [];
    let primarySource = 'google_places';

    const googleConnector = new GooglePlacesConnector();
    const osmConnector = new OSMOverpassConnector();

    // Try Google Places first
    if (process.env.GOOGLE_PLACES_API_KEY) {
      console.log('[Discovery] Stage 1: Using Google Places API...');
      rawLeads = await googleConnector.search({
        location: config.location,
        type: config.businessType,
      });
      console.log(`[Discovery] Google Places returned ${rawLeads.length} results.`);
    }

    // Fallback to OSM if Google Places returned nothing or isn't configured
    if (rawLeads.length === 0) {
      console.log('[Discovery] Stage 1: Falling back to OSM Nominatim...');
      primarySource = 'osm_overpass';
      rawLeads = await osmConnector.search({
        location: config.location,
        tags: config.osmTags || ['amenity=restaurant'],
      });
      console.log(`[Discovery] OSM returned ${rawLeads.length} results.`);
    }

    if (rawLeads.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No businesses found in the target area. Try a different location or business type.',
        leads: [],
        stats: { duration_ms: Date.now() - startTime }
      });
    }

    // ====================================================================
    // Process each lead through the enrichment pipeline
    // ====================================================================
    const leadsToProcess = rawLeads.slice(0, config.maxLeads || 10);
    const results: any[] = [];
    const stats = {
      total_discovered: rawLeads.length,
      processed: 0,
      skipped_duplicate: 0,
      emails_from_website: 0,
      emails_from_pattern: 0,
      emails_from_hunter: 0,
      emails_verified: 0,
      phones_found: 0,
    };

    for (const rawRecord of leadsToProcess) {
      // Normalize the raw data
      const connector = primarySource === 'google_places' ? googleConnector : osmConnector;
      const normalized = connector.normalize(rawRecord);

      // Check for duplicates
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('company_name', normalized.company_name)
        .eq('location', normalized.location)
        .maybeSingle();

      if (existingLead) {
        stats.skipped_duplicate++;
        continue;
      }

      // Save raw record
      const externalId = (rawRecord.place_id || rawRecord.id || Date.now()).toString();
      const { data: rawDbRecord, error: rawError } = await supabase
        .from('raw_records')
        .insert({
          source_name: primarySource,
          external_id: externalId,
          raw_data: rawRecord,
          lawful_basis: 'public_data',
          processed: true
        })
        .select()
        .single();

      if (rawError) {
        console.warn(`[Discovery] Failed to save raw record: ${rawError.message}`);
        continue;
      }

      // ====================================================================
      // STAGE 2: Website Email Scraping
      // ====================================================================
      let discoveredEmail: string | null = null;
      let emailSource = 'none';
      let emailVerified = false;
      const allEvidence = [...normalized.evidence];

      if (normalized.domain) {
        console.log(`[Discovery] Stage 2: Scraping emails from ${normalized.domain}...`);
        try {
          const scrapeResult = await scrapeWebsiteEmails(normalized.domain);
          if (scrapeResult.emails.length > 0) {
            discoveredEmail = scrapeResult.emails[0]; // Take the first (best) email
            emailSource = 'website_scrape';
            stats.emails_from_website++;
            allEvidence.push({
              category: 'reachability' as const,
              signal_type: 'email_scraped',
              evidence_text: `Email found on website (${scrapeResult.source_pages[0]}): ${discoveredEmail}`
            });
            console.log(`[Discovery]   ✓ Found email via scraping: ${discoveredEmail}`);
          }
        } catch (err) {
          console.warn(`[Discovery]   ✗ Website scraping failed for ${normalized.domain}`);
        }
      }

      // ====================================================================
      // STAGE 3: Email Pattern Guessing (if scraping found nothing)
      // ====================================================================
      if (!discoveredEmail && normalized.domain) {
        const domain = extractDomain(normalized.domain);
        if (domain) {
          console.log(`[Discovery] Stage 3: Guessing email patterns for ${domain}...`);
          try {
            const guessResult = await guessEmails(domain);
            if (guessResult.mx_verified && guessResult.candidates.length > 0) {
              // The domain can receive email. Use the most common pattern.
              discoveredEmail = guessResult.candidates[0]; // info@domain
              emailSource = 'pattern_guess';
              emailVerified = true; // MX verified
              stats.emails_from_pattern++;
              allEvidence.push({
                category: 'reachability' as const,
                signal_type: 'email_guessed',
                evidence_text: `Email pattern generated (MX verified via ${guessResult.mx_records[0]}): ${discoveredEmail}`
              });
              console.log(`[Discovery]   ✓ Generated email: ${discoveredEmail} (MX verified)`);
            }
          } catch (err) {
            console.warn(`[Discovery]   ✗ Email guessing failed for ${domain}`);
          }
        }
      }

      // ====================================================================
      // STAGE 4: Hunter.io Fallback (if we still have no email but have a domain)
      // ====================================================================
      if (!discoveredEmail && normalized.domain && process.env.HUNTER_API_KEY) {
        const domain = extractDomain(normalized.domain);
        if (domain) {
          console.log(`[Discovery] Stage 4: Trying Hunter.io for ${domain}...`);
          try {
            const hunterResult = await hunterDomainSearch(domain);
            if (hunterResult && hunterResult.emails.length > 0) {
              // Pick the highest confidence email
              const bestEmail = hunterResult.emails.sort((a, b) => b.confidence - a.confidence)[0];
              discoveredEmail = bestEmail.value;
              emailSource = 'hunter';
              emailVerified = bestEmail.confidence >= 80;
              stats.emails_from_hunter++;
              allEvidence.push({
                category: 'reachability' as const,
                signal_type: 'email_hunter',
                evidence_text: `Email from Hunter.io (confidence: ${bestEmail.confidence}%): ${discoveredEmail}`
              });
              console.log(`[Discovery]   ✓ Found email via Hunter: ${discoveredEmail} (${bestEmail.confidence}% confidence)`);
            }
          } catch (err) {
            console.warn(`[Discovery]   ✗ Hunter.io lookup failed for ${domain}`);
          }
        }
      }

      // ====================================================================
      // Verify discovered email
      // ====================================================================
      if (discoveredEmail && !emailVerified) {
        const verification = await verifyEmail(discoveredEmail);
        emailVerified = verification.valid;
        if (verification.valid) {
          stats.emails_verified++;
          allEvidence.push({
            category: 'reachability' as const,
            signal_type: 'email_verified',
            evidence_text: `Email verified: ${verification.reason}`
          });
        }
      }

      // Track phone
      if (normalized.phone) {
        stats.phones_found++;
      }

      // ====================================================================
      // Score Calculation
      // ====================================================================
      let score = 30; // Base score
      if (normalized.phone) score += 20;
      if (normalized.domain) score += 10;
      if (discoveredEmail) score += 15;
      if (emailVerified) score += 10;
      if (allEvidence.find(e => e.signal_type === 'no_website')) score += 15; // High value client signal

      let grade = 'C';
      if (score >= 80) grade = 'A';
      else if (score >= 60) grade = 'B';

      // ====================================================================
      // AI Hook Generation
      // ====================================================================
      let aiHook = 'Business needs digital growth support';
      try {
        const hasWebsite = !!normalized.domain;
        const prompt = `Based on this business in ${config.location}: "${normalized.company_name}" (Industry: ${normalized.industry}). ${hasWebsite ? 'They have a website.' : 'They have NO website - this is a huge opportunity.'} Write a very short 2-5 word compelling hook about why they need marketing help. Return valid JSON with key "hook".`;
        const llmResult = await callLLM({
          task: 'Generate short hook for lead.',
          prompt,
          preferredProvider: 'groq'
        });
        if (llmResult?.hook) aiHook = llmResult.hook;
      } catch (e) {
        console.warn('[Discovery] LLM hook generation failed, using fallback.');
      }

      // ====================================================================
      // Insert Lead into Supabase
      // ====================================================================
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .insert({
          company_name: normalized.company_name,
          domain: normalized.domain,
          industry: normalized.industry,
          phone: normalized.phone,
          email: discoveredEmail,
          location: normalized.location,
          status: 'New',
          score_total: score,
          score_grade: grade,
          ai_hook_draft: aiHook,
          opted_out: false
        })
        .select()
        .single();

      if (leadError) {
        console.warn(`[Discovery] Failed to insert lead: ${leadError.message}`);
        continue;
      }

      // Insert evidence/signals
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
      stats.processed++;
      console.log(`[Discovery] ✓ Lead saved: ${lead.company_name} | Phone: ${lead.phone || 'N/A'} | Email: ${discoveredEmail || 'N/A'} (${emailSource})`);
    }

    const duration = Date.now() - startTime;
    console.log(`[Discovery] Pipeline complete in ${duration}ms. Processed ${stats.processed} leads.`);

    return NextResponse.json({
      success: true,
      message: `Discovery complete. Found ${stats.processed} leads with ${stats.phones_found} phone numbers and ${stats.emails_from_website + stats.emails_from_pattern + stats.emails_from_hunter} emails.`,
      leads: results,
      stats: {
        ...stats,
        duration_ms: duration,
        primary_source: primarySource,
      }
    });

  } catch (error: any) {
    console.error('[Discovery] Pipeline failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const GET = POST;
