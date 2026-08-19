/**
 * GitHub Actions Self-Hosted Lead Mining Engine
 * 
 * Powered by Playwright Chromium + Google X-Ray Index Mining.
 * Evaluates discovered prospects with the 5-dimension Akarsa Lead Scorer.
 * Automatically inserts Grade A/B leads into Supabase `leads` table.
 */

import { chromium, Browser, Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { scoreInstagramLead, LeadScore } from '../src/lib/instagram/lead-scorer';

// ── Supabase Client Setup ──────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';
const supabase = createClient(supabaseUrl, supabaseKey);

// ── CLI / Env Argument Parser ──────────────────────────────────────────────
interface MinerConfig {
  targets: string[];
  keywords: string[];
  maxLeads: number;
  dryRun: boolean;
}

function parseArgs(): MinerConfig {
  const args = process.argv.slice(2);
  let targetsStr = process.env.TARGETS || '';
  let keywordsStr = process.env.KEYWORDS || '';
  let maxLeads = parseInt(process.env.MAX_LEADS || '50', 10);
  let dryRun = process.env.DRY_RUN === 'true';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--targets' && args[i + 1]) {
      targetsStr = args[++i];
    } else if (args[i] === '--keywords' && args[i + 1]) {
      keywordsStr = args[++i];
    } else if (args[i] === '--limit' && args[i + 1]) {
      maxLeads = parseInt(args[++i], 10);
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  // Defaults if nothing provided
  const targets = targetsStr
    .split(/[\n,]+/)
    .map(t => t.trim().replace(/^@/, '').replace(/https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, ''))
    .filter(Boolean);

  const keywords = keywordsStr
    .split(/[\n,]+/)
    .map(k => k.trim())
    .filter(Boolean);

  // Fallback defaults for automated nightly runs if no parameters supplied
  if (targets.length === 0 && keywords.length === 0) {
    keywords.push('architects', 'interior designers', 'boutique hotels', 'luxury cafes');
  }

  return { targets, keywords, maxLeads, dryRun };
}

// ── Regex Contact Extraction Helpers ─────────────────────────────────────────
function extractContacts(text: string) {
  const emailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = text.match(/(?:\+|00)?[0-9\s\-().]{9,18}(?=\s|$|[\n,|📞☎️📱])/);
  const waMatch = text.match(/(?:wa\.me\/|whatsapp[:\s]+)[\+\d]{7,15}/i);

  return {
    email: emailMatch ? emailMatch[0].toLowerCase() : null,
    phone: phoneMatch ? phoneMatch[0].replace(/[\s\-().]/g, '').trim() : null,
    whatsapp: waMatch ? waMatch[0].replace(/(?:wa\.me\/|whatsapp[:\s]+)/i, '+') : null,
  };
}

interface DiscoveredLead {
  username: string;
  fullName: string;
  biography: string;
  category: string | null;
  externalUrl: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  followerCount: number;
  location: string | null;
  hasMetaPixel: boolean;
  hasGoogleAnalytics: boolean;
  isBusinessAccount: boolean;
  profilePicUrl: string | null;
  verified: boolean;
  postCount: number;
  source: string;
  igUrl: string;
  scoreData?: LeadScore;
}

// ── Method 1: Resilient Multi-Engine X-Ray Search for Instagram Leads ────────
async function mineGoogleXRay(page: Page, keywords: string[], limit: number): Promise<DiscoveredLead[]> {
  console.log(`\n🔍 [X-Ray Engine] Searching web index for Instagram business bios...`);
  const leads: DiscoveredLead[] = [];
  const seenUsernames = new Set<string>();

  for (const keyword of keywords) {
    if (leads.length >= limit) break;

    const query = `site:instagram.com "${keyword}" ("@gmail.com" OR "@yahoo.com" OR "contact@" OR "wa.me" OR "+91" OR "+44" OR "+1")`;
    console.log(`📡 Querying keyword: "${keyword}"`);

    // We try DuckDuckGo HTML first (100% CAPTCHA-free on cloud runners), then Bing & Google
    const searchEngines = [
      {
        name: 'DuckDuckGo',
        url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        selector: '.result',
        linkSelector: '.result__url, a.result__snippet',
        titleSelector: '.result__title',
        snippetSelector: '.result__snippet',
      },
      {
        name: 'Bing',
        url: `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=30`,
        selector: '#b_results .b_algo',
        linkSelector: 'h2 a',
        titleSelector: 'h2',
        snippetSelector: '.b_caption p, .b_algoSlug',
      },
      {
        name: 'Google',
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}&num=30`,
        selector: '#search .g, [data-sokoban-container]',
        linkSelector: 'a',
        titleSelector: 'h3',
        snippetSelector: 'div, span',
      },
    ];

    for (const engine of searchEngines) {
      if (leads.length >= limit) break;
      try {
        console.log(`   Trying ${engine.name}...`);
        await page.goto(engine.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(2000);

        const results = await page.$$eval(engine.selector, (elements, selectors) => {
          return elements.map(el => {
            const linkEl = el.querySelector(selectors.linkSelector);
            const link = (linkEl?.getAttribute('href') || (el as any).href || '').trim();
            const title = (el.querySelector(selectors.titleSelector)?.textContent || '').trim();
            const snippet = (el.querySelector(selectors.snippetSelector)?.textContent || el.textContent || '').trim();
            return { link, title, snippet };
          });
        }, { linkSelector: engine.linkSelector, titleSelector: engine.titleSelector, snippetSelector: engine.snippetSelector });

        console.log(`   [${engine.name}] Extracted ${results.length} search entries`);

        for (const res of results) {
          if (leads.length >= limit) break;
          // Decode URL if it's a DuckDuckGo redirect link (e.g. //duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.instagram.com%2F...)
          let rawUrl = res.link;
          if (rawUrl.includes('uddg=')) {
            const matchUddg = rawUrl.match(/uddg=([^&]+)/);
            if (matchUddg) rawUrl = decodeURIComponent(matchUddg[1]);
          }

          const match = rawUrl.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
          if (!match) continue;

          const username = match[1].toLowerCase();
          if (['p', 'explore', 'stories', 'reels', 'direct', 'accounts', 'legal', 'tags', 'about'].includes(username)) continue;
          if (seenUsernames.has(username)) continue;
          seenUsernames.add(username);

          const fullBioText = (res.title + ' ' + res.snippet).replace(/[\r\n]+/g, ' ');
          const contacts = extractContacts(fullBioText);
          const fullName = res.title.split('•')[0]?.replace(/\(@[^)]+\)/, '').replace(/Instagram/i, '').replace(/[-|]/g, '').trim() || username;

          const lead: DiscoveredLead = {
            username,
            fullName,
            biography: res.snippet.slice(0, 350),
            category: keyword,
            externalUrl: null,
            email: contacts.email,
            phone: contacts.phone,
            whatsapp: contacts.whatsapp,
            followerCount: 0,
            location: null,
            hasMetaPixel: false,
            hasGoogleAnalytics: false,
            isBusinessAccount: true,
            profilePicUrl: null,
            verified: false,
            postCount: 10,
            source: `${engine.name} X-Ray (${keyword})`,
            igUrl: `https://instagram.com/${username}`,
          };

          lead.scoreData = scoreInstagramLead(lead);

          if (lead.scoreData.isGoodTarget) {
            leads.push(lead);
            console.log(`   ✨ [${lead.scoreData.grade}${lead.scoreData.total}] @${username} — ${fullName} (${contacts.email || contacts.phone || contacts.whatsapp || 'Bio Match'})`);
          } else {
            console.log(`   ⏭  [@${username} skipped: ${lead.scoreData.label}]`);
          }
        }

        // If we got results from this engine, we don't need to query the other engines for this keyword
        if (results.length > 0) break;

      } catch (err: any) {
        console.warn(`   ⚠️ ${engine.name} search error for "${keyword}":`, err.message);
      }

      await page.waitForTimeout(1500);
    }

    await page.waitForTimeout(2000);
  }

  return leads;
}

