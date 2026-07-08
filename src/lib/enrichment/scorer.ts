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
  let contact_score = 0;
  let fit_score = 0;
  let factors: any = {};

  // --- Contactability ---
  if (lead.email_verified) {
    contact_score += 40;
    factors.verified_email = 40;
  }
  
  if (lead.email_quality === 'named') {
    contact_score += 20;
    factors.named_email = 20;
  } else if (lead.email_quality === 'role') {
    contact_score += 10;
    factors.role_email = 10;
  }

  if (lead.phone_e164) {
    contact_score += 40;
    factors.phone = 40;
  }

  if (lead.contact_name) {
    contact_score += 20;
    factors.contact_name = 20;
  }

  // --- Agency Fit (Akarsa One) ---
  // These signals are passed in if extracted by the LLM
  if (lead.manages_multiple_clients) {
    fit_score += 40;
    factors.multi_client = 40;
  }
  
  if (lead.platforms_managed && lead.platforms_managed.length > 5) {
    fit_score += 20;
    factors.multi_platform = 20;
  }
  
  if (lead.reporting_analytics_offering) {
    fit_score += 30;
    factors.offers_reporting = 30;
  }
  
  if (lead.team_size_or_client_count) {
    fit_score += 10;
    factors.team_size_stated = 10;
  }

  if (lead.email_quality === 'none' && !lead.phone_e164) {
    contact_score = 0;
    fit_score = 0;
    factors.uncontactable = -100;
  }

  // Normalize Contact to 50 max, Fit to 50 max
  const norm_contact = Math.min(contact_score, 50);
  const norm_fit = Math.min(fit_score, 50);
  const total = norm_contact + norm_fit;

  return {
    score: total,
    contact_score: norm_contact,
    fit_score: norm_fit,
    factors: factors
  };
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

  const { score, contact_score, fit_score, factors } = calculateQualityScore(enriched);
  
  enriched.quality_score = score;
  enriched.contactability_score = contact_score;
  enriched.agency_fit_score = fit_score;
  enriched.score_factors = factors;
  enriched.enriched_at = new Date().toISOString();

  return enriched;
}
