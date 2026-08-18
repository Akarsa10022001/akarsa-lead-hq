/**
 * Instagram Contact Extractor
 * Parses raw bio text and extracts emails, phones, and other contact signals.
 */

export interface ExtractedContacts {
  emails: string[];
  phones: string[];
  whatsapp: string | null;
  linktree: string | null;
  taplink: string | null;
}

export function extractContactsFromBio(bio: string): ExtractedContacts {
  if (!bio) return { emails: [], phones: [], whatsapp: null, linktree: null, taplink: null };

  const result: ExtractedContacts = {
    emails: [],
    phones: [],
    whatsapp: null,
    linktree: null,
    taplink: null,
  };

  // ── Email Extraction ──
  // Handles: info@domain.com, 📧info@domain.com, email: info@domain.com, [info@domain.com]
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const emailMatches = bio.match(emailRegex) || [];
  // Filter out Instagram's own emails and placeholder text
  result.emails = [...new Set(emailMatches.filter(e =>
    !e.includes('instagram.com') &&
    !e.includes('example.com') &&
    !e.includes('email@') &&
    e.length < 80
  ))];

  // ── Phone Extraction ──
  // Handles: +971 55 123 4567, +971-55-123-4567, 00971551234567, (971) 55 123 4567
  // Also handles emoji prefixes: 📞 ☎️ 📱
  const phoneRegex = /(?:\+|00)?[\d\s\-().]{7,20}(?=\s|$|[\n,])/g;
  const rawPhones = bio.match(phoneRegex) || [];
  const cleanedPhones = rawPhones
    .map(p => p.replace(/[\s\-().]/g, '').trim())
    .filter(p => p.length >= 7 && p.length <= 15 && /^\+?\d+$/.test(p))
    .filter(p => !p.match(/^(19|20)\d{2}$/)); // filter out years
  result.phones = [...new Set(cleanedPhones)];

  // ── WhatsApp Detection ──
  const waMatch = bio.match(/(?:wa\.me\/|whatsapp[:\s]+|wa[:\s]+)[\+\d]{7,15}/i);
  if (waMatch) {
    result.whatsapp = waMatch[0].replace(/(?:wa\.me\/|whatsapp[:\s]+|wa[:\s]+)/i, '+');
  }

  // ── Linktree Detection ──
  const linktreeMatch = bio.match(/linktr\.ee\/[\w.\-]+/i);
  if (linktreeMatch) result.linktree = `https://${linktreeMatch[0]}`;

  // ── Taplink Detection ──
  const taplinkMatch = bio.match(/taplink\.cc\/[\w.\-]+/i);
  if (taplinkMatch) result.taplink = `https://${taplinkMatch[0]}`;

  return result;
}

export function isBusinessAccount(profile: {
  biography?: string;
  category?: string;
  is_business_account?: boolean;
  external_url?: string;
  public_email?: string;
  public_phone_number?: string;
}): boolean {
  // Instagram explicit business signals
  if (profile.is_business_account) return true;
  if (profile.public_email) return true;
  if (profile.public_phone_number) return true;
  if (profile.external_url) return true;

  // Category signals
  const businessCategories = [
    'restaurant', 'cafe', 'bar', 'hotel', 'spa', 'salon', 'shop',
    'store', 'clinic', 'dental', 'gym', 'fitness', 'agency', 'studio',
    'boutique', 'school', 'academy', 'services', 'consulting', 'company',
    'media', 'photography', 'design', 'marketing', 'real estate'
  ];
  if (profile.category) {
    const catLower = profile.category.toLowerCase();
    if (businessCategories.some(b => catLower.includes(b))) return true;
  }

  // Bio signals — has contact info
  if (profile.biography) {
    const contacts = extractContactsFromBio(profile.biography);
    if (contacts.emails.length > 0 || contacts.phones.length > 0) return true;
    // Bio with linktree or taplink is often a business
    if (contacts.linktree || contacts.taplink) return true;
  }

  return false;
}