// ── Method 2: Public Instagram Direct Scraper via Playwright ─────────────────
async function mineInstagramTargets(page: Page, targets: string[], limit: number): Promise<DiscoveredLead[]> {
  console.log(`\n📸 [Instagram Engine] Inspecting ${targets.length} target accounts...`);
  const leads: DiscoveredLead[] = [];

  for (const target of targets) {
    if (leads.length >= limit) break;
    const url = `https://www.instagram.com/${target}/`;
    console.log(`🎯 Navigating to @${target}...`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3500);

      // Extract metadata from OpenGraph and page JSON
      const pageData = await page.evaluate(() => {
        const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
        const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
        const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
        const bodyText = document.body.innerText || '';

        // Extract follower numbers from og:description (e.g., "4,430 Followers, 2,444 Following, 1,013 Posts")
        const followerMatch = ogDesc.match(/([\d,KkMm.]+)\s*Followers/i);
        const postMatch = ogDesc.match(/([\d,KkMm.]+)\s*Posts/i);

        return { ogTitle, ogDesc, ogImage, bodyText, followerStr: followerMatch ? followerMatch[1] : '0', postStr: postMatch ? postMatch[1] : '0' };
      });

      const contacts = extractContacts(pageData.ogDesc + ' ' + pageData.bodyText);
      const cleanName = pageData.ogTitle.split('(')[0]?.replace(/•.*$/, '').trim() || target;

      const parseFollowers = (str: string): number => {
        const s = str.replace(/,/g, '').toLowerCase();
        if (s.endsWith('k')) return parseFloat(s) * 1000;
        if (s.endsWith('m')) return parseFloat(s) * 1000000;
        return parseInt(s, 10) || 0;
      };

      const lead: DiscoveredLead = {
        username: target,
        fullName: cleanName,
        biography: pageData.ogDesc || pageData.bodyText.slice(0, 300),
        category: null,
        externalUrl: null,
        email: contacts.email,
        phone: contacts.phone,
        whatsapp: contacts.whatsapp,
        followerCount: parseFollowers(pageData.followerStr),
        location: null,
        hasMetaPixel: false,
        hasGoogleAnalytics: false,
        isBusinessAccount: true,
        profilePicUrl: pageData.ogImage || null,
        verified: false,
        postCount: parseFollowers(pageData.postStr),
        source: 'Target Account Inspection',
        igUrl: `https://instagram.com/${target}`,
      };

      lead.scoreData = scoreInstagramLead(lead);

      if (lead.scoreData.isGoodTarget) {
        leads.push(lead);
        console.log(`   ✨ [${lead.scoreData.grade}${lead.scoreData.total}] @${target} — ${cleanName} (${lead.scoreData.label})`);
      } else {
        console.log(`   ⏭  [@${target} scored ${lead.scoreData.total}: ${lead.scoreData.label}]`);
      }
    } catch (err: any) {
      console.warn(`   ⚠️ Could not inspect @${target}:`, err.message);
    }

    await page.waitForTimeout(2000 + Math.random() * 2000);
  }

  return leads;
}

