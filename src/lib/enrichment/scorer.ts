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
  let contact = 0;
  let digital = 0;
  let intent = 0;
  let fit = 0;
  const factors: Record<string, number> = {};

  // ========================================
  // DIMENSION 1: CONTACT (Can we reach them?)
  // ========================================
  if (lead.email_verified) {
    contact += 10;
    factors.verified_email = 10;
  }
  
  if (lead.email_quality === 'named') {
    contact += 5;
    factors.named_email = 5;
  } else if (lead.email_quality === 'role') {
    contact += 2;
    factors.role_email = 2;
  }

  if (lead.phone_e164) {
    contact += 10;
    factors.phone_e164 = 10;
  } else if (lead.phone) {
    contact += 3;
    factors.phone_raw = 3;
  }

  if (lead.contact_name) {
    contact += 5;
    factors.contact_name = 5;
  }

  // Decision-maker from social intel
  if (lead.decision_maker_name) {
    contact += 3;
    factors.decision_maker = 3;
  }

  // ========================================
  // DIMENSION 2: DIGITAL MATURITY
  // ========================================
  if (lead.has_website) {
    digital += 5;
    factors.has_website = 5;
  }

  if (lead.website_status === 'live') {
    digital += 3;
    factors.website_live = 3;
  }

  // Social media presence
  const socialProfileCount = lead.social_profile_count || 0;
  if (socialProfileCount >= 1) {
    digital += 5;
    factors.has_social = 5;
  }
  if (socialProfileCount >= 3) {
    digital += 3;
    factors.multi_social = 3;
  }

  // Follower count
  const followers = lead.total_followers || 0;
  if (followers >= 10000) {
    digital += 7;
    factors.followers_10k = 7;
  } else if (followers >= 1000) {
    digital += 4;
    factors.followers_1k = 4;
  }

  // Domain age
  if (lead.domain_age_years) {
    if (lead.domain_age_years >= 3) {
      digital += 5;
      factors.established_domain = 5;
    } else if (lead.domain_age_years >= 1) {
      digital += 2;
      factors.newer_domain = 2;
    }
  }

  // Running paid ads
  if (lead.has_active_ads) {
    digital += 5;
    factors.active_ads = 5;
  }

  // ========================================
  // DIMENSION 3: INTENT (Buying signals)
  // ========================================
  // Intent score is calculated by the Intent Detector (Layer 9) and passed in directly
  intent = lead.intent_score || 0;
  if (intent > 0) factors.intent_signals = intent;

  // Additional intent from review analysis
  if (lead.rating && lead.rating < 3.5 && lead.review_count > 10) {
    intent += 5;
    factors.low_rating_intent = 5;
  }

  // No website but has social = needs web services
  if (!lead.has_website && socialProfileCount > 0) {
    intent += 5;
    factors.needs_website = 5;
  }

  // ========================================
  // DIMENSION 4: FIT (ICP match)
  // ========================================
  // Agency-specific fit (for Akarsa One)
  if (lead.manages_multiple_clients) {
    fit += 15;
    factors.multi_client = 15;
  }
  
  if (lead.platforms_managed) {
    const platformCount = lead.platforms_managed.split(',').length;
    if (platformCount >= 3) {
      fit += 5;
      factors.multi_platform = 5;
    }
  }
  
  if (lead.reporting_analytics_offering) {
    fit += 10;
    factors.offers_reporting = 10;
  }
  
  if (lead.team_size_or_client_count) {
    fit += 5;
    factors.team_size_stated = 5;
  }

  // General business fit (for Akarsa Studio)
  if (lead.rating && lead.rating >= 4.0) {
    fit += 3;
    factors.good_reputation = 3;
  }

  if (lead.review_count && lead.review_count >= 50) {
    fit += 3;
    factors.established_business = 3;
  }

  // ========================================
  // NORMALIZE & GRADE
  // ========================================
  const norm_contact = Math.min(contact, 25);
  const norm_digital = Math.min(digital, 25);
  const norm_intent = Math.min(intent, 25);
  const norm_fit = Math.min(fit, 25);
  const total = norm_contact + norm_digital + norm_intent + norm_fit;

  const grade = total >= 80 ? 'A' : total >= 60 ? 'B' : total >= 40 ? 'C' : 'D';
  const gradeColors: Record<string, string> = {
    'A': '#22c55e', // green
    'B': '#3b82f6', // blue
    'C': '#eab308', // yellow
    'D': '#ef4444'  // red
  };

  // BOUNCER: If completely uncontactable, override to 0
  if (lead.email_quality === 'none' && !lead.phone_e164 && !lead.phone && !lead.has_website) {
    return {
      total: 0,
      grade: 'D',
      contact_score: 0,
      digital_score: 0,
      intent_score: 0,
      fit_score: 0,
      factors: { uncontactable: -100 },
      grade_color: gradeColors['D']
    };
  }

  return {
    total,
    grade,
    contact_score: norm_contact,
    digital_score: norm_digital,
    intent_score: norm_intent,
    fit_score: norm_fit,
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
    enriched.email_verified = await verifyEmailMX(enriched.email);
    enriched.email_quality = classifyEmailQuality(enriched.email);
  } else {
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
