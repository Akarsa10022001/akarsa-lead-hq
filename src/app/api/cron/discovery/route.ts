import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { GooglePlacesConnector } from '@/lib/connectors/google-places';
import { OSMOverpassConnector } from '@/lib/connectors/osm';
import { FoursquareConnector } from '@/lib/connectors/foursquare';
import { CustomTechConnector } from '@/lib/connectors/tech';
import { WhoisConnector } from '@/lib/connectors/whois';
import { MetaAdLibraryConnector } from '@/lib/connectors/meta';
import { DuckDuckGoLinkedInConnector } from '@/lib/connectors/duckduckgo-linkedin';
import { scrapeWebsiteEmails, extractDomain } from '@/lib/connectors/email-scraper';
import { guessEmails, verifyEmail } from '@/lib/connectors/email-guesser';
import { hunterDomainSearch } from '@/lib/connectors/hunter';
import { callLLM } from '@/lib/llm';
import { enrichLead } from '@/lib/enrichment/scorer';
import { extractAgencySignals } from '@/lib/enrichment/agency-extractor';
import { INDUSTRY_MAP } from '@/lib/connectors/industries';
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
  businessType: string;  // Friendly label from INDUSTRY_MAP
  osmTags?: string[];    // OSM tags for fallback
  maxLeads?: number;
}

const DEFAULT_CONFIG: DiscoveryConfig = {
  location: '', // Will be dynamic
  businessType: 'Digital Marketing Agency',
  osmTags: ['amenity=advertising_agency', 'amenity=marketing_agency', 'office=marketing'],
  maxLeads: parseInt(process.env.SCAN_LIMIT || '20', 10),
};

