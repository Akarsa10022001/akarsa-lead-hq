/**
 * Lead Quality Scorer for Instagram Mining Agent
 * 
 * Scores each discovered account 0–100 based on how likely they are
 * to be a genuine Akarsa Studio prospect (small/mid business needing
 * design & marketing help, not already an agency).
 *
 * Grade:
 *  A  (80–100) 🟢 Hot Lead    → ready to contact
 *  B  (60–79)  🟡 Warm Lead   → worth adding to radar
 *  C  (40–59)  🟠 Maybe       → borderline, review manually
 *  D  (<40)    🔴 Skip        → filtered out by default
 */

// ── Target industries (businesses that need design & marketing) ───────────────
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

// ── Competitor / skip categories ─────────────────────────────────────────────
const COMPETITOR_SIGNALS = [
  'agency', 'studio', 'creative agency', 'marketing agency', 'digital agency',
  'branding agency', 'design agency', 'social media agency', 'advertising agency',
  'media company', 'growth hacker', 'seo agency',
];

// ── Influencer / content creator signals (different biz model, skip) ─────────
const INFLUENCER_SIGNALS = [
  'influencer', 'content creator', 'blogger', 'vlogger', 'youtuber',
  'brand ambassador', 'model', 'actor', 'actress', 'comedian',
];

function normalize(text: string): string {
  return (text || '').toLowerCase().trim();
}

function containsAny(text: string, terms: string[]): boolean {
  const t = normalize(text);
  return terms.some(term => t.includes(term));
}

export interface LeadScore {
  total: number;          // 0-100
  grade: 'A' | 'B' | 'C' | 'D';
  label: string;          // "Hot Lead" | "Warm" | "Maybe" | "Skip"
  color: string;          // Tailwind colour classes
  reasons: string[];      // Why it scored this way
  isGoodTarget: boolean;  // true if grade A or B
  classifiedAs: string;   // size bucket
}

