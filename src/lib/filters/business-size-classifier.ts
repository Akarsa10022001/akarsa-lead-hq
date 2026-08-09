/**
 * SMART BUSINESS SIZE CLASSIFIER
 * 
 * Detects whether a lead is a small local business (IDEAL TARGET)
 * or a large chain/corporation (WASTE OF TIME).
 * 
 * Returns a classification + confidence score so the system can
 * auto-filter or deprioritize corporate chains.
 */

export type BusinessSize = 'ideal_local' | 'small_business' | 'mid_market' | 'corporate_chain' | 'enterprise';

export interface BusinessClassification {
  size: BusinessSize;
  confidence: number; // 0-100
  reasons: string[];
  isGoodTarget: boolean; // true = worth contacting, false = skip
  penaltyScore: number; // negative number to subtract from quality score
}

// ────────────────────────────────────────────────
// KNOWN CHAIN / FRANCHISE / ENTERPRISE BRANDS
// ────────────────────────────────────────────────
const KNOWN_CHAINS: string[] = [
  // Global Fast Food & Restaurant Chains
  'mcdonald', 'burger king', 'kfc', 'subway', 'pizza hut', 'domino', 'starbucks',
  'dunkin', 'costa coffee', 'tim hortons', 'papa john', 'wendy', 'taco bell',
  'chick-fil-a', 'popeyes', 'shake shack', 'five guys', 'chipotle', 'nando',
  'panda express', 'baskin robbins', 'cold stone', 'krispy kreme',
  // Hotel Chains
  'marriott', 'hilton', 'hyatt', 'sheraton', 'holiday inn', 'intercontinental',
  'radisson', 'westin', 'four seasons', 'ritz-carlton', 'corinthia', 'fairmont',
  'sofitel', 'novotel', 'ibis', 'accor', 'best western', 'wyndham', 'ramada',
  'crowne plaza', 'shangri-la', 'mandarin oriental', 'peninsula', 'st regis',
  'w hotel', 'jw marriott', 'doubletree', 'renaissance hotel',
  // Retail Chains
  'nike', 'adidas', 'zara', 'h&m', 'uniqlo', 'gap', 'forever 21', 'primark',
  'walmart', 'target', 'costco', 'ikea', 'carrefour', 'lulu hypermarket',
  'sephora', 'bath & body', 'victoria secret', 'mac cosmetics', 'the body shop',
  'foot locker', 'under armour', 'puma', 'reebok', 'sketcher',
  // Electronics / Tech Retail
  'apple store', 'samsung store', 'best buy', 'micro center',
  // Banks & Financial
  'hsbc', 'standard chartered', 'citibank', 'jpmorgan', 'emirates nbd',
  'mashreq', 'adcb', 'fab bank', 'icici', 'hdfc', 'barclays', 'deutsche bank',
  // Automotive Chains
  'toyota', 'honda', 'bmw', 'mercedes', 'audi', 'hyundai', 'nissan', 'ford',
  'chevrolet', 'volkswagen', 'tesla', 'kia', 'lexus', 'porsche', 'land rover',
  'jaguar', 'bentley', 'rolls royce', 'ferrari', 'lamborghini', 'maserati',
  // Telecom
  'etisalat', 'du telecom', 'airtel', 'jio', 'vodafone', 't-mobile', 'at&t',
  'verizon', 'sprint',
  // Supermarkets / Grocery
  'whole foods', 'trader joe', 'aldi', 'lidl', 'tesco', 'sainsbury',
  'waitrose', 'morrisons', 'asda', 'spinneys', 'choithrams',
  // Fitness Chains
  'gold gym', 'anytime fitness', 'planet fitness', 'equinox', 'crunch fitness',
  'orangetheory', 'crossfit', 'barry bootcamp', 'soulcycle', 'f45',
  // Mall-based
  'dubai mall', 'mall of emirates', 'city centre', 'ibn battuta',
  // Other Enterprises
  'amazon', 'google', 'facebook', 'meta', 'microsoft', 'uber', 'grab',
  'deliveroo', 'talabat', 'zomato', 'swiggy', 'ola',
];

// Domain patterns that indicate corporate/enterprise
const CORPORATE_DOMAINS: RegExp[] = [
  /\.(gov|edu|org|mil)\b/i,
  /(https?:\/\/)?(www\.)?(nike|adidas|marriott|hilton|hyatt|starbucks|mcdonalds|kfc|subway|zara|hm|uniqlo|apple|samsung|google|facebook|amazon|microsoft|uber|atlantis|jumeirah|emaar|nakheel)\./i,
];

// Words in company name that signal corporate structure
const CORPORATE_INDICATORS: string[] = [
  'international', 'worldwide', 'global', 'corporation', 'holdings',
  'group of companies', 'enterprises', 'conglomerate', 'multinational',
  'franchise', 'chain', 'mall', 'department store', 'hypermarket',
];

