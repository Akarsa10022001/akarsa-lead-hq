import * as cheerio from 'cheerio';

/**
 * Website Email Scraper (100% Free)
 * Given a business website URL, crawls the homepage + common contact pages
 * and extracts email addresses from the HTML.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Common contact/about pages to check
const CONTACT_PATHS = [
  '/',
  '/contact',
  '/contact-us',
  '/contactus',
  '/about',
  '/about-us',
  '/aboutus',
  '/team',
  '/our-team',
  '/reach-us',
];

// Emails to exclude (generic/system emails)
const EXCLUDED_PATTERNS = [
  /noreply@/i,
  /no-reply@/i,
  /webmaster@/i,
  /postmaster@/i,
  /admin@/i,
  /sentry/i,
  /wixpress/i,
  /example\./i,
  /test@/i,
  /support@wordpress/i,
  /\.png$/i,
  /\.jpg$/i,
  /\.gif$/i,
  /\.svg$/i,
  /\.webp$/i,
];

function isUsefulEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return !EXCLUDED_PATTERNS.some(pattern => pattern.test(lower));
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AkarsaBot/1.0; +https://akarsa.in)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return null;

    return await res.text();
  } catch (err) {
    return null;
  }
}

function extractEmailsFromHTML(html: string): string[] {
  const $ = cheerio.load(html);

  const emails = new Set<string>();

  // 1. Extract from mailto: links
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const email = href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
    if (email && EMAIL_REGEX.test(email)) {
      emails.add(email);
    }
  });

  // 2. Extract from page text
  const bodyText = $('body').text();
  const textMatches = bodyText.match(EMAIL_REGEX);
  if (textMatches) {
    textMatches.forEach(email => emails.add(email.toLowerCase()));
  }

  // 3. Extract from HTML source (catches obfuscated/hidden emails)
  const htmlMatches = html.match(EMAIL_REGEX);
  if (htmlMatches) {
    htmlMatches.forEach(email => emails.add(email.toLowerCase()));
  }

  // Filter out junk
  return Array.from(emails).filter(isUsefulEmail);
}

function extractSocialLinks(html: string): any {
  const $ = cheerio.load(html);
  const links: any = {};
  
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const lower = href.toLowerCase();
    
    if (lower.includes('instagram.com')) links.instagram = href;
    if (lower.includes('facebook.com') && !lower.includes('sharer')) links.facebook = href;
    if (lower.includes('linkedin.com')) links.linkedin = href;
    if (lower.includes('twitter.com') || lower.includes('x.com')) links.twitter = href;
  });
  
  return Object.keys(links).length > 0 ? links : null;
}

function detectFreeBuilder(html: string, url: string): boolean {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('.wixsite.com') || lowerUrl.includes('.weebly.com') || lowerUrl.includes('linktr.ee') || lowerUrl.includes('.godaddysites.com') || lowerUrl.includes('.wordpress.com')) {
    return true;
  }
  
  const lowerHtml = html.toLowerCase();
  return lowerHtml.includes('wix.com') || lowerHtml.includes('weebly.com') || lowerHtml.includes('godaddysites.com');
}

/**
 * Scrape emails from a business website.
 * Tries the homepage + common contact pages.
 * Returns unique, filtered email addresses.
 */
export async function scrapeWebsiteEmails(websiteUrl: string): Promise<{
  emails: string[];
  source_pages: string[];
  website_status: string;
  social_links: any;
}> {
  const allEmails = new Set<string>();
  const sourcePages: string[] = [];

  // Normalize the base URL
  let baseUrl = websiteUrl.trim();
  if (!baseUrl.startsWith('http')) {
    baseUrl = 'https://' + baseUrl;
  }
  // Remove trailing slash
  baseUrl = baseUrl.replace(/\/+$/, '');

  let website_status = 'live';
  if (!websiteUrl.startsWith('https') && !websiteUrl.startsWith('http')) {
    // We prepended https. If that fails, it might be dead or just http. We don't have a strict check here, but we'll assume live for now.
  } else if (websiteUrl.startsWith('http://')) {
    website_status = 'no_https';
  }

  let social_links: any = null;
  let builderDetected = false;
  let anySuccess = false;

  const fetchPromises = CONTACT_PATHS.slice(0, 3).map(async (path) => {
    const url = path === '/' ? baseUrl : `${baseUrl}${path}`;
    const html = await fetchPage(url);
    if (html) {
      const found = extractEmailsFromHTML(html);
      const socials = extractSocialLinks(html);
      if (detectFreeBuilder(html, url)) builderDetected = true;
      return { url, found, socials, success: true };
    }
    return { url, found: [], socials: null, success: false };
  });

  const results = await Promise.all(fetchPromises);
  
  for (const res of results) {
    if (res.success) anySuccess = true;
    if (res.found.length > 0) {
      sourcePages.push(res.url);
      res.found.forEach(e => allEmails.add(e));
    }
    if (res.socials) {
      social_links = { ...social_links, ...res.socials };
    }
  }

  if (!anySuccess) website_status = 'dead';
  else if (builderDetected) website_status = 'free_builder';

  return {
    emails: Array.from(allEmails),
    source_pages: sourcePages,
    website_status,
    social_links
  };
}

/**
 * Extract the domain from a website URL.
 */
export function extractDomain(websiteUrl: string): string | null {
  try {
    let url = websiteUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
