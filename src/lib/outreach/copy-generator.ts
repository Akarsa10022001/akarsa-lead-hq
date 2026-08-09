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
  cleaned = cleaned.replace(/\b(L\.?L\.?C\.?|Inc\.?|Pvt\.?\s*Ltd\.?|Private\s+Limited|Corp\.?|Corporation|Co\.?|Ltd\.?|Company|FZE|FZ-LLC|DMCC|Group|Services|Solutions|Pvt|Ltd)\b/gi, '').trim();

  // 4. Strip appended city names from company title (e.g. "GSearch Digital Marketing Company Bangalore" -> "GSearch Digital Marketing")
  cleaned = cleaned.replace(/\b(Bangalore|Bengaluru|Indore|Mumbai|Delhi|Dubai|Abu Dhabi|London|Austin|Singapore|Sydney|Rome|Milan|New York|Los Angeles)\b/gi, '').trim();

  // 5. Remove trailing punctuation & multiple spaces
  cleaned = cleaned.replace(/[.,;]+$/, '').replace(/\s+/g, ' ').trim();

  if (cleaned.length < 2) {
    return rawName.split(' ')[0] || 'your business';
  }

  return cleaned;
}

export function cleanCityName(rawCity?: string | null, fallback = 'your area'): string {
  if (!rawCity) return fallback;
  if (/dubai/i.test(rawCity)) return 'Dubai';
  if (/abu dhabi/i.test(rawCity)) return 'Abu Dhabi';
  if (/indore/i.test(rawCity)) return 'Indore';
  if (/mumbai/i.test(rawCity)) return 'Mumbai';
  if (/delhi/i.test(rawCity)) return 'Delhi';
  if (/london/i.test(rawCity)) return 'London';
  if (/austin/i.test(rawCity)) return 'Austin';
  if (/singapore/i.test(rawCity)) return 'Singapore';
  if (/sydney/i.test(rawCity)) return 'Sydney';
  if (/roma|rome/i.test(rawCity)) return 'Rome';
  if (/milano|milan/i.test(rawCity)) return 'Milan';

  // Fallback: extract clean city from multi-part address
  const parts = rawCity.split(/[-–,]/).map(p => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part.length > 2 && !/\d/.test(part) && !/united|states|emirates|india|kingdom|italy|usa|uk/i.test(part)) {
      return part;
    }
  }
  return fallback;
}

