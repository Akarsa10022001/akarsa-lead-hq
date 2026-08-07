export interface CopyPayload {
  companyName: string;
  contactName?: string | null;
  industry?: string | null;
  city?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  evidenceText?: string | null;
  signalType?: string | null;
  hasWebsite?: boolean;
}

export interface GeneratedCopy {
  subject: string;
  body: string;
  whatsappMessage: string;
}

const SENDER_FIRST_NAME = 'Ritik';

/**
 * Generates personal, conversational outreach copy designed to land in inbox
 * and get replies. Rules:
 * 1. Subject lines: Short, curiosity-driven, NO company name
 * 2. Body: 3-4 sentences MAX, ends with a specific question
 * 3. From a real person, not "Akarsa Team"
 * 4. Value-first, pitch-second
 * 5. Includes unsubscribe line for CAN-SPAM compliance
 */
export function cleanCompanyName(rawName: string): string {
  if (!rawName) return 'your business';

  // 1. Remove non-Latin characters (Arabic, Devanagari, Chinese, etc.)
  let cleaned = rawName.replace(/[^\x00-\x7F]/g, '').trim();

  // 2. Split on |, -, :, /, @, (, or location prefixes 'in Via...', 'located in...'
  const parts = cleaned.split(/\s*[-|:–/@()]\s*|\b(?:in|at|near|located\s+in)\b/i);
  if (parts.length > 0 && parts[0].trim().length > 2) {
    cleaned = parts[0].trim();
  }

  // 3. Strip legal corporate suffixes & generic noise
  cleaned = cleaned.replace(/\b(L\.?L\.?C\.?|Inc\.?|Pvt\.?\s*Ltd\.?|Private\s+Limited|Corp\.?|Corporation|Co\.?|Ltd\.?|Company|FZE|FZ-LLC|DMCC|Group)\b/gi, '').trim();

  // 4. Remove trailing punctuation & multiple spaces
  cleaned = cleaned.replace(/[.,;]+$/, '').replace(/\s+/g, ' ').trim();

  if (cleaned.length < 2) {
    return rawName.split(' ')[0] || 'your business';
  }

  return cleaned;
}

export function generateSmartOutreachCopy(payload: CopyPayload): GeneratedCopy {
  const company = cleanCompanyName(payload.companyName || '');
  const firstName = payload.contactName ? payload.contactName.split(' ')[0] : '';
  const greeting = firstName || 'Hi there';
  const city = payload.city || payload.evidenceText?.match(/in ([A-Za-z\s]+)/)?.[1] || '';
  const industry = payload.industry || 'business';
  const rating = payload.rating || 0;
  const reviews = payload.reviewCount || 0;

  const isAgency = /agency|digital marketing|marketing|media|advertising|seo|web design/i.test(`${company} ${industry}`);
  const isNoWebsite = payload.signalType === 'no_website_on_listing' || payload.hasWebsite === false;
  const isHighRep = payload.signalType === 'strong_reputation' || rating >= 4.2;

  const unsubscribe = `\n\nP.S. If this isn't relevant, just reply "stop" and I won't reach out again.`;

  // ──────────────────────────────────────────────
  // 1. AGENCY TEMPLATE
  // ──────────────────────────────────────────────
  if (isAgency) {
    const subject = `quick question about bandwidth`;
    const body = `${greeting},

Found ${company}${city ? ` in ${city}` : ''} — looks like you're doing solid work.

Are you currently at capacity on technical execution, or would you be open to offloading some fulfillment? We white-label web builds and lead systems for agencies.

Either way, no pressure — just curious if it's something you've explored.

— ${SENDER_FIRST_NAME}${unsubscribe}`;

    const whatsappMessage = `Hey${firstName ? ` ${firstName}` : ''}! Found ${company}${city ? ` in ${city}` : ''}. Quick q — are you at capacity on technical execution or open to white-label support? We do web builds + lead systems for agencies. Worth a 2 min chat?`;

    return { subject, body, whatsappMessage };
  }

  // ──────────────────────────────────────────────
  // 2. NO WEBSITE TEMPLATE
  // ──────────────────────────────────────────────
  if (isNoWebsite) {
    const subject = `noticed something about your Google listing`;
    const body = `${greeting},

Was looking up ${industry} options${city ? ` in ${city}` : ''} and came across ${company}${rating ? ` — ${rating}★` : ''}.${reviews ? ` ${reviews} reviews is impressive.` : ''}

One thing I noticed: your listing doesn't link to a website. You're probably losing walk-in traffic from people who Google you on their phone and can't find a booking page.

Would it help if I mocked up a quick site preview? Takes me 10 minutes, no strings attached.

— ${SENDER_FIRST_NAME}${unsubscribe}`;

    const whatsappMessage = `Hey${firstName ? ` ${firstName}` : ''}! Saw ${company}${city ? ` in ${city}` : ''}${rating ? ` (${rating}★)` : ''}. Noticed there's no website linked on your Google profile — you might be losing mobile searchers. Want me to mock up a quick preview? No charge, just 10 min.`;

    return { subject, body, whatsappMessage };
  }

  // ──────────────────────────────────────────────
  // 3. HIGH REPUTATION TEMPLATE
  // ──────────────────────────────────────────────
  if (isHighRep) {
    const subject = `your ${rating}★ rating — quick idea`;
    const body = `${greeting},

${rating}★ across ${reviews} reviews for ${company}${city ? ` in ${city}` : ''} — that's not easy to build. Congrats.

Most businesses with reviews like yours are leaving money on the table because they don't have automated follow-ups converting satisfied customers into repeat bookings.

Would you be open to a 5-minute call this week to see if that's happening for you too?

— ${SENDER_FIRST_NAME}${unsubscribe}`;

    const whatsappMessage = `Hey${firstName ? ` ${firstName}` : ''}! ${rating}★ with ${reviews} reviews for ${company}${city ? ` in ${city}` : ''} — impressive. Most businesses with reviews like yours are leaving repeat bookings on the table. Open to a quick 5-min chat about it?`;

    return { subject, body, whatsappMessage };
  }

  // ──────────────────────────────────────────────
  // 4. GENERAL TEMPLATE
  // ──────────────────────────────────────────────
  const subject = `quick question for ${company.split(' ').slice(0, 2).join(' ')}`;
  const body = `${greeting},

Came across ${company}${city ? ` in ${city}` : ''}.${payload.evidenceText ? ` ${payload.evidenceText}.` : ''}

We help local businesses set up automated lead follow-ups so missed calls and after-hours inquiries turn into booked appointments instead of lost revenue.

Is that something ${company} struggles with, or do you have it covered?

— ${SENDER_FIRST_NAME}${unsubscribe}`;

  const whatsappMessage = `Hey${firstName ? ` ${firstName}` : ''}! Came across ${company}${city ? ` in ${city}` : ''}. We help businesses convert missed calls into booked appointments automatically. Is that something you'd want to explore?`;

  return { subject, body, whatsappMessage };
}
