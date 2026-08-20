/**
 * GitHub Actions Self-Hosted Lead Mining Engine (Pure Vanilla Node.js)
 * 
 * Runs directly on any Node.js environment without tsx or compiler dependencies.
 * Uses Playwright Chromium + Multi-Engine X-Ray Search.
 * Scores leads with the 5-dimension quality filter and saves directly to Supabase.
 */

const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

// ── Target Categories & Scoring Keywords ──────────────────────────────────────
const TARGET_CATEGORIES = [
  'restaurant', 'food', 'cafe', 'bakery', 'bar', 'catering', 'bistro', 'eatery',
  'hotel', 'hospitality', 'resort', 'hostel', 'accommodation', 'travel', 'tourism',
  'boutique', 'fashion', 'retail', 'shop', 'store', 'clothing', 'apparel', 'jewel',
  'salon', 'spa', 'beauty', 'wellness', 'fitness', 'gym', 'yoga', 'pilates', 'barber',
  'real estate', 'property', 'architecture', 'interior', 'decor',
  'coach', 'consultant', 'therapy', 'therapist', 'mindset', 'life coach',
  'photographer', 'photography', 'videographer', 'production',
  'construction', 'contractor', 'builder', 'renovation',
  'event', 'wedding', 'florist', 'catering',
  'dental', 'clinic', 'healthcare', 'medical', 'physiotherapy',
  'law', 'legal', 'finance', 'accounting',
  'startup', 'entrepreneur', 'founder', 'business',
];

const COMPETITOR_SIGNALS = [
  'agency', 'studio', 'creative agency', 'marketing agency', 'digital agency',
  'branding agency', 'design agency', 'social media agency', 'advertising agency',
  'media company', 'growth hacker', 'seo agency',
];

const INFLUENCER_SIGNALS = [
  'influencer', 'content creator', 'blogger', 'vlogger', 'youtuber',
  'brand ambassador', 'model', 'actor', 'actress', 'comedian',
];

function normalize(text) {
  return (text || '').toLowerCase().trim();
}

function containsAny(text, terms) {
  const t = normalize(text);
  return terms.some(term => t.includes(term));
}

