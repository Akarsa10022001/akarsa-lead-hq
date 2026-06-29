import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { GooglePlacesConnector } from '@/lib/connectors/google-places';
import { OSMOverpassConnector } from '@/lib/connectors/osm';
import { FoursquareConnector } from '@/lib/connectors/foursquare';
import { CustomTechConnector } from '@/lib/connectors/tech';
import { scrapeWebsiteEmails, extractDomain } from '@/lib/connectors/email-scraper';
import { guessEmails, verifyEmail } from '@/lib/connectors/email-guesser';
import { hunterDomainSearch } from '@/lib/connectors/hunter';
import { callLLM } from '@/lib/llm';
import { enrichLead } from '@/lib/enrichment/scorer';
import pLimit from 'p-limit';

/**
 * Discovery Pipeline — 4-Stage Real Contact Data Engine
 * 
 * Stage 1: Google Places API (or OSM fallback) → real businesses with phone, website, rating
 * Stage 2: Website Email Scraper → crawl each website for email addresses
 * Stage 3: Email Pattern Guesser → try common patterns + MX verification
 * Stage 4: Hunter.io (optional fallback) → verified emails from Hunter's database
 */
export const maxDuration = 300; // Maximum allowed on Hobby with Fluid Compute
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DiscoveryConfig {
  location: string;
  businessType: string;  // Google Places type (e.g. 'restaurant', 'beauty_salon')
  osmTags?: string[];    // OSM tags for fallback
  maxLeads?: number;
}

const DEFAULT_CONFIG: DiscoveryConfig = {
  location: '', // Will be dynamic
  businessType: 'restaurant',
  osmTags: ['amenity=restaurant', 'amenity=cafe'],
  maxLeads: parseInt(process.env.SCAN_LIMIT || '20', 10),
};