export function generateSmartOutreachCopy(payload: CopyPayload): GeneratedCopy {
  const company = cleanCompanyName(payload.companyName || '');
  const firstName = payload.contactName ? payload.contactName.split(' ')[0] : '';
  const greeting = firstName || 'Hi there';
  const city = cleanCityName(payload.city || payload.evidenceText?.match(/in ([A-Za-z\s]+)/)?.[1], '');
  const industry = payload.industry || 'business';
  const rating = payload.rating || 0;
  const reviews = payload.reviewCount || 0;
  const hasRating = rating > 0 && reviews > 0;

  const isAgency = /agency|digital marketing|marketing|media|advertising|seo|web design/i.test(`${company} ${industry}`);
  const isNoWebsite = payload.signalType === 'no_website_on_listing' || payload.hasWebsite === false;

  const unsubscribe = `\n\nP.S. If this isn't relevant, just reply "stop" and I won't reach out again.`;

  // ──────────────────────────────────────────────
  // INDUSTRY-SPECIFIC PAIN POINT MAP
  // ──────────────────────────────────────────────
  const industryPains: Record<string, { pain: string; question: string; waPain: string }> = {
    'restaurant': { pain: 'Most restaurants lose 20-30% of potential diners because they don\'t have a system to follow up with people who looked at the menu online but never booked.', question: 'Is that something you\'ve noticed at yours?', waPain: 'Are you capturing everyone who checks your menu online, or do some just browse and leave?' },
    'café': { pain: 'Most cafés lose 20-30% of potential diners because they don\'t have a system to follow up with people who looked at the menu online but never booked.', question: 'Is that something you\'ve noticed at yours?', waPain: 'Are you capturing everyone who checks your menu online, or do some just browse and leave?' },
    'dental': { pain: 'Most clinics we talk to say 30-40% of their new patient inquiries never actually book an appointment — they call after hours, get voicemail, and just move on.', question: 'Is that happening at your practice too, or do you have it covered?', waPain: 'Quick q — are you losing after-hours patient inquiries that go to voicemail and never call back?' },
    'medical': { pain: 'Most clinics we talk to say 30-40% of their new patient inquiries never actually book an appointment — they call after hours, get voicemail, and just move on.', question: 'Is that happening at your practice too, or do you have it covered?', waPain: 'Quick q — are you losing after-hours patient inquiries that go to voicemail and never call back?' },
    'fitness': { pain: 'Most gyms and studios spend big on getting new leads but don\'t have a system to re-engage members who haven\'t shown up in 2+ weeks. That\'s usually where the biggest revenue leak is.', question: 'Is member retention something you\'re actively working on?', waPain: 'Quick q — do you have a system to re-engage members who haven\'t visited in a while, or is that a gap?' },
    'gym': { pain: 'Most gyms and studios spend big on getting new leads but don\'t have a system to re-engage members who haven\'t shown up in 2+ weeks. That\'s usually where the biggest revenue leak is.', question: 'Is member retention something you\'re actively working on?', waPain: 'Quick q — do you have a system to re-engage members who haven\'t visited in a while, or is that a gap?' },
    'salon': { pain: 'Most salons and spas rely on walk-ins and word-of-mouth. The ones growing fastest right now have an automated rebooking system that texts clients 2 weeks after their last visit.', question: 'Is that something you\'ve tried, or is rebooking mostly manual?', waPain: 'Quick q — do you have an automated rebooking system or is it mostly manual follow-up?' },
    'beauty': { pain: 'Most salons and spas rely on walk-ins and word-of-mouth. The ones growing fastest right now have an automated rebooking system that texts clients 2 weeks after their last visit.', question: 'Is that something you\'ve tried, or is rebooking mostly manual?', waPain: 'Quick q — do you have an automated rebooking system or is it mostly manual follow-up?' },
    'wellness': { pain: 'Most salons and spas rely on walk-ins and word-of-mouth. The ones growing fastest right now have an automated rebooking system that texts clients 2 weeks after their last visit.', question: 'Is that something you\'ve tried, or is rebooking mostly manual?', waPain: 'Quick q — do you have an automated rebooking system or is it mostly manual follow-up?' },
    'real estate': { pain: 'Most real estate teams we talk to say their biggest frustration is leads going cold because they don\'t have time to personally follow up with every inquiry within 5 minutes.', question: 'Is speed-to-lead something you\'re working on, or have you got that dialed in?', waPain: 'Quick q — how fast does your team typically respond to a new property inquiry? Is that a bottleneck?' },
    'hotel': { pain: 'Most hotels lose direct bookings to OTAs (Booking.com, Expedia) because their own website doesn\'t convert well or doesn\'t have an easy way to capture inquiries.', question: 'Is driving more direct bookings something you\'re focused on?', waPain: 'Quick q — are most of your bookings coming through OTAs, or are you getting good direct traffic too?' },
    'hospitality': { pain: 'Most hotels lose direct bookings to OTAs (Booking.com, Expedia) because their own website doesn\'t convert well or doesn\'t have an easy way to capture inquiries.', question: 'Is driving more direct bookings something you\'re focused on?', waPain: 'Quick q — are most of your bookings coming through OTAs, or are you getting good direct traffic too?' },
    'automotive': { pain: 'Most auto shops and dealerships say their biggest pain is getting first-time customers to come back for their next service. An automated service reminder system usually fixes that overnight.', question: 'Do you have something like that in place, or is it mostly manual?', waPain: 'Quick q — do you have automated service reminders for past customers, or is that a gap right now?' },
    'education': { pain: 'Most coaching centers and ed-tech companies say their biggest challenge is converting free trial students into paid enrollments. Usually a 3-touchpoint follow-up sequence doubles that rate.', question: 'Is trial-to-paid conversion something you\'re actively optimizing?', waPain: 'Quick q — what\'s your biggest challenge right now — getting more trial students or converting them to paid?' },
    'e-commerce': { pain: 'Most e-commerce brands we talk to say 60-70% of their cart abandoners never come back. An automated recovery sequence usually recaptures 10-15% of those.', question: 'Is cart recovery something you\'ve optimized, or is there room to improve?', waPain: 'Quick q — are you running automated cart recovery, or is that something you haven\'t set up yet?' },
    'retail': { pain: 'Most retail businesses struggle to get customers back after the first visit. A simple loyalty + re-engagement system usually increases repeat purchases by 25-30%.', question: 'Is repeat business something you\'re actively working on?', waPain: 'Quick q — do you have a system to bring past customers back, or is it mostly organic?' },
    'legal': { pain: 'Most law firms we talk to say their intake process loses 30%+ of potential clients because calls go to voicemail or the response time is too slow.', question: 'Is client intake speed a concern for your firm?', waPain: 'Quick q — are you capturing every inbound inquiry quickly, or do some fall through the cracks?' },
    'saas': { pain: 'Most SaaS companies say their biggest leak is trial users who sign up, poke around for 5 minutes, and never come back. Usually a well-timed onboarding sequence fixes that.', question: 'Is trial-to-paid conversion something you\'re actively working on?', waPain: 'Quick q — what\'s your trial-to-paid conversion rate looking like? Is onboarding a gap?' },
  };

  // Find the matching industry pain point
  const industryLower = industry.toLowerCase();
  let matchedPain: { pain: string; question: string; waPain: string } | null = null;
  for (const [key, val] of Object.entries(industryPains)) {
    if (industryLower.includes(key)) {
      matchedPain = val;
      break;
    }
  }

  // ──────────────────────────────────────────────
  // 1. AGENCY TEMPLATE (unchanged — already good)
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
  // 2. NO WEBSITE TEMPLATE (rewritten — no more "Google listing" language)
  // ──────────────────────────────────────────────
  if (isNoWebsite) {
    const subject = `quick idea for ${company.split(' ').slice(0, 2).join(' ')}`;
    const body = `${greeting},

Was looking up ${industry} options${city ? ` in ${city}` : ''} and came across ${company}${hasRating ? ` — ${rating}★ with ${reviews} reviews is impressive` : ''}.

One thing I noticed: I couldn't find an official website for you. These days ~60% of people searching for local services check the website before deciding to visit or call.

Would it help if I mocked up a quick site preview for ${company}? Takes me about 10 minutes, no strings attached.

— ${SENDER_FIRST_NAME}${unsubscribe}`;

    const whatsappMessage = `Hey${firstName ? ` ${firstName}` : ''}! Came across ${company}${city ? ` in ${city}` : ''}${hasRating ? ` (${rating}★)` : ''}. I couldn't find an official website — you might be losing people who search online before visiting. Want me to mock up a quick preview? No charge, just 10 min.`;

    return { subject, body, whatsappMessage };
  }

  // ──────────────────────────────────────────────
  // 3. INDUSTRY-SPECIFIC PAIN POINT TEMPLATE (NEW — replaces old "review praise" template)
  // ──────────────────────────────────────────────
  if (matchedPain) {
    const companyShort = company.split(' ').slice(0, 2).join(' ');
    const subject = `quick question for ${companyShort}`;
    const body = `${greeting},

Came across ${company}${city ? ` in ${city}` : ''}${hasRating ? ` — ${rating}★ is solid` : ''}.

${matchedPain.pain}

${matchedPain.question}

— ${SENDER_FIRST_NAME}${unsubscribe}`;

    const whatsappMessage = `Hey${firstName ? ` ${firstName}` : ''}! Came across ${company}${city ? ` in ${city}` : ''}. ${matchedPain.waPain}`;

    return { subject, body, whatsappMessage };
  }

  // ──────────────────────────────────────────────
  // 4. GENERAL TEMPLATE (rewritten — focuses on their problems, not our services)
  // ──────────────────────────────────────────────
  const subject = `quick question for ${company.split(' ').slice(0, 2).join(' ')}`;
  const body = `${greeting},

Came across ${company}${city ? ` in ${city}` : ''}${hasRating ? ` — ${rating}★ is solid` : ''}.${payload.evidenceText ? ` ${payload.evidenceText}.` : ''}

Most local businesses we talk to say their biggest frustration is missed calls and after-hours inquiries that never convert into actual appointments.

Is that something ${company} deals with, or do you have it covered?

— ${SENDER_FIRST_NAME}${unsubscribe}`;

  const whatsappMessage = `Hey${firstName ? ` ${firstName}` : ''}! Came across ${company}${city ? ` in ${city}` : ''}. Quick q — are you losing missed calls or after-hours inquiries that never turn into bookings? Or is that handled?`;

  return { subject, body, whatsappMessage };
}
