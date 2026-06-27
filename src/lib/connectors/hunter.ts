/**
 * Hunter.io Email Finder Connector (Free Tier: 50 credits/month)
 * Fallback enrichment source when website scraping and pattern guessing fail.
 * Requires HUNTER_API_KEY environment variable.
 */

const HUNTER_BASE_URL = 'https://api.hunter.io/v2';

export interface HunterEmail {
  value: string;
  type: string;       // 'personal' or 'generic'
  confidence: number;  // 0-100
  first_name?: string;
  last_name?: string;
  position?: string;
}

export interface HunterDomainSearchResult {
  domain: string;
  organization: string;
  emails: HunterEmail[];
  pattern?: string; // e.g. '{first}.{last}'
}

/**
 * Search for emails associated with a domain using Hunter.io's Domain Search API.
 */
export async function hunterDomainSearch(domain: string): Promise<HunterDomainSearchResult | null> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) {
    console.warn('[Hunter] HUNTER_API_KEY not set. Skipping.');
    return null;
  }

  try {
    const url = `${HUNTER_BASE_URL}/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}`;
    const res = await fetch(url);
    
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Hunter] API Error: ${res.status} - ${errText}`);
      return null;
    }

    const json = await res.json();
    const data = json.data;

    if (!data) return null;

    return {
      domain: data.domain,
      organization: data.organization || '',
      emails: (data.emails || []).map((e: any) => ({
        value: e.value,
        type: e.type || 'unknown',
        confidence: e.confidence || 0,
        first_name: e.first_name,
        last_name: e.last_name,
        position: e.position,
      })),
      pattern: data.pattern,
    };
  } catch (err: any) {
    console.error(`[Hunter] Error: ${err.message}`);
    return null;
  }
}

/**
 * Verify a single email using Hunter.io's Email Verifier API.
 * Returns verification status and score.
 */
export async function hunterVerifyEmail(email: string): Promise<{
  status: string;
  score: number;
  result: string;
} | null> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `${HUNTER_BASE_URL}/email-verifier?email=${encodeURIComponent(email)}&api_key=${apiKey}`;
    const res = await fetch(url);
    
    if (!res.ok) return null;
    
    const json = await res.json();
    const data = json.data;
    
    return {
      status: data.status || 'unknown',
      score: data.score || 0,
      result: data.result || 'unknown'
    };
  } catch {
    return null;
  }
}
