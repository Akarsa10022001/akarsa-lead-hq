import dns from 'dns';
import parsePhoneNumberFromString, { CountryCode } from 'libphonenumber-js';

// Reusable ISO mapping based on location string
export function normalizeCanonicalIndustry(raw: string | null | undefined): string {
  if (!raw) return 'Corporate & General Business';
  const str = raw.toLowerCase().trim();
  if (str.includes('restaurant') || str.includes('food') || str.includes('bar') || str.includes('cafe')) return 'Food & Beverage';
  if (str.includes('hotel') || str.includes('motel') || str.includes('resort') || str.includes('attraction') || str.includes('landmark') || str.includes('museum')) return 'Hospitality & Accommodations';
  if (str.includes('store') || str.includes('hardware') || str.includes('shop') || str.includes('retail')) return 'Retail & E-commerce';
  if (str.includes('real_estate') || str.includes('contractor') || str.includes('builder')) return 'Real Estate & Construction';
  if (str.includes('gym') || str.includes('health') || str.includes('fitness')) return 'Health, Wellness & Fitness';
  if (str.includes('school') || str.includes('academy') || str.includes('education')) return 'Education & Training';
  if (str.includes('salon') || str.includes('spa') || str.includes('beauty')) return 'Beauty & Personal Care';
  if (str.includes('dentist') || str.includes('dental') || str.includes('clinic')) return 'Medical & Dental';
  if (str.includes('finance') || str.includes('accounting') || str.includes('bank')) return 'Financial & Accounting Services';
  if (str.includes('travel') || str.includes('car_rental') || str.includes('tours')) return 'Travel & Transportation';
  if (str.includes('lawyer') || str.includes('legal') || str.includes('attorney')) return 'Legal & Professional Services';
  if (str.includes('government') || str.includes('police') || str.includes('locality')) return 'Public & Government Services';
  return 'Corporate & General Business';
}

