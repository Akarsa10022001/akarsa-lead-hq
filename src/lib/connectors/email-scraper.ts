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

/**
 * Scrape emails from a business website.
 * Tries the homepage + common contact pages.
 * Returns unique, filtered email addresses.
 */
export async function scrapeWebsiteEmails(websiteUrl: string): Promise<{
  emails: string[];
  source_pages: string[];
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

  // Try each contact path concurrently to avoid hanging the serverless function
  const fetchPromises = CONTACT_PATHS.slice(0, 3).map(async (path) => {
    const url = path === '/' ? baseUrl : `${baseUrl}${path}`;
    const html = await fetchPage(url);
    if (html) {
      const found = extractEmailsFromHTML(html);
      return { url, found };
    }
    return null;
  });

  const results = await Promise.all(fetchPromises);
  
  for (const res of results) {
    if (res && res.found.length > 0) {
      sourcePages.push(res.url);
      res.found.forEach(e => allEmails.add(e));
    }
  }

  return {
    emails: Array.from(allEmails),
    source_pages: sourcePages
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
