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

export function calculateIntelScore(lead: any, signals?: any[]): IntelScore {
  let score = 0;
  const factors: Record<string, number> = {};

  // Extract signals from lead_signals array (passed or attached to lead)
  const signalList = signals || lead.lead_signals || [];

  if (Array.isArray(signalList) && signalList.length > 0) {
    for (const s of signalList) {
      const type = s.signal_type;
      if (type === 'slow_mobile_site' && !factors.slow_mobile_site) {
        score += 25;
        factors.slow_mobile_site = 25;
      } else if ((type === 'runs_ads' || type === 'active_ads') && !factors.runs_ads) {
        score += 35;
        factors.runs_ads = 35;
      } else if (type === 'has_pixel' && !factors.has_pixel) {
        score += 25;
        factors.has_pixel = 25;
      } else if (type === 'ig_active_low_engagement' && !factors.ig_active_low_engagement) {
        score += 20;
        factors.ig_active_low_engagement = 20;
      } else if (type === 'recent_reviews' && !factors.recent_reviews) {
        score += 15;
        factors.recent_reviews = 15;
      }
    }
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
    digital_score: factors.has_pixel || 0,
    intent_score: (factors.runs_ads || factors.slow_mobile_site) ? 25 : 0,
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
