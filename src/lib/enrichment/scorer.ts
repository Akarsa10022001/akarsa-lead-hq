import dns from 'dns';
import parsePhoneNumberFromString, { CountryCode } from 'libphonenumber-js';

// Reusable ISO mapping based on location string
export function inferRegionFromLocation(location: string): CountryCode | undefined {
  if (!location) return undefined;
  const loc = location.toLowerCase();
  
  if (loc.includes('india') || loc.includes('delhi') || loc.includes('mumbai') || loc.includes('bangalore')) return 'IN';
  if (loc.includes('uae') || loc.includes('dubai') || loc.includes('abu dhabi')) return 'AE';
  if (loc.includes('uk') || loc.includes('united kingdom') || loc.includes('london')) return 'GB';
  if (loc.includes('us') || loc.includes('usa') || loc.includes('united states') || loc.includes('new york')) return 'US';
  if (loc.includes('singapore')) return 'SG';
  
  return undefined; // Add more as needed, but if it's ambiguous, don't guess.
}

export function normalizePhone(rawPhone: string | null | undefined, locationHint: string): string | null {
  if (!rawPhone) return null;
  
  // Clean basic noise like (0) or weird spaces but leave + intact
  const cleaned = rawPhone.replace(/[^\d+]/g, '');
  if (!cleaned) return null;

  const region = inferRegionFromLocation(locationHint);
  
  try {
    const phoneNumber = parsePhoneNumberFromString(cleaned, region);
    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.format('E.164');
    }
  } catch (e) {
    // Parsing error
  }
  
  return null;
}

export async function verifyEmailMX(email: string): Promise<boolean> {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1];
  if (!domain) return false;

  try {
    const records = await dns.promises.resolveMx(domain);
    return records && records.length > 0;
  } catch {
    return false;
  }
}

export function classifyEmailQuality(email: string | null | undefined): string {
  if (!email) return 'none';
  const localPart = email.split('@')[0].toLowerCase();
  const catchalls = ['info', 'contact', 'sales', 'support', 'hello', 'admin', 'help', 'team'];
  if (catchalls.includes(localPart)) return 'role';
  return 'named'; // Could be improved to catch obvious catch-all domains, but named is default for real-looking names
}

export function calculateQualityScore(lead: any) {
  let score = 0;
  let factors: any = {};

  if (lead.email_verified) {
    score += 30;
    factors.verified_email = 30;
  }
  
  if (lead.email_quality === 'named') {
    score += 15;
    factors.named_email = 15;
  } else if (lead.email_quality === 'role') {
    score += 5;
    factors.role_email = 5;
  }

  if (lead.phone_e164) {
    score += 20;
    factors.phone = 20;
  }

  if (['none', 'free_builder'].includes(lead.website_status)) {
    score += 15;
    factors.needs_website = 15;
  }

  if (lead.rating !== undefined && lead.rating !== null && lead.rating < 4.0) {
    score += 10;
    factors.low_rating = 10;
  }

  if (lead.review_count !== undefined && lead.review_count !== null && lead.review_count < 20) {
    score += 10;
    factors.low_reviews = 10;
  }

  if (lead.contact_name) {
    score += 10;
    factors.contact_name = 10;
  }

  if (lead.email_quality === 'none' && !lead.phone_e164) {
    score -= 20;
    factors.uncontactable = -20;
  }

  score = Math.min(Math.max(score, 0), 100);

  return { score, factors };
}

export async function enrichLead(rawLead: any, locationHint: string) {
  // We expect rawLead to have: email, phone, website_status, has_website, rating, review_count, contact_name, etc.
  
  const enriched = { ...rawLead };

  if (enriched.email) {
    enriched.email_verified = await verifyEmailMX(enriched.email);
    enriched.email_quality = classifyEmailQuality(enriched.email);
  } else {
    enriched.email_verified = false;
    enriched.email_quality = 'none';
  }

  if (enriched.phone) {
    enriched.phone_e164 = normalizePhone(enriched.phone, locationHint);
  }

  const { score, factors } = calculateQualityScore(enriched);
  
  enriched.quality_score = score;
  enriched.score_factors = factors;
  enriched.enriched_at = new Date().toISOString();

  return enriched;
}
