import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import * as cheerio from 'cheerio';
import dns from 'dns/promises';

// --- REAL ENRICHMENT HELPERS ---

const FETCH_TIMEOUT = 5000; // 5s per site
const GENERIC_PREFIXES = /^(info|contact|hello|admin|reservations?|bookings?|groups|sales|enquir|restaurants?|catering|membership|reception|office|team|support|hr|jobs|careers|noreply|no-reply|marketing|press|media|billing|accounts?)@/i;
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Part A: REAL pixel/ad detection from live HTML
async function detectPixelsAndAds(domain: string): Promise<{ has_pixel: boolean; runs_ads: boolean; weak_website: boolean }> {
  const urls = [`https://${domain}`, `https://www.${domain}`, `http://${domain}`];
  let html: string | null = null;

  for (const url of urls) {
    html = await fetchWithTimeout(url);
    if (html) break;
  }

  if (!html) {
    return { has_pixel: false, runs_ads: false, weak_website: true };
  }

  const lower = html.toLowerCase();

  // Detect Meta Pixel (fbevents.js, fbq())
  const hasMetaPixel = lower.includes('fbevents.js') || lower.includes("fbq('init") || lower.includes('fbq("init') || lower.includes('facebook.com/tr?');

  // Detect Google Ads / GA / GTM
  const hasGoogleAds = lower.includes('googleads.g.doubleclick.net') || lower.includes('google_conversion_id') || lower.includes('ads/ga-audiences');
  const hasGTM = lower.includes('googletagmanager.com/gtm.js') || lower.includes('googletagmanager.com/ns.html');
  const hasGA = lower.includes('gtag/js') || lower.includes('google-analytics.com/analytics.js') || lower.includes('ga.js');

  // Detect TikTok Pixel
  const hasTikTok = lower.includes('analytics.tiktok.com') || lower.includes("ttq.load");

  // Detect Snapchat Pixel
  const hasSnapchat = lower.includes('sc-static.net/scevent.min.js');

  const has_pixel = hasMetaPixel || hasGA || hasGTM || hasTikTok || hasSnapchat;
  // runs_ads = true if they have an ad-specific pixel (Meta, Google Ads, TikTok, Snapchat)
  // GA/GTM alone doesn't prove ads, but Meta Pixel / Google Ads tags do
  const runs_ads = hasMetaPixel || hasGoogleAds || hasTikTok || hasSnapchat;

  // weak_website = page is suspiciously short (placeholder/parked domain)
  const weak_website = html.length < 2000;

  return { has_pixel, runs_ads, weak_website };
}

// Part B: REAL owner-email discovery
async function discoverOwnerEmail(
  domain: string,
  contactName: string | null,
  socialLinks: any
): Promise<string | null> {
  const foundEmails: string[] = [];

  // Step 1: Scrape website pages for emails
  const pagePaths = ['', '/about', '/about-us', '/team', '/contact', '/contact-us'];
  for (const path of pagePaths) {
    const urls = [`https://${domain}${path}`, `https://www.${domain}${path}`];
    for (const url of urls) {
      const html = await fetchWithTimeout(url, 3000);
      if (html) {
        const emails = html.match(EMAIL_REGEX) || [];
        foundEmails.push(...emails);
        break; // got HTML from one variant, skip the other
      }
    }
    if (foundEmails.length > 5) break; // enough candidates
  }

  // Step 2: Try Instagram bio scrape
  const igHandle = socialLinks?.instagram;
  if (igHandle && foundEmails.length === 0) {
    const igUrl = `https://www.instagram.com/${igHandle.replace(/^@/, '')}/`;
    const html = await fetchWithTimeout(igUrl, 3000);
    if (html) {
      const emails = html.match(EMAIL_REGEX) || [];
      foundEmails.push(...emails);
    }
  }

  // Filter: remove generic emails, keep only personal/owner emails
  const personalEmails = foundEmails.filter(e => {
    const lower = e.toLowerCase();
    // Skip generic prefixes
    if (GENERIC_PREFIXES.test(lower)) return false;
    // Skip image/file extensions that regex falsely matches
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.svg') || lower.endsWith('.webp')) return false;
    // Skip common false positives
    if (lower.includes('example.com') || lower.includes('sentry.io') || lower.includes('wixpress') || lower.includes('wordpress')) return false;
    return true;
  });

  // Deduplicate
  const unique = [...new Set(personalEmails.map(e => e.toLowerCase()))];

  if (unique.length > 0) {
    return unique[0]; // Return the first non-generic email found
  }

  // Step 3: Domain pattern guess + MX verification
  if (contactName && domain) {
    const cleanDomain = domain.replace(/^www\./, '');
    try {
      const mxRecords = await dns.resolveMx(cleanDomain);
      if (mxRecords && mxRecords.length > 0) {
        // MX exists — the domain can receive email
        const firstName = contactName.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
        if (firstName && firstName.length >= 2) {
          return `${firstName}@${cleanDomain}`;
        }
      }
    } catch {
      // No MX records — domain can't receive email, skip
    }
  }

  return null;
}