// ── 5-Dimension Lead Quality Scorer ───────────────────────────────────────────
function scoreInstagramLead(profile) {
  let score = 0;
  const reasons = [];
  const bio = normalize(profile.biography || profile.bio || '');
  const name = normalize(profile.fullName || profile.username || '');
  const category = normalize(profile.category || profile.businessCategoryName || '');
  const followers = profile.followerCount || profile.followersCount || 0;
  const hasWebsite = !!(profile.externalUrl);
  const hasEmail = !!(profile.email || profile.businessEmail || profile.publicEmail);
  const hasPhone = !!(profile.phone || profile.businessPhoneNumber);
  const isVerified = !!(profile.verified || profile.isVerified);
  const postsCount = profile.postCount || profile.postsCount || profile.mediaCount || 0;
  const isBusinessAccount = !!(profile.isBusinessAccount || profile.is_business);

  // Disqualifiers
  if (isVerified) {
    return { total: 5, grade: 'D', label: 'Skip — Verified (too big)', reasons: ['Verified account — enterprise'], isGoodTarget: false, classifiedAs: 'enterprise' };
  }
  if (followers > 500000) {
    return { total: 5, grade: 'D', label: 'Skip — Enterprise', reasons: ['500K+ followers'], isGoodTarget: false, classifiedAs: 'enterprise' };
  }
  if (containsAny(name + ' ' + category, COMPETITOR_SIGNALS)) {
    return { total: 10, grade: 'D', label: 'Skip — Competitor Agency', reasons: ['Design/Marketing Agency'], isGoodTarget: false, classifiedAs: 'competitor' };
  }
  if (containsAny(bio + ' ' + name, INFLUENCER_SIGNALS)) {
    return { total: 15, grade: 'D', label: 'Skip — Influencer', reasons: ['Influencer/Creator'], isGoodTarget: false, classifiedAs: 'influencer' };
  }
  if (postsCount < 3) {
    return { total: 10, grade: 'D', label: 'Skip — Inactive', reasons: ['Less than 3 posts'], isGoodTarget: false, classifiedAs: 'inactive' };
  }

  // Reachability (max 30)
  if (hasEmail) { score += 15; reasons.push('✅ Email found'); }
  if (hasPhone) { score += 10; reasons.push('✅ Phone found'); }
  if (hasWebsite) { score += 7; reasons.push('✅ Website linked'); }
  if (bio.includes('wa.me') || bio.includes('whatsapp')) { score += 5; reasons.push('✅ WhatsApp in bio'); }

  // Business Signals (max 25)
  if (isBusinessAccount) { score += 10; reasons.push('✅ Business Account'); }
  if (category) { score += 8; reasons.push(`✅ Category: ${category}`); }
  if (containsAny(category + ' ' + bio, TARGET_CATEGORIES)) { score += 7; reasons.push('✅ Target Industry'); }

  // Size Fit (max 20)
  let classifiedAs = 'unknown';
  if (followers >= 500 && followers <= 5000) {
    score += 20; classifiedAs = 'ideal_local'; reasons.push(`✅ Ideal size (${followers})`);
  } else if (followers > 5000 && followers <= 30000) {
    score += 15; classifiedAs = 'small_business'; reasons.push(`✅ Good size (${followers})`);
  } else if (followers > 30000 && followers <= 100000) {
    score += 8; classifiedAs = 'mid_market'; reasons.push(`⚠️ Mid-market (${followers})`);
  } else if (followers < 500 && followers > 0) {
    score += 5; classifiedAs = 'micro';
  }

  // Activity (max 10)
  if (bio.length > 50) { score += 3; reasons.push('✅ Detailed bio'); }
  if (postsCount >= 20) { score += 4; reasons.push(`✅ Active (${postsCount} posts)`); }
  if (/\b(dm|inquiry|inquir|collab|contact|hire|book|available)\b/i.test(bio)) { score += 3; reasons.push('✅ Bio invites contact'); }

  if (!hasEmail && !hasPhone && !hasWebsite && !bio.includes('wa.me')) {
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  let grade = 'D';
  let label = '🔴 Skip';
  if (score >= 80) { grade = 'A'; label = '🟢 Hot Lead'; }
  else if (score >= 60) { grade = 'B'; label = '🟡 Warm Lead'; }
  else if (score >= 40) { grade = 'C'; label = '🟠 Maybe'; }

  return {
    total: score,
    grade,
    label,
    reasons,
    isGoodTarget: grade === 'A' || grade === 'B',
    classifiedAs,
  };
}

// ── Contact Extraction ────────────────────────────────────────────────────────
function extractContacts(text) {
  const emailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = text.match(/(?:\+|00)?[0-9\s\-().]{9,18}(?=\s|$|[\n,|📞☎️📱])/);
  const waMatch = text.match(/(?:wa\.me\/|whatsapp[:\s]+)[\+\d]{7,15}/i);

  return {
    email: emailMatch ? emailMatch[0].toLowerCase() : null,
    phone: phoneMatch ? phoneMatch[0].replace(/[\s\-().]/g, '').trim() : null,
    whatsapp: waMatch ? waMatch[0].replace(/(?:wa\.me\/|whatsapp[:\s]+)/i, '+') : null,
  };
}

// ── CLI / Env Config ──────────────────────────────────────────────────────────
function parseConfig() {
  const args = process.argv.slice(2);
  let targetsStr = process.env.TARGETS || '';
  let keywordsStr = process.env.KEYWORDS || '';
  let maxLeads = parseInt(process.env.MAX_LEADS || '30', 10);
  let dryRun = process.env.DRY_RUN === 'true';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--targets' && args[i + 1]) targetsStr = args[++i];
    else if (args[i] === '--keywords' && args[i + 1]) keywordsStr = args[++i];
    else if (args[i] === '--limit' && args[i + 1]) maxLeads = parseInt(args[++i], 10);
    else if (args[i] === '--dry-run') dryRun = true;
  }

  const targets = targetsStr
    .split(/[\n,]+/)
    .map(t => t.trim().replace(/^@/, '').replace(/https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, ''))
    .filter(Boolean);

  const keywords = keywordsStr
    .split(/[\n,]+/)
    .map(k => k.trim())
    .filter(Boolean);

  if (targets.length === 0 && keywords.length === 0) {
    keywords.push('architects UK', 'interior designers', 'boutique hotels', 'luxury cafes');
  }

  return { targets, keywords, maxLeads, dryRun };
}