export function inferRegionFromLocation(location: string): CountryCode | undefined {
  if (!location) return undefined;
  const loc = location.toLowerCase();
  
  if (loc.includes('india') || loc.includes('delhi') || loc.includes('mumbai') || loc.includes('bangalore') || loc.includes('indore')) return 'IN';
  if (loc.includes('uae') || loc.includes('dubai') || loc.includes('abu dhabi')) return 'AE';
  if (loc.includes('uk') || loc.includes('united kingdom') || loc.includes('london')) return 'GB';
  // FIX: was `us` which matched "south" in "New South Wales", "Australia", etc.
  // Now only match explicit USA-only terms
  if (loc.includes('usa') || loc.includes('united states') || loc.includes('new york') || loc.includes('austin') || loc.includes('san francisco') || loc.includes('chicago') || loc.includes('los angeles') || (loc.includes(' us') && !loc.includes('south'))) return 'US';
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
 * 1. CONTACT (25 pts)   — Can we reach them? (email, phone, MX verified)
 * 2. DIGITAL (25 pts)   — How mature is their online presence? (website, pixel, ads, social)
 * 3. INTENT (25 pts)    — Are they showing buying signals? (reviews, news, RFP posts)
 * 4. FIT (25 pts)       — Do they match our ICP? (rating, industry, established business)
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
  // Extract signals from lead_signals array (passed or attached to lead)
  const signalList = signals || lead.lead_signals || [];

  // ─────────────────────────────────────────────────────────────
  // DIMENSION 1: CONTACT SCORE (0–25)
  // How reachable is this lead?
  // ─────────────────────────────────────────────────────────────
  let contact_score = 0;
  const factors: Record<string, number> = {};

  if (lead.email && lead.email_quality !== 'invalid_scraped' && lead.email_quality !== 'bounced') {
    // Named email (first.last@domain) is worth more than role email (info@domain)
    const emailPts = lead.email_quality === 'named' ? 15 : 10;
    contact_score += emailPts;
    factors.has_valid_email = emailPts;
  }
  if (lead.phone || lead.phone_e164) {
    contact_score += 10;
    factors.has_valid_phone = 10;
  }
  if (lead.email_verified || lead.domain_mx_verified) {
    contact_score += 5;
    factors.mx_verified = 5;
  }
  // Cap at 25
  contact_score = Math.min(contact_score, 25);

  // ─────────────────────────────────────────────────────────────
  // DIMENSION 2: DIGITAL MATURITY SCORE (0–25)
  // How developed is their online presence? (= how much do they need us?)
  // ─────────────────────────────────────────────────────────────
  let digital_score = 0;

  if (lead.has_website || lead.website || lead.social_links?.website) {
    digital_score += 5;
    factors.has_website = 5;
  }

  // Signal-based digital maturity (from enrichment pipeline)
  if (Array.isArray(signalList)) {
    for (const s of signalList) {
      const type = s.signal_type;
      if (type === 'no_website_on_listing' && !factors.no_website_on_listing) {
        // No website = prime sales opportunity = high digital gap score
        digital_score += 20;
        factors.no_website_on_listing = 20;
      } else if (type === 'slow_mobile_site' && !factors.slow_mobile_site) {
        digital_score += 15;
        factors.slow_mobile_site = 15;
      } else if ((type === 'runs_ads' || type === 'active_ads') && !factors.runs_ads) {
        // FIX: was 35 pts (inflated single signal). Now capped at 10 (they have budget, but less urgent need)
        digital_score += 10;
        factors.runs_ads = 10;
      } else if (type === 'has_pixel' && !factors.has_pixel) {
        // FIX: was 25 pts unbounded. Now 8 pts within digital dimension
        digital_score += 8;
        factors.has_pixel = 8;
      } else if (type === 'ig_active_low_engagement' && !factors.ig_active_low_engagement) {
        digital_score += 8;
        factors.ig_active_low_engagement = 8;
      }
    }
  }
  // Cap at 25
  digital_score = Math.min(digital_score, 25);

  // ─────────────────────────────────────────────────────────────
  // DIMENSION 3: INTENT SCORE (0–25)
  // Is this business showing active buying signals?
  // ─────────────────────────────────────────────────────────────
  let intent_score = 0;

  if (Array.isArray(signalList)) {
    for (const s of signalList) {
      const type = s.signal_type;
      if (type === 'recent_reviews' && !factors.recent_reviews) {
        // New business actively building online presence
        intent_score += 15;
        factors.recent_reviews = 15;
      } else if (type === 'news_mention' && !factors.news_mention) {
        intent_score += 10;
        factors.news_mention = 10;
      } else if (type === 'reddit_hiring' && !factors.reddit_hiring) {
        intent_score += 20;
        factors.reddit_hiring = 20;
      } else if (type === 'news_freshness' && !factors.news_freshness) {
        intent_score += 5;
        factors.news_freshness = 5;
      }
    }
  }
  // Cap at 25
  intent_score = Math.min(intent_score, 25);

  // ─────────────────────────────────────────────────────────────
  // DIMENSION 4: FIT SCORE (0–25)
  // FIX: was always returning 0 — now properly computed
  // Does this business match our ICP (ideal customer profile)?
  // ─────────────────────────────────────────────────────────────
  let fit_score = 0;

  if (lead.rating && parseFloat(lead.rating) >= 4.0) {
    // High-rated = brand-conscious, cares about reputation
    fit_score += 10;
    factors.high_rating = 10;
  }

  if (Array.isArray(signalList)) {
    for (const s of signalList) {
      const type = s.signal_type;
      if (type === 'established_local' && !factors.established_local) {
        // 20+ reviews = real business with budget
        fit_score += 10;
        factors.established_local = 10;
      } else if (type === 'strong_reputation' && !factors.strong_reputation) {
        // 4.0+ stars + 10+ reviews = brand-conscious ICP match
        fit_score += 10;
        factors.strong_reputation = 10;
      } else if (type === 'multi_client' && !factors.multi_client) {
        fit_score += 8;
        factors.multi_client = 8;
      }
    }
  }
  // Cap at 25
  fit_score = Math.min(fit_score, 25);

  // ─────────────────────────────────────────────────────────────
  // TOTAL & GRADE
  // ─────────────────────────────────────────────────────────────
  const total = Math.min(contact_score + digital_score + intent_score + fit_score, 100);

  // Grade thresholds
  const grade: 'A' | 'B' | 'C' | 'D' = total >= 50 ? 'A' : (total >= 35 ? 'B' : (total >= 15 ? 'C' : 'D'));
  const gradeColors: Record<string, string> = {
    'A': '#22c55e',
    'B': '#3b82f6',
    'C': '#eab308',
    'D': '#ef4444'
  };

  return {
    total,
    grade,
    contact_score,
    digital_score,
    intent_score,
    fit_score, // FIX: no longer always 0
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
  if (enriched.industry) {
    enriched.industry = normalizeCanonicalIndustry(enriched.industry);
  }

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

  const intel = calculateIntelScore(enriched, enriched.lead_signals);
  
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