// ── Database Insertion ───────────────────────────────────────────────────────
async function saveLeadsToSupabase(leads: DiscoveredLead[], dryRun: boolean) {
  if (leads.length === 0) {
    console.log(`\n⚠️ No Grade A/B leads to save.`);
    return;
  }

  console.log(`\n💾 Preparing to save ${leads.length} qualified leads to Supabase...`);

  if (dryRun) {
    console.log(`ℹ️ [Dry Run Mode] Skipping database write.`);
    return;
  }

  const rows = leads.map(l => ({
    company_name: l.fullName || l.username,
    email: l.email,
    phone: l.phone,
    domain: l.externalUrl,
    industry: l.category || 'Social Media / Instagram',
    location: l.location,
    status: 'New',
    source_url: l.igUrl,
    social_links: { instagram: l.igUrl, whatsapp: l.whatsapp },
    score_factors: {
      instagram: {
        username: l.username,
        followerCount: l.followerCount,
        biography: l.biography,
        source: l.source,
        score: l.scoreData?.total,
        grade: l.scoreData?.grade,
        reasons: l.scoreData?.reasons,
      },
    },
    runs_ads: false,
    has_pixel: false,
    is_test: false,
  }));

  try {
    const { data, error } = await supabase
      .from('leads')
      .insert(rows)
      .select('id');

    if (error) {
      console.error(`❌ Supabase Insert Error:`, error.message);
    } else {
      console.log(`✅ Successfully saved ${data?.length || 0} leads to Supabase Lead Radar!`);
    }
  } catch (err: any) {
    console.error(`❌ Database Exception:`, err.message);
  }
}

// ── Main Runner ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`=======================================================`);
  console.log(`   🚀 AKARSA LEAD HQ — GITHUB ACTIONS MINER ENGINE     `);
  console.log(`=======================================================`);

  const config = parseArgs();
  console.log(`⚙️ Config:`, {
    targetsCount: config.targets.length,
    keywordsCount: config.keywords.length,
    maxLeads: config.maxLeads,
    dryRun: config.dryRun,
  });

  const browser: Browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  const allLeads: DiscoveredLead[] = [];

  try {
    // 1. Run Direct Instagram Inspection if targets specified
    if (config.targets.length > 0) {
      const targetLeads = await mineInstagramTargets(page, config.targets, config.maxLeads);
      allLeads.push(...targetLeads);
    }

    // 2. Run Google X-Ray search if keywords specified or need more leads
    if (config.keywords.length > 0 && allLeads.length < config.maxLeads) {
      const remainingLimit = config.maxLeads - allLeads.length;
      const xRayLeads = await mineGoogleXRay(page, config.keywords, remainingLimit);
      allLeads.push(...xRayLeads);
    }

    // 3. Output Summary & Save
    console.log(`\n=======================================================`);
    console.log(`🎯 MINING SUMMARY`);
    console.log(`   Total Qualified (Grade A/B) Leads: ${allLeads.length}`);
    console.log(`   With Email: ${allLeads.filter(l => l.email).length}`);
    console.log(`   With Phone / WA: ${allLeads.filter(l => l.phone || l.whatsapp).length}`);
    console.log(`=======================================================`);

    await saveLeadsToSupabase(allLeads, config.dryRun);

  } catch (err: any) {
    console.error(`💥 Fatal error during mining execution:`, err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    console.log(`🏁 Engine finished cleanly.`);
  }
}

main();