export async function POST(req: Request) {
  const startTime = Date.now();
  
  // Debug log counts
  const pipelineLog = {
    fetched_from_source: 0,
    after_location_filter: 0,
    after_verification: 0,
    after_dedupe: 0,
    inserted_to_db: 0
  };

  try {
    // Allow config override from request body
    let config = DEFAULT_CONFIG;
    try {
      const body = await req.json();
      if (body.location) config = { ...config, ...body };
      if (body.limit) config.maxLeads = body.limit;
    } catch { /* Use defaults if no body */ }

    // If location is completely blank, pick a random popular area as a fallback for the "Auto" mode
    if (!config.location || config.location.trim() === '') {
      const autoLocations = ['Dubai, UAE', 'Pune, India', 'Indore, India', 'Mumbai, India', 'London, UK'];
      config.location = autoLocations[Math.floor(Math.random() * autoLocations.length)];
    }

    console.log(`[Discovery] Starting pipeline for "${config.businessType}" in "${config.location}"...`);

    // ====================================================================
    // STAGE 1: Discover businesses (Google Places primary, OSM fallback)
    // ====================================================================
    let rawLeads: any[] = [];
    let primarySource = 'google_places';

    const googleConnector = new GooglePlacesConnector();
    const foursquareConnector = new FoursquareConnector();
    const osmConnector = new OSMOverpassConnector();

    // Try Google Places first
    if (process.env.GOOGLE_PLACES_API_KEY) {
      console.log('[Discovery] Stage 1: Using Google Places API...');
      rawLeads = await googleConnector.search({
        location: config.location,
        type: config.businessType,
        limit: config.maxLeads,
      });
      console.log(`[Discovery] Google Places returned ${rawLeads.length} results.`);
    }

    // Fallback to Foursquare if Google Places returned nothing
    if (rawLeads.length === 0 && process.env.FOURSQUARE_API_KEY) {
      console.log('[Discovery] Stage 1: Falling back to Foursquare API...');
      primarySource = 'foursquare';
      
      console.log(`[route] config.maxLeads = ${config.maxLeads}`);
      console.log(`[route] passing limit to connector = ${config.maxLeads}`);
      
      rawLeads = await foursquareConnector.search({
        location: config.location,
        type: config.businessType,
        limit: config.maxLeads,
      });
      console.log(`[Discovery] Foursquare returned ${rawLeads.length} results.`);
    }

    // Fallback to OSM if Foursquare returned nothing or isn't configured
    if (rawLeads.length === 0) {
      console.log('[Discovery] Stage 1: Falling back to OSM Nominatim...');
      primarySource = 'osm_overpass';
      rawLeads = await osmConnector.search({
        location: config.location,
        tags: config.osmTags || ['amenity=restaurant'],
        limit: config.maxLeads,
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
    
    pipelineLog.fetched_from_source = rawLeads.length;
    pipelineLog.after_location_filter = rawLeads.length; // Same since the API handles location

    // ====================================================================
    // Process each lead through the enrichment pipeline
    // ====================================================================
    // Shuffle the rawLeads so we get different businesses every time we scan the same area
    const shuffledLeads = rawLeads.sort(() => 0.5 - Math.random());
    
    // Process up to 20 leads (p-limit prevents rate limits)
    const leadsToProcess = shuffledLeads.slice(0, config.maxLeads || 20);
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

    // Process with bounded concurrency (4) to prevent Groq API 429 Too Many Requests
    const limit = pLimit(4);

    const settled = await Promise.allSettled(leadsToProcess.map((rawRecord) => limit(async () => {
      // Normalize the raw data
      let connector = googleConnector;
      if (primarySource === 'foursquare') connector = foursquareConnector as any;
      if (primarySource === 'osm_overpass') connector = osmConnector as any;
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
        return;
      }
      
      pipelineLog.after_dedupe++;

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
        return;
      }

      // ====================================================================
      // STAGE 2: Website Email Scraping
      // ====================================================================
      let discoveredEmail: string | null = null;
      let emailSource = 'none';
      let emailVerified = false;
      const allEvidence = [...normalized.evidence];

      let website_status = 'none';
      let social_links = null;
      let has_website = false;

      if (normalized.domain) {
        has_website = true;
        console.log(`[Discovery] Stage 2: Scraping emails from ${normalized.domain}...`);
        try {
          const scrapeResult = await scrapeWebsiteEmails(normalized.domain);
          website_status = scrapeResult.website_status;
          social_links = scrapeResult.social_links;
          
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
      // ENRICHMENT & SCORING (New Quality Engine)
      // ====================================================================
      const enriched = await enrichLead({
        company_name: normalized.company_name,
        domain: normalized.domain,
        industry: normalized.industry,
        phone: normalized.phone,
        email: discoveredEmail,
        location: normalized.location,
        website_status,
        has_website,
        rating: normalized.rating,
        review_count: normalized.review_count,
        contact_name: normalized.contact_name, // If provided by connector
        social_links
      }, config.location);

      // THE BOUNCER: Reject if we have absolutely no way to contact
      if (enriched.email_quality === 'none' && !enriched.phone_e164 && !enriched.has_website) {
        console.log(`[Discovery]   ✗ Rejected: ${normalized.company_name} (No contact info or website found)`);
        return;
      }
      
      pipelineLog.after_verification++;

      // ====================================================================
      // AI Hook Generation
      // ====================================================================
      let aiHook = 'Business needs digital growth support';
      try {
        const hasWebsite = !!normalized.domain;
        const prompt = `Based on this business in ${config.location}: "${normalized.company_name}" (Industry: ${normalized.industry}). ${hasWebsite ? 'They have a website.' : 'They have NO website - this is a huge opportunity.'} Write a hyper-personalized 2-5 word sales hook. DO NOT use generic phrases like "Boost Local Visibility" or "Increase Sales". Instead, reference their specific name, industry, or offline dominance. Return valid JSON with key "hook".`;
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
          company_name: enriched.company_name,
          domain: enriched.domain,
          industry: enriched.industry,
          phone: enriched.phone,
          email: enriched.email,
          location: enriched.location,
          status: 'New',
          // New enriched fields
          email_verified: enriched.email_verified,
          email_quality: enriched.email_quality,
          phone_e164: enriched.phone_e164,
          website_status: enriched.website_status,
          has_website: enriched.has_website,
          rating: enriched.rating,
          review_count: enriched.review_count,
          social_links: enriched.social_links,
          quality_score: enriched.quality_score,
          score_factors: enriched.score_factors,
          enriched_at: enriched.enriched_at,
          // Legacy fields (could potentially be dropped in a real refactor)
          score_total: enriched.quality_score,
          score_grade: enriched.quality_score >= 80 ? 'A' : (enriched.quality_score >= 65 ? 'B' : 'C'),
          ai_hook_draft: aiHook,
          opted_out: false
        })
        .select()
        .single();

      if (leadError) {
        console.warn(`[Discovery] Failed to insert lead: ${leadError.message}`);
        return;
      }
      
      pipelineLog.inserted_to_db++;

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
    })));

    // Extract successfully fulfilled promises
    for (const s of settled) {
      if (s.status === 'rejected') {
        console.error('[Discovery] Lead processing crashed:', s.reason);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Discovery] Pipeline complete in ${duration}ms. Processed ${results.length} leads.`);
    console.log(`[Discovery] Stage Log: fetched(${pipelineLog.fetched_from_source}) -> after_loc(${pipelineLog.after_location_filter}) -> after_dedupe(${pipelineLog.after_dedupe}) -> after_verify(${pipelineLog.after_verification}) -> db_insert(${pipelineLog.inserted_to_db})`);

    return NextResponse.json({
      success: true,
      message: `Pipeline finished. Saved ${results.length} new leads.`,
      leads: results,
      stats: { ...stats, duration_ms: duration },
      pipeline_log: pipelineLog
    });

  } catch (error: any) {
    console.error('[Discovery] Pipeline failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const GET = POST;
