import dns from 'dns';
import parsePhoneNumberFromString, { CountryCode } from 'libphonenumber-js';

// Reusable ISO mapping based on location string
export function inferRegionFromLocation(location: string): CountryCode | undefined {
  if (!location) return undefined;
  const loc = location.toLowerCase();
  
  if (loc.includes('india') || loc.includes('delhi') || loc.includes('mumbai') || loc.includes('bangalore') || loc.includes('indore')) return 'IN';
  if (loc.includes('uae') || loc.includes('dubai') || loc.includes('abu dhabi')) return 'AE';
  if (loc.includes('uk') || loc.includes('united kingdom') || loc.includes('london')) return 'GB';
  if (loc.includes('us') || loc.includes('usa') || loc.includes('united states') || loc.includes('new york') || loc.includes('austin')) return 'US';
  if (loc.includes('singapore')) return 'SG';
  if (loc.includes('australia') || loc.includes('sydney') || loc.includes('melbourne')) return 'AU';
  if (loc.includes('canada') || loc.includes('toronto') || loc.includes('vancouver')) return 'CA';
  
  return undefined;
}

export function normalizePhone(rawPhone: string | null | undefined, locationHint: string): string | null {
  if (!rawPhone) return null;
  
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
  return 'named';
}

/**
 * ============================================================
 * COMPOSITE LEAD INTELLIGENCE SCORE — Palantir-Grade
 * ============================================================
 * 4 dimensions, each scored 0-25, for a total of 0-100:
 * 
 * 1. CONTACT (25 pts)   — Can we reach them?
 * 2. DIGITAL (25 pts)   — How mature is their online presence?
 * 3. INTENT (25 pts)    — Are they showing buying signals?
 * 4. FIT (25 pts)       — Do they match our ideal customer profile?
 */

export interface IntelScore {
  total: number;         // 0-100
  grade: 'A' | 'B' | 'C' | 'D';
  contact_score: number; // 0-25
  digital_score: number; // 0-25
  intent_score: number;  // 0-25
  fit_score: number;     // 0-25
  factors: Record<string, number>;
  grade_color: string;   // For UI rendering
}

export function calculateIntelScore(lead: any): IntelScore {
  let score = 0;
  const factors: Record<string, number> = {};

  // 1. Runs Meta / Google Ads (+35)
  if (lead.runs_ads || lead.has_active_ads) {
    score += 35;
    factors.runs_ads = 35;
  }

  // 2. Has Meta Pixel installed (+25)
  if (lead.has_pixel) {
    score += 25;
    factors.has_pixel = 25;
  }

  // 3. Active Instagram with low engagement (+20)
  if (lead.ig_active_low_engagement) {
    score += 20;
    factors.ig_active_low_engagement = 20;
  }

  // 4. Recent negative reviews with active owner response (+15)
  if (lead.recent_reviews || (lead.rating && lead.rating < 3.5 && lead.review_count > 10)) {
    score += 15;
    factors.recent_reviews = 15;
  }

  // 5. Weak / slow website (+10)
  if (lead.weak_website || lead.website_status === 'weak' || lead.website_status === 'slow') {
    score += 10;
    factors.weak_website = 10;
  }

  // Cap max score at 100
  const total = Math.min(score, 100);
  const grade = total >= 80 ? 'A' : (total >= 65 ? 'B' : (total >= 40 ? 'C' : 'D'));
  const gradeColors: Record<string, string> = {
    'A': '#22c55e',
    'B': '#3b82f6',
    'C': '#eab308',
    'D': '#ef4444'
  };

  return {
    total,
    grade,
    contact_score: 0,
    digital_score: lead.has_pixel ? 25 : 0,
    intent_score: (lead.runs_ads || lead.has_active_ads) ? 35 : 0,
    fit_score: 0,
    factors,
    grade_color: gradeColors[grade]
  };
}

// Legacy wrapper for backward compatibility
export function calculateQualityScore(lead: any) {
  const intel = calculateIntelScore(lead);
  return {
    score: intel.total,
    contact_score: intel.contact_score,
    fit_score: intel.fit_score,
    factors: intel.factors
  };
}

export async function enrichLead(rawLead: any, locationHint: string) {
  const enriched = { ...rawLead };

  if (enriched.email) {
    enriched.domain_mx_verified = await verifyEmailMX(enriched.email);
    enriched.email_verified = enriched.domain_mx_verified;
    enriched.email_quality = classifyEmailQuality(enriched.email);
  } else {
    enriched.domain_mx_verified = false;
    enriched.email_verified = false;
    enriched.email_quality = 'none';
  }

  if (enriched.phone) {
    enriched.phone_e164 = normalizePhone(enriched.phone, locationHint);
  }

  const intel = calculateIntelScore(enriched);
  
  enriched.quality_score = intel.total;
  enriched.intel_grade = intel.grade;
  enriched.intel_grade_color = intel.grade_color;
  enriched.contactability_score = intel.contact_score;
  enriched.digital_maturity_score = intel.digital_score;
  enriched.intent_score = intel.intent_score;
  enriched.agency_fit_score = intel.fit_score;
  enriched.score_factors = intel.factors;
  enriched.enriched_at = new Date().toISOString();

  return enriched;
}