/**
 * Classify a business by size and determine if it's worth contacting.
 */
export function classifyBusinessSize(lead: {
  company_name?: string;
  review_count?: number;
  rating?: number;
  domain?: string;
  industry?: string;
  category?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
}): BusinessClassification {
  const reasons: string[] = [];
  let chainScore = 0; // Higher = more likely a chain (bad)
  let localScore = 0; // Higher = more likely a local business (good)

  const companyLower = (lead.company_name || '').toLowerCase();
  const domainLower = (lead.domain || '').toLowerCase();
  const industryLower = `${lead.industry || ''} ${lead.category || ''}`.toLowerCase();
  const contactLower = (lead.contact_name || '').toLowerCase();
  const emailLower = (lead.email || '').toLowerCase();

  // ── CHECK 1: Known Chain Name Match ──
  for (const chain of KNOWN_CHAINS) {
    if (companyLower.includes(chain)) {
      chainScore += 50;
      reasons.push(`Known chain/franchise: "${chain}"`);
      break;
    }
  }

  // ── CHECK 2: Review Count Analysis ──
  const reviews = lead.review_count || 0;
  if (reviews > 5000) {
    chainScore += 40;
    reasons.push(`Massive review count (${reviews}) = major brand`);
  } else if (reviews > 2000) {
    chainScore += 25;
    reasons.push(`Very high review count (${reviews}) = likely chain`);
  } else if (reviews > 500) {
    chainScore += 10;
    reasons.push(`High review count (${reviews}) = established business`);
  } else if (reviews >= 10 && reviews <= 300) {
    localScore += 20;
    reasons.push(`Local review count (${reviews}) = likely independent`);
  } else if (reviews < 10) {
    localScore += 10;
    reasons.push(`Very few reviews (${reviews}) = new/small business`);
  }

  // ── CHECK 3: Corporate Domain Pattern ──
  for (const pattern of CORPORATE_DOMAINS) {
    if (pattern.test(domainLower)) {
      chainScore += 50;
      reasons.push(`Corporate domain pattern: ${domainLower}`);
      break;
    }
  }

  // ── CHECK 4: Corporate Name Indicators ──
  for (const indicator of CORPORATE_INDICATORS) {
    if (companyLower.includes(indicator)) {
      chainScore += 20;
      reasons.push(`Corporate indicator in name: "${indicator}"`);
      break;
    }
  }

  // ── CHECK 5: Contact Name Analysis ──
  const genericContacts = ['info', 'support', 'contact', 'sales', 'team', 'hr', 'admin', 'corporate', 'reception', 'front desk', 'customer service', 'n/a'];
  const isGenericContact = !lead.contact_name || genericContacts.some(g => contactLower.includes(g));
  
  if (isGenericContact) {
    chainScore += 10;
    reasons.push('Generic/missing contact name (not owner-operated)');
  } else {
    localScore += 15;
    reasons.push(`Named contact: "${lead.contact_name}" (likely owner/manager)`);
  }

  // ── CHECK 6: Email Analysis ──
  if (emailLower) {
    if (/^(info|contact|hello|support|sales|admin|hr|careers|marketing)@/i.test(emailLower)) {
      chainScore += 5;
      reasons.push('Generic department email (info@, contact@)');
    } else if (/^[a-z]+\.[a-z]+@/i.test(emailLower)) {
      // firstname.lastname@ pattern — could be owner
      localScore += 10;
      reasons.push('Personal email pattern (likely owner)');
    }
  }

  // ── CHECK 7: Industry-Specific Chain Signals ──
  if (/mall|shopping center|department|hypermarket|supermarket/i.test(industryLower)) {
    chainScore += 25;
    reasons.push('Mall/hypermarket/department store category');
  }
  if (/franchise|chain|brand|outlet/i.test(industryLower)) {
    chainScore += 20;
    reasons.push('Franchise/chain/outlet category');
  }

  // ── FINAL CLASSIFICATION ──
  const netScore = chainScore - localScore;

  let size: BusinessSize;
  let isGoodTarget: boolean;
  let penaltyScore: number;

  if (netScore >= 60) {
    size = 'enterprise';
    isGoodTarget = false;
    penaltyScore = -80;
  } else if (netScore >= 35) {
    size = 'corporate_chain';
    isGoodTarget = false;
    penaltyScore = -60;
  } else if (netScore >= 15) {
    size = 'mid_market';
    isGoodTarget = true; // Borderline — still contactable but lower priority
    penaltyScore = -20;
  } else if (netScore >= -5) {
    size = 'small_business';
    isGoodTarget = true;
    penaltyScore = 0;
  } else {
    size = 'ideal_local';
    isGoodTarget = true;
    penaltyScore = 20; // BONUS — prioritize these
  }

  return {
    size,
    confidence: Math.min(100, Math.abs(netScore) + 30),
    reasons,
    isGoodTarget,
    penaltyScore,
  };
}