export async function POST(req: Request) {
  const startTime = Date.now();

  // CRON_SECRET Protection
  const authHeader = req.headers.get('Authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
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
    let config = { ...DEFAULT_CONFIG };
    try {
      const body = await req.json();
      config = { ...config, ...body };
    } catch { /* Use defaults if no body */ }

    // If location is completely blank, pick a random popular area as a fallback for the "Auto" mode
    if (!config.location || config.location.trim() === '') {
      const autoLocations = [
        'Indore, India', 'Mumbai, India', 'Bangalore, India', 'Delhi, India',
        'Dubai, UAE', 'Abu Dhabi, UAE',
        'London, UK', 'Manchester, UK',
        'New York, USA', 'Austin, USA', 'San Francisco, USA',
        'Singapore', 'Sydney, Australia'
      ];
      config.location = autoLocations[Math.floor(Math.random() * autoLocations.length)];
    }

    // Auto-Rotation logic for "Auto"
    let category = config.businessType;
    if (!category || category === 'Auto') {
       const labels = INDUSTRY_MAP.map(i => i.label);
       const { data: allCursors } = await supabase
         .from('discovery_cursor')
         .select('category, is_exhausted')
         .eq('location', config.location);
       
       const exhaustedCategories = new Set(allCursors?.filter(c => c.is_exhausted).map(c => c.category) || []);
       const availableLabels = labels.filter(l => !exhaustedCategories.has(l));
       
       if (availableLabels.length > 0) {
           category = availableLabels[Math.floor(Math.random() * availableLabels.length)];
       } else {
           category = labels[0]; // fallback if all are exhausted
       }
       console.log(`[Discovery] Auto-Rotation selected industry: ${category}`);
    }

    console.log(`[Discovery] Starting pipeline for "${category}" in "${config.location}"...`);

    // ====================================================================
    // STAGE 1: Discover businesses with Pagination Loop
    // ====================================================================
    let rawLeads: any[] = [];
    let primarySource = 'google_places';

    const googleConnector = new GooglePlacesConnector();
    const foursquareConnector = new FoursquareConnector();
    const osmConnector = new OSMOverpassConnector();

    let connector: any = googleConnector;
    if (!process.env.GOOGLE_PLACES_API_KEY) {
      if (process.env.FOURSQUARE_API_KEY) {
        primarySource = 'foursquare';
        connector = foursquareConnector;
      } else {
        primarySource = 'osm_overpass';
        connector = osmConnector;
      }
    }

    let newLeadsFound = 0;
    let pagesFetched = 0;
    const MAX_PAGES = 5;

    // 1. Fetch current cursor state
    const { data: cursorData } = await supabase
      .from('discovery_cursor')
      .select('*')
      .eq('source', primarySource)
      .eq('location', config.location)
      .eq('category', category)
      .maybeSingle();

    let nextToken = cursorData?.next_token || undefined;
    let page = cursorData?.page || 0;
    let exhausted = cursorData?.exhausted || false;

    if (exhausted) {
      return NextResponse.json({
        success: true,
        message: `${config.location} fully scanned from ${primarySource} — try another city, category, or data source.`,
        leads: [],
        stats: { duration_ms: Date.now() - startTime }
      });
    }

    console.log(`[Discovery] Starting loop for ${primarySource}, page: ${page}`);

    while (newLeadsFound < config.maxLeads! && pagesFetched < MAX_PAGES && !exhausted) {
      console.log(`[Discovery] Fetching page with token: ${nextToken}`);
      const searchRes = await connector.search({
        location: config.location,
        type: category,
        limit: config.maxLeads,
        pageToken: primarySource === 'google_places' ? nextToken : undefined,
        cursor: primarySource === 'foursquare' ? nextToken : undefined,
      });

      // searchRes can be an array (for OSM) or { results, nextToken }
      const pageResults = Array.isArray(searchRes) ? searchRes : searchRes.results;
      const newNextToken = Array.isArray(searchRes) ? undefined : searchRes.nextToken;
      
      if (pageResults.length === 0) {
        exhausted = true;
        break;
      }

      pipelineLog.fetched_from_source += pageResults.length;
      pipelineLog.after_location_filter += pageResults.length;

      // Dedupe immediately to see how many NEW leads we got in this page
      for (const record of pageResults) {
        const normalized = connector.normalize(record);
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('company_name', normalized.company_name)
          .eq('location', normalized.location)
          .maybeSingle();

        if (!existingLead) {
          rawLeads.push(record);
          newLeadsFound++;
        }
      }

      pagesFetched++;
      page++;
      nextToken = newNextToken;
      if (!nextToken) exhausted = true;

      // Google requires delay for pagetoken (handled inside connector, but loop safeguard)
      if (newLeadsFound >= config.maxLeads!) break;
    }

    // Save cursor
    await supabase.from('discovery_cursor').upsert({
      source: primarySource,
      location: config.location,
      category: category,
      next_token: nextToken,
      page: page,
      exhausted: exhausted,
      updated_at: new Date().toISOString()
    }, { onConflict: 'source,location,category' });

    if (rawLeads.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No new businesses found in ${config.location} after dedupe.`,
        leads: [],
        stats: { duration_ms: Date.now() - startTime }
      });
    }
    
    // ====================================================================
    // Process each lead through the enrichment pipeline
    // ====================================================================
    // Shuffle the rawLeads so we get different businesses every time we scan the same area
    const shuffledLeads = rawLeads.sort(() => 0.5 - Math.random());
    
    // Process up to maxLeads
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

      // Chain Exclusion
      const CHAIN_KEYWORDS = ['mcdonald', 'starbucks', 'subway', 'burger king', 'kfc', 'domino', 'pizza hut', 'wendy', 'taco bell'];
      const isChain = CHAIN_KEYWORDS.some(k => normalized.company_name.toLowerCase().includes(k));
      if (isChain) {
        console.log(`[Discovery] Skipping chain: ${normalized.company_name}`);
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
      let agency_signals: any = null;

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
          if (scrapeResult.homepage_text) {
            console.log(`[Discovery] Extracting agency signals from website text...`);
            agency_signals = await extractAgencySignals(scrapeResult.homepage_text, normalized.domain);
            if (agency_signals) {
              if (agency_signals.manages_multiple_clients) allEvidence.push({ category: 'budget', signal_type: 'multi_client', evidence_text: `Manages multiple clients: ${agency_signals.manages_multiple_clients}` });
              if (agency_signals.platforms_managed) allEvidence.push({ category: 'budget', signal_type: 'platforms', evidence_text: `Platforms managed: ${agency_signals.platforms_managed}` });
              if (agency_signals.team_size_or_client_count) allEvidence.push({ category: 'budget', signal_type: 'team_size', evidence_text: `Size/Clients: ${agency_signals.team_size_or_client_count}` });
              if (agency_signals.reporting_analytics_offering) allEvidence.push({ category: 'budget', signal_type: 'reporting', evidence_text: `Reporting offering: ${agency_signals.reporting_analytics_offering}` });
            }
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
      // Fetch qualitative signals (Tech Stack, Meta Ads, WHOIS)
      // ====================================================================
      let techStack: string[] = [];
      let domainAgeYears: number | null = null;
      let hasActiveAds: boolean = false;

      if (normalized.domain) {
        // Run in parallel to avoid stalling
        const domainStr = extractDomain(normalized.domain) || normalized.domain;
        const [techRes, whoisRes, metaRes, ddgRes] = await Promise.allSettled([
          new CustomTechConnector().search({ url: normalized.domain }),
          new WhoisConnector().search({ domain: domainStr }),
          new MetaAdLibraryConnector().search({ keyword: normalized.company_name }),
          new DuckDuckGoLinkedInConnector().search({ companyName: normalized.company_name, location: config.location })
        ]);

        if (techRes.status === 'fulfilled' && techRes.value.results.length > 0) {
          techStack = techRes.value.results[0].tech || [];
          const evidence = new CustomTechConnector().getEvidence(techRes.value.results[0]);
          allEvidence.push(...evidence);
        }

        if (whoisRes.status === 'fulfilled' && whoisRes.value.results.length > 0) {
          const evidence = new WhoisConnector().getEvidence(whoisRes.value.results[0]);
          allEvidence.push(...evidence);
          const ageEv = evidence.find(e => e.signal_type === 'domain_age');
          if (ageEv) {
            const match = ageEv.evidence_text.match(/\((\d+) years/);
            if (match) domainAgeYears = parseInt(match[1], 10);
          }
        }

        if (metaRes.status === 'fulfilled' && metaRes.value.results.length > 0) {
          hasActiveAds = metaRes.value.results.some(r => r.ad_active_status === 'ACTIVE');
          if (hasActiveAds) {
            allEvidence.push({
              category: 'budget',
              signal_type: 'active_ads',
              evidence_text: `Currently running active ads on Meta Platforms`
            });
          } else {
            allEvidence.push({
              category: 'gap',
              signal_type: 'no_ads',
              evidence_text: `No active ads found on Meta Platforms`
            });
          }
        }
        
        if (ddgRes.status === 'fulfilled' && ddgRes.value.results.length > 0) {
          const founderName = ddgRes.value.results[0].contact_name;
          if (founderName) {
            normalized.contact_name = founderName;
            allEvidence.push(...new DuckDuckGoLinkedInConnector().getEvidence(ddgRes.value.results[0]));
          }
        }
      }

      // ====================================================================
      // ENRICHMENT & SCORING (New Quality Engine)
      // ====================================================================
      const enriched = await enrichLead({
        company_name: normalized.company_name,
        domain: normalized.domain,
        industry: normalized.industry,
        phone: normalized.phone,
        tech_stack: techStack,
        domain_age_years: domainAgeYears,
        has_active_ads: hasActiveAds,
        email: discoveredEmail,
        location: normalized.location,
        website_status,
        has_website,
        rating: normalized.rating,
        review_count: normalized.review_count,
        contact_name: normalized.contact_name, // If provided by connector
        social_links,
        ...(agency_signals || {})
      }, config.location);

      // THE BOUNCER: Reject if we have absolutely no way to contact
      if (enriched.email_quality === 'none' && !enriched.phone_e164 && !enriched.has_website) {
        console.log(`[Discovery]   ✗ Rejected: ${normalized.company_name} (No contact info or website found)`);
        return;
      }
      
      pipelineLog.after_verification++;

      // ====================================================================
      // AI Hook & Draft Generation
      // ====================================================================
      let aiHook = 'One dashboard for all your clients';
      let fullDraft = '';
      try {
        const evidenceStr = allEvidence.map(e => e.evidence_text).join('; ');
        const prompt = `You are writing a cold outreach message to a Marketing Agency in ${config.location}: "${normalized.company_name}".
Your goal is to pitch "Akarsa One" — a multi-client analytics and reporting dashboard for agencies.
Use ONLY these scraped facts to personalize the message: [${evidenceStr}].
1. Write a hyper-personalized 2-5 word sales hook.
2. Write a short, value-first opening message (max 3 sentences). Mention how Akarsa One provides one dashboard for all their clients' Instagram/YouTube analytics and automated monthly reports.
Return valid JSON with keys "hook" and "message".`;
        const llmResult = await callLLM({
          task: 'Generate hook and draft message for agency lead.',
          prompt,
          preferredProvider: 'groq'
        });
        if (llmResult?.hook) aiHook = llmResult.hook;
        if (llmResult?.message) fullDraft = llmResult.message;
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
          contact_name: enriched.contact_name,
          status: 'New',
          // New Akarsa One Segment & Provenance tracking
          segment: 'marketing_agency',
          sub_type: enriched.industry,
          geo: enriched.location,
          source_url: normalized.source_url || `https://google.com/search?q=${encodeURIComponent(enriched.company_name)}`,
          email_source_url: discoveredEmail ? (emailSource === 'website_scrape' && social_links?.website ? social_links.website : 'https://hunter.io/search/' + enriched.domain) : null,
          phone_source_url: enriched.phone ? normalized.source_url : null,
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
          agency_fit_score: enriched.agency_fit_score || 0,
          contactability_score: enriched.contactability_score || 0,
          score_factors: enriched.score_factors,
          enriched_at: enriched.enriched_at,
          // Legacy fields
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

      // ====================================================================
      // Autonomous Queueing (Phase 2B)
      // ====================================================================
      if (enriched.quality_score >= 50 && fullDraft) {
        const { data: sequence } = await supabase
          .from('outreach_sequences')
          .insert({ lead_id: lead.id, status: 'active' })
          .select()
          .single();
          
        if (sequence) {
          const channel = enriched.phone_e164 ? 'whatsapp' : 'email';
          await supabase.from('outreach_messages').insert({
            sequence_id: sequence.id,
            step_number: 1,
            channel: channel,
            draft_content: fullDraft,
            status: 'ready_to_send'
          });
          console.log(`[Discovery] + Queued for outreach via ${channel}`);
        }
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
