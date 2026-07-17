import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import * as cheerio from 'cheerio';
import dns from 'dns/promises';

// --- REAL ENRICHMENT HELPERS ---

const FETCH_TIMEOUT = 5000; // 5s per site
const GENERIC_PREFIXES = /^(info|contact|hello|admin|reservations?|bookings?|groups|sales|enquir|restaurants?|catering|membership|reception|office|team|support|hr|jobs|careers|noreply|no-reply|marketing|press|media|billing|accounts?)@/i;
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// CRITICAL FIX: The `domain` column stores full URLs like "https://example.com/path"
// We must normalize to bare "example.com" before any fetch or DNS operation.
function normalizeDomain(raw: string): string {
  let d = raw.trim();
  // Strip protocol
  d = d.replace(/^https?:\/\//, '');
  // Strip www.
  d = d.replace(/^www\./, '');
  // Strip trailing path, query, hash
  d = d.split('/')[0];
  d = d.split('?')[0];
  d = d.split('#')[0];
  // Strip trailing dot
  d = d.replace(/\.$/, '');
  return d.toLowerCase();
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
async function detectPixelsAndAds(bareDomain: string): Promise<{ has_pixel: boolean; runs_ads: boolean; weak_website: boolean }> {
  // Try fetching the actual site with properly formed URLs
  const urls = [
    `https://${bareDomain}`,
    `https://www.${bareDomain}`,
    `http://${bareDomain}`,
  ];
  let html: string | null = null;

  for (const url of urls) {
    html = await fetchWithTimeout(url);
    if (html && html.length > 500) break; // got real content
  }

  if (!html || html.length < 500) {
    return { has_pixel: false, runs_ads: false, weak_website: true };
  }

  const lower = html.toLowerCase();

  // Detect Meta Pixel (fbevents.js, fbq())
  const hasMetaPixel =
    lower.includes('fbevents.js') ||
    lower.includes("fbq('init") ||
    lower.includes('fbq("init') ||
    lower.includes('facebook.com/tr?') ||
    lower.includes('connect.facebook.net');

  // Detect Google Ads conversion / remarketing tags
  const hasGoogleAds =
    lower.includes('googleads.g.doubleclick.net') ||
    lower.includes('google_conversion_id') ||
    lower.includes('ads/ga-audiences') ||
    lower.includes('google_remarketing') ||
    lower.includes('adwords.google.com');

  // Detect Google Tag Manager
  const hasGTM = lower.includes('googletagmanager.com/gtm.js') || lower.includes('googletagmanager.com/ns.html');

  // Detect Google Analytics
  const hasGA =
    lower.includes('gtag/js') ||
    lower.includes('google-analytics.com/analytics.js') ||
    lower.includes('google-analytics.com/ga.js') ||
    lower.includes("gtag('config'") ||
    lower.includes('gtag("config"');

  // Detect TikTok Pixel
  const hasTikTok = lower.includes('analytics.tiktok.com') || lower.includes("ttq.load");

  // Detect Snapchat Pixel
  const hasSnapchat = lower.includes('sc-static.net/scevent.min.js');

  // Detect LinkedIn Insight Tag
  const hasLinkedIn = lower.includes('snap.licdn.com/li.lms-analytics');

  // has_pixel = ANY tracking tag present (GA, GTM, Meta, etc.)
  const has_pixel = hasMetaPixel || hasGA || hasGTM || hasTikTok || hasSnapchat || hasLinkedIn || hasGoogleAds;

  // runs_ads = evidence of PAID advertising (Meta Pixel, Google Ads conversion, TikTok, Snapchat)
  // GA/GTM alone = analytics, not necessarily ads
  const runs_ads = hasMetaPixel || hasGoogleAds || hasTikTok || hasSnapchat || hasLinkedIn;

  // weak_website = very short page (parked domain or placeholder)
  const weak_website = html.length < 3000;

  return { has_pixel, runs_ads, weak_website };
}

// Part B: REAL owner-email discovery
async function discoverOwnerEmail(
  bareDomain: string,
  contactName: string | null,
  socialLinks: any
): Promise<string | null> {
  const foundEmails: string[] = [];

  // Step 1: Scrape website pages for emails
  const pagePaths = ['', '/about', '/about-us', '/team', '/contact', '/contact-us'];
  for (const path of pagePaths) {
    const url = `https://${bareDomain}${path}`;
    const html = await fetchWithTimeout(url, 3000);
    if (html) {
      const emails = html.match(EMAIL_REGEX) || [];
      foundEmails.push(...emails);
    }
    if (foundEmails.length > 5) break; // enough candidates
  }

  // Also try www. variant if nothing found
  if (foundEmails.length === 0) {
    const html = await fetchWithTimeout(`https://www.${bareDomain}`, 3000);
    if (html) {
      const emails = html.match(EMAIL_REGEX) || [];
      foundEmails.push(...emails);
    }
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
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.svg') || lower.endsWith('.webp') || lower.endsWith('.gif')) return false;
    // Skip common false positives from JS/CSS
    if (lower.includes('example.com') || lower.includes('sentry.io') || lower.includes('wixpress') || lower.includes('wordpress') || lower.includes('w3.org') || lower.includes('schema.org') || lower.includes('googleapis.com')) return false;
    return true;
  });

  // Deduplicate
  const unique = [...new Set(personalEmails.map(e => e.toLowerCase()))];

  if (unique.length > 0) {
    return unique[0]; // Return the first non-generic email found
  }

  // Step 3: Domain pattern guess + MX verification
  if (contactName && bareDomain) {
    try {
      const mxRecords = await dns.resolveMx(bareDomain);
      if (mxRecords && mxRecords.length > 0) {
        // MX exists — the domain can receive email
        const firstName = contactName.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
        if (firstName && firstName.length >= 2) {
          return `${firstName}@${bareDomain}`;
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

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'intent'; // 'intent' or 'email'

  try {
    const results = {
      intent_checked: 0,
      pixels_found: 0,
      ads_found: 0,
      emails_found: 0,
      weak_sites: 0,
      errors: 0,
      domains_processed: [] as string[],
    };

    if (mode === 'intent') {
      // PASS 1: Intent signal enrichment for non-disqualified leads
      const { data: intentLeads, error: e1 } = await supabase
        .from('leads')
        .select('id, company_name, contact_name, domain, industry, geo, social_links, email, is_generic_email, is_disqualified, runs_ads, has_pixel')
        .eq('is_disqualified', false)
        .eq('runs_ads', false)
        .eq('has_pixel', false)
        .not('domain', 'is', null)
        .limit(BATCH_SIZE);

      if (e1) throw e1;

      if (!intentLeads || intentLeads.length === 0) {
        return NextResponse.json({ success: true, mode, message: 'No leads to enrich.', results });
      }

      for (const lead of intentLeads) {
        if (Date.now() - startTime > MAX_RUNTIME) break;

        try {
          const bareDomain = normalizeDomain(lead.domain);
          results.domains_processed.push(bareDomain);

          const update: Record<string, any> = {};
          const signals = await detectPixelsAndAds(bareDomain);
          update.has_pixel = signals.has_pixel;
          update.runs_ads = signals.runs_ads;
          update.weak_website = signals.weak_website;

          if (signals.has_pixel) results.pixels_found++;
          if (signals.runs_ads) results.ads_found++;
          if (signals.weak_website) results.weak_sites++;
          results.intent_checked++;

          // Also try email enrichment if this lead has a generic/missing email
          if (!lead.email || lead.is_generic_email) {
            const ownerEmail = await discoverOwnerEmail(bareDomain, lead.contact_name, lead.social_links);
            if (ownerEmail) {
              update.email = ownerEmail;
              results.emails_found++;
            }
          }

          if (Object.keys(update).length > 0) {
            const { error: updateErr } = await supabase.from('leads').update(update).eq('id', lead.id);
            if (updateErr) results.errors++;
          }
        } catch {
          results.errors++;
        }
      }

    } else if (mode === 'email') {
      // PASS 2: Owner-email recovery for DISQUALIFIED leads
      // These are the ~522 with generic emails + ~186 with no email.
      // If we find a real owner email, is_disqualified will auto-flip to false.
      const { data: emailLeads, error: e2 } = await supabase
        .from('leads')
        .select('id, company_name, contact_name, domain, industry, geo, social_links, email, is_generic_email, is_disqualified')
        .eq('is_disqualified', true)
        .not('domain', 'is', null)
        .or('email.is.null,is_generic_email.eq.true')
        .limit(BATCH_SIZE);

      if (e2) throw e2;

      if (!emailLeads || emailLeads.length === 0) {
        return NextResponse.json({ success: true, mode, message: 'No disqualified leads with recoverable email.', results });
      }

      for (const lead of emailLeads) {
        if (Date.now() - startTime > MAX_RUNTIME) break;

        try {
          const bareDomain = normalizeDomain(lead.domain);
          results.domains_processed.push(bareDomain);

          const ownerEmail = await discoverOwnerEmail(bareDomain, lead.contact_name, lead.social_links);
          if (ownerEmail) {
            const { error: updateErr } = await supabase
              .from('leads')
              .update({ email: ownerEmail })
              .eq('id', lead.id);
            if (!updateErr) results.emails_found++;
            else results.errors++;
          }
          results.intent_checked++;
        } catch {
          results.errors++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      mode,
      runtime_ms: Date.now() - startTime,
      results,
    });

  } catch (error: any) {
    console.error('Enrich cron error:', error);
    return NextResponse.json({ error: error.message, runtime_ms: Date.now() - startTime }, { status: 500 });
  }
}