export function scoreInstagramLead(profile: any): LeadScore {
  let score = 0;
  const reasons: string[] = [];
  const bio = normalize(profile.biography || profile.bio || '');
  const name = normalize(profile.fullName || profile.username || '');
  const category = normalize(profile.category || profile.businessCategoryName || '');
  const followers: number = profile.followerCount || profile.followersCount || 0;
  const hasWebsite = !!(profile.externalUrl);
  const hasEmail = !!(profile.email || profile.businessEmail || profile.publicEmail);
  const hasPhone = !!(profile.phone || profile.businessPhoneNumber);
  const isVerified = !!(profile.verified || profile.isVerified);
  const postsCount: number = profile.postCount || profile.postsCount || profile.mediaCount || 0;
  const isBusinessAccount = !!(profile.isBusinessAccount || profile.is_business);

  // ── INSTANT DISQUALIFIERS ──────────────────────────────────────────────────
  if (isVerified) {
    return { total: 5, grade: 'D', label: 'Skip — Verified (too big)', color: 'bg-red-500/10 text-red-400 border-red-500/20', reasons: ['Verified account — too large for Akarsa'], isGoodTarget: false, classifiedAs: 'enterprise' };
  }
  if (followers > 500_000) {
    return { total: 5, grade: 'D', label: 'Skip — Enterprise', color: 'bg-red-500/10 text-red-400 border-red-500/20', reasons: ['500K+ followers — enterprise level'], isGoodTarget: false, classifiedAs: 'enterprise' };
  }
  if (containsAny(name + ' ' + category, COMPETITOR_SIGNALS)) {
    return { total: 10, grade: 'D', label: 'Skip — Competitor Agency', color: 'bg-red-500/10 text-red-400 border-red-500/20', reasons: ['Appears to be a design/marketing agency'], isGoodTarget: false, classifiedAs: 'competitor' };
  }
  if (containsAny(bio + ' ' + name, INFLUENCER_SIGNALS)) {
    return { total: 15, grade: 'D', label: 'Skip — Influencer', color: 'bg-red-500/10 text-red-400 border-red-500/20', reasons: ['Appears to be an influencer/content creator'], isGoodTarget: false, classifiedAs: 'influencer' };
  }
  if (postsCount < 3) {
    return { total: 10, grade: 'D', label: 'Skip — Inactive', color: 'bg-red-500/10 text-red-400 border-red-500/20', reasons: ['Less than 3 posts — inactive account'], isGoodTarget: false, classifiedAs: 'inactive' };
  }

  // ── CONTACT SIGNALS (max 30 pts) ───────────────────────────────────────────
  if (hasEmail) {
    score += 15;
    reasons.push('✅ Email found');
  }
  if (hasPhone) {
    score += 10;
    reasons.push('✅ Phone found');
  }
  if (hasWebsite) {
    score += 7;
    reasons.push('✅ Website linked');
  }
  // Whatsapp/DM invite in bio
  if (bio.includes('wa.me') || bio.includes('whatsapp')) {
    score += 5;
    reasons.push('✅ WhatsApp in bio');
  }

  // ── BUSINESS SIGNALS (max 25 pts) ─────────────────────────────────────────
  if (isBusinessAccount) {
    score += 10;
    reasons.push('✅ Instagram Business account');
  }
  if (category) {
    score += 8;
    reasons.push(`✅ Category: ${category}`);
  }
  if (containsAny(category + ' ' + bio, TARGET_CATEGORIES)) {
    score += 7;
    reasons.push('✅ In target industry');
  }

  // ── SIZE FIT (max 20 pts) ──────────────────────────────────────────────────
  let classifiedAs = 'unknown';
  if (followers >= 500 && followers <= 5_000) {
    score += 20;
    classifiedAs = 'ideal_local';
    reasons.push(`✅ Ideal follower size (${followers.toLocaleString()})`);
  } else if (followers > 5_000 && followers <= 30_000) {
    score += 15;
    classifiedAs = 'small_business';
    reasons.push(`✅ Good size (${followers.toLocaleString()} followers)`);
  } else if (followers > 30_000 && followers <= 100_000) {
    score += 8;
    classifiedAs = 'mid_market';
    reasons.push(`⚠️ Mid-market (${followers.toLocaleString()} followers)`);
  } else if (followers > 100_000 && followers <= 500_000) {
    score += 3;
    classifiedAs = 'corporate_chain';
    reasons.push(`⚠️ Large account (${followers.toLocaleString()} followers)`);
  } else if (followers < 500 && followers > 0) {
    score += 5;
    classifiedAs = 'micro';
    reasons.push(`⚠️ Micro account (${followers.toLocaleString()} followers)`);
  }

  // ── ENGAGEMENT & ACTIVITY (max 10 pts) ────────────────────────────────────
  if (bio.length > 50) {
    score += 3;
    reasons.push('✅ Detailed bio');
  }
  if (postsCount >= 20) {
    score += 4;
    reasons.push(`✅ Active (${postsCount} posts)`);
  }
  // Bio has outreach invitation
  if (/\b(dm|inquiry|inquir|collab|contact|hire|book|available)\b/i.test(bio)) {
    score += 3;
    reasons.push('✅ Bio invites contact');
  }

  // ── PENALTY: no contact info at all ───────────────────────────────────────
  if (!hasEmail && !hasPhone && !hasWebsite && !bio.includes('wa.me')) {
    score -= 10;
    reasons.push('⚠️ No contact info found');
  }

  // Cap at 100
  score = Math.max(0, Math.min(100, score));

  // ── Grade assignment ───────────────────────────────────────────────────────
  let grade: 'A' | 'B' | 'C' | 'D';
  let label: string;
  let color: string;

  if (score >= 80) {
    grade = 'A'; label = '🟢 Hot Lead';
    color = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  } else if (score >= 60) {
    grade = 'B'; label = '🟡 Warm Lead';
    color = 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
  } else if (score >= 40) {
    grade = 'C'; label = '🟠 Maybe';
    color = 'bg-orange-500/15 text-orange-400 border-orange-500/30';
  } else {
    grade = 'D'; label = '🔴 Skip';
    color = 'bg-red-500/10 text-red-400 border-red-500/20';
  }

  return {
    total: score,
    grade,
    label,
    color,
    reasons,
    isGoodTarget: grade === 'A' || grade === 'B',
    classifiedAs,
  };
}