// --- MAIN ENRICHMENT CRON ---
export async function GET(request: Request) {
  const startTime = Date.now();
  const MAX_RUNTIME = 8000; // 8s hard cap (leave 2s buffer for Vercel's 10s limit)
  const BATCH_SIZE = 5;

  try {
    // Fetch leads that need enrichment:
    // - Non-disqualified leads where runs_ads is still false (intent signals not checked)
    // - OR disqualified leads with generic/missing email (owner email enrichment)
    const { data: intentLeads, error: e1 } = await supabase
      .from('leads')
      .select('id, company_name, contact_name, domain, industry, geo, social_links, email, is_generic_email, is_disqualified, runs_ads, has_pixel')
      .eq('runs_ads', false)
      .eq('has_pixel', false)
      .not('domain', 'is', null)
      .limit(BATCH_SIZE);

    if (e1) throw e1;

    const results = {
      intent_checked: 0,
      pixels_found: 0,
      ads_found: 0,
      emails_found: 0,
      weak_sites: 0,
      errors: 0,
    };

    if (!intentLeads || intentLeads.length === 0) {
      return NextResponse.json({ success: true, message: 'No leads to enrich.', results });
    }

    for (const lead of intentLeads) {
      // Check if we're running out of time
      if (Date.now() - startTime > MAX_RUNTIME) break;

      try {
        const update: Record<string, any> = {};

        // Part A: Real pixel/ad detection
        if (lead.domain) {
          const signals = await detectPixelsAndAds(lead.domain);
          update.has_pixel = signals.has_pixel;
          update.runs_ads = signals.runs_ads;
          update.weak_website = signals.weak_website;

          if (signals.has_pixel) results.pixels_found++;
          if (signals.runs_ads) results.ads_found++;
          if (signals.weak_website) results.weak_sites++;
          results.intent_checked++;
        }

        // Part B: Owner email enrichment (only if they have a generic/missing email)
        if (!lead.email || lead.is_generic_email) {
          const ownerEmail = await discoverOwnerEmail(
            lead.domain,
            lead.contact_name,
            lead.social_links
          );
          if (ownerEmail) {
            update.email = ownerEmail;
            results.emails_found++;
          }
        }

        // Write the real values to the database
        if (Object.keys(update).length > 0) {
          const { error: updateErr } = await supabase
            .from('leads')
            .update(update)
            .eq('id', lead.id);

          if (updateErr) {
            console.error(`Update error for ${lead.id}:`, updateErr);
            results.errors++;
          }
        }
      } catch (err) {
        console.error(`Enrichment error for lead ${lead.id}:`, err);
        results.errors++;
      }
    }

    return NextResponse.json({
      success: true,
      batch_size: intentLeads.length,
      runtime_ms: Date.now() - startTime,
      results,
    });

  } catch (error: any) {
    console.error('Enrich cron error:', error);
    return NextResponse.json({ error: error.message, runtime_ms: Date.now() - startTime }, { status: 500 });
  }
}