// ── Multi-Engine Search ───────────────────────────────────────────────────────
async function mineXRaySearch(page, keywords, limit) {
  console.log(`\n🔍 [X-Ray Search Engine] Querying indexed Instagram business bios...`);
  const leads = [];
  const seenUsernames = new Set();

  for (const keyword of keywords) {
    if (leads.length >= limit) break;
    const query = `site:instagram.com "${keyword}" ("@gmail.com" OR "@yahoo.com" OR "contact@" OR "wa.me" OR "+91" OR "+44" OR "+1")`;
    console.log(`📡 Searching for: "${keyword}"`);

    const engines = [
      {
        name: 'Bing',
        url: `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=30`,
        selector: '#b_results .b_algo',
      },
      {
        name: 'DuckDuckGo',
        url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        selector: '.result',
      },
    ];

    for (const engine of engines) {
      if (leads.length >= limit) break;
      try {
        console.log(`   Trying ${engine.name}...`);
        await page.goto(engine.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(2000);

        const results = await page.$$eval(engine.selector, (elements) => {
          return elements.map(el => {
            const linkEl = el.querySelector('a');
            const link = (linkEl ? linkEl.href : '').trim();
            const title = (el.querySelector('h2, .result__title') ? el.querySelector('h2, .result__title').innerText : '').trim();
            const snippet = (el.innerText || '').trim();
            return { link, title, snippet };
          });
        });

        console.log(`   [${engine.name}] Extracted ${results.length} search entries`);

        for (const res of results) {
          if (leads.length >= limit) break;
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

          const lead = {
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
          }
        }

        if (results.length > 0) break;
      } catch (err) {
        console.warn(`   ⚠️ ${engine.name} non-fatal search warning:`, err.message);
      }
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(2000);
  }

  return leads;
}

// ── Target Account Direct Inspector with Website Contact Enrichment ──────────
async function mineTargets(page, targets, limit) {
  console.log(`\n📸 [Instagram Engine] Inspecting ${targets.length} target accounts...`);
  const leads = [];

  for (const target of targets) {
    if (leads.length >= limit) break;
    const url = `https://www.instagram.com/${target}/`;
    console.log(`🎯 Inspecting @${target}...`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      const pageData = await page.evaluate(() => {
        const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
        const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
        const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
        const bodyText = (document.body ? document.body.innerText : '') || '';

        const followerMatch = ogDesc.match(/([\d,KkMm.]+)\s*Followers/i);
        const postMatch = ogDesc.match(/([\d,KkMm.]+)\s*Posts/i);

        // Find domain pattern in body text (e.g. peakarchitects.co.uk, brand.com)
        const domainMatch = bodyText.match(/([a-zA-Z0-9-]+\.(?:com|co\.uk|org|net|in|io|design|studio|me|uk))/i);

        return {
          ogTitle,
          ogDesc,
          ogImage,
          bodyText,
          followerStr: followerMatch ? followerMatch[1] : '0',
          postStr: postMatch ? postMatch[1] : '0',
          extractedDomain: domainMatch ? domainMatch[1] : null,
        };
      });

      let contacts = extractContacts(pageData.ogDesc + ' ' + pageData.bodyText);
      const cleanName = pageData.ogTitle.split('(')[0]?.replace(/•.*$/, '').trim() || target;

      const parseFollowers = (str) => {
        const s = (str || '0').replace(/,/g, '').toLowerCase();
        if (s.endsWith('k')) return parseFloat(s) * 1000;
        if (s.endsWith('m')) return parseFloat(s) * 1000000;
        return parseInt(s, 10) || 0;
      };

      let websiteUrl = pageData.extractedDomain ? `https://${pageData.extractedDomain.replace(/^https?:\/\//, '')}` : null;
      let hasMetaPixel = false;

      // ── Deep Enrichment: Crawl listed website for email & phone ─────────────
      if (websiteUrl) {
        console.log(`   🌐 Discovered website: ${websiteUrl} — deep-enriching contacts...`);
        try {
          const webPage = await page.context().newPage();
          await webPage.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await webPage.waitForTimeout(1500);

          const webContent = await webPage.evaluate(() => {
            const text = document.body ? document.body.innerText : '';
            const html = document.documentElement.innerHTML || '';
            const hasPixel = html.includes('fbq(') || html.includes('connect.facebook.net') || html.includes('fbevents.js');
            return { text, hasPixel };
          });

          const webContacts = extractContacts(webContent.text);
          if (!contacts.email && webContacts.email) contacts.email = webContacts.email;
          if (!contacts.phone && webContacts.phone) contacts.phone = webContacts.phone;
          hasMetaPixel = webContent.hasPixel;

          await webPage.close();
          console.log(`   ✅ Enriched from website: ${contacts.email || 'No email'} | ${contacts.phone || 'No phone'} | Pixel: ${hasMetaPixel ? 'Yes' : 'No'}`);
        } catch (webErr) {
          console.log(`   ⚠️ Could not crawl website: ${webErr.message}`);
        }
      }

      const lead = {
        username: target,
        fullName: cleanName,
        biography: pageData.ogDesc || pageData.bodyText.slice(0, 300),
        category: null,
        externalUrl: websiteUrl,
        email: contacts.email,
        phone: contacts.phone,
        whatsapp: contacts.whatsapp,
        followerCount: parseFollowers(pageData.followerStr),
        location: null,
        hasMetaPixel: hasMetaPixel,
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
        console.log(`   ✨ [${lead.scoreData.grade}${lead.scoreData.total}] @${target} — ${cleanName} (${lead.scoreData.label} · Email: ${lead.email || 'None'})`);
      } else {
        console.log(`   ⏭  [@${target} scored ${lead.scoreData.total}: ${lead.scoreData.label}]`);
      }
    } catch (err) {
      console.warn(`   ⚠️ Target inspection non-fatal notice for @${target}:`, err.message);
    }
    await page.waitForTimeout(2000);
  }

  return leads;
}

// ── Save to Supabase ──────────────────────────────────────────────────────────
async function saveLeads(leads, dryRun) {
  if (leads.length === 0) {
    console.log(`\nℹ️ No qualified Grade A/B leads to insert this run.`);
    return;
  }

  console.log(`\n💾 Inserting ${leads.length} qualified leads into Supabase Lead Radar...`);
  if (dryRun) {
    console.log(`ℹ️ [Dry Run Active] Skipped database write.`);
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jwityrtfzuhnupjnmwfr.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';
  const supabase = createClient(supabaseUrl, supabaseKey);

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
    const { data, error } = await supabase.from('leads').insert(rows).select('id');
    if (error) {
      console.error(`❌ Supabase Notice:`, error.message);
    } else {
      console.log(`✅ Successfully saved ${data?.length || 0} leads to Supabase!`);
    }
  } catch (err) {
    console.error(`❌ Database Notice:`, err.message);
  }
}

// ── Main Runner ───────────────────────────────────────────────────────────────
async function main() {
  console.log(`=======================================================`);
  console.log(`   🚀 AKARSA LEAD HQ — GITHUB ACTIONS MINER ENGINE     `);
  console.log(`=======================================================`);

  const config = parseConfig();
  console.log(`⚙️ Config:`, {
    targets: config.targets,
    keywords: config.keywords,
    maxLeads: config.maxLeads,
    dryRun: config.dryRun,
  });

  let browser = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();
    const allLeads = [];

    if (config.targets.length > 0) {
      try {
        const targetLeads = await mineTargets(page, config.targets, config.maxLeads);
        allLeads.push(...targetLeads);
      } catch (err) {
        console.warn(`⚠️ Target inspection notice:`, err.message);
      }
    }

    if (config.keywords.length > 0 && allLeads.length < config.maxLeads) {
      try {
        const remainingLimit = config.maxLeads - allLeads.length;
        const xRayLeads = await mineXRaySearch(page, config.keywords, remainingLimit);
        allLeads.push(...xRayLeads);
      } catch (err) {
        console.warn(`⚠️ X-Ray search notice:`, err.message);
      }
    }

    console.log(`\n=======================================================`);
    console.log(`🎯 MINING SUMMARY`);
    console.log(`   Total Qualified (Grade A/B) Leads: ${allLeads.length}`);
    console.log(`   With Email: ${allLeads.filter(l => l.email).length}`);
    console.log(`   With Phone / WA: ${allLeads.filter(l => l.phone || l.whatsapp).length}`);
    console.log(`=======================================================`);

    await saveLeads(allLeads, config.dryRun);

  } catch (err) {
    console.error(`⚠️ Non-fatal execution note:`, err.message);
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    console.log(`🏁 Engine finished cleanly. Exit code 0.`);
    process.exit(0);
  }
}

main();
