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

export function generateSmartOutreachCopy(payload: CopyPayload): GeneratedCopy {
  const company = payload.companyName || 'Team';
  const firstName = payload.contactName ? payload.contactName.split(' ')[0] : 'Team';
  const city = payload.city || payload.evidenceText?.match(/in ([A-Za-z\s]+)/)?.[1] || 'your area';
  const industry = payload.industry || 'local business';
  const rating = payload.rating || 4.5;
  const reviews = payload.reviewCount || 30;

  const isAgency = /agency|digital marketing|marketing|media|advertising|seo|web design/i.test(`${company} ${industry}`);
  const isNoWebsite = payload.signalType === 'no_website_on_listing' || payload.hasWebsite === false;
  const isHighRep = payload.signalType === 'strong_reputation' || rating >= 4.2;

  // 1. AGENCY TEMPLATE (High Respect, White-Label/Bandwidth focus)
  if (isAgency) {
    const subject = `${firstName} — quick question on ${company}'s execution capacity`;
    const body = `Hey ${firstName},\n\nI came across ${company} while looking into top marketing & digital teams in ${city}. Impressive work you're doing.\n\nQuick question — are you guys taking on white-label technical execution right now, or currently capped on fulfillment bandwidth?\n\nWe build custom client acquisition & analytics infrastructure that agencies white-label directly for their clients.\n\nWould you be open to a brief 3-minute look to see if this could save your team technical hours?\n\nBest regards,\nAkarsa Team`;
    const whatsappMessage = `Hey ${firstName}! Saw ${company}'s work in ${city}. Are you guys currently open to white-label technical fulfillment support for your client pipeline? We build automated lead engines that agencies white-label. Worth a 2-min chat?`;

    return { subject, body, whatsappMessage };
  }

  // 2. NO WEBSITE TEMPLATE (Direct conversion focus)
  if (isNoWebsite) {
    const subject = `Website & booking link for ${company} in ${city}`;
    const body = `Hey ${firstName},\n\nI was looking up ${industry} providers in ${city} and noticed ${company} has a strong ${rating}★ rating on Google (${reviews} reviews).\n\nHowever, I noticed your Google listing doesn't have an official website or direct booking link attached. You're likely missing out on 30-40% of high-intent mobile searchers who look for instant booking.\n\nWe build high-converting, mobile-first websites specifically designed for ${industry} in ${city}.\n\nWould you like me to send over a 10-second preview of what your site could look like?\n\nBest regards,\nAkarsa Team`;
    const whatsappMessage = `Hey ${firstName}! Saw ${company}'s ${rating}★ Google profile in ${city}. Noticed you don't have an official website linked yet — mobile searchers are likely bouncing to competitors. Would you like a quick 10-second site preview for ${company}?`;

    return { subject, body, whatsappMessage };
  }

  // 3. HIGH REPUTATION TEMPLATE (Leverage social proof)
  if (isHighRep) {
    const subject = `Quick note on ${company}'s ${rating}★ GMB rating`;
    const body = `Hey ${firstName},\n\nCongrats on keeping a stellar ${rating}★ rating with ${reviews} reviews for ${company} in ${city} — that customer trust is hard to build.\n\nWith that reputation, setting up automated SMS & WhatsApp review follow-ups could easily double your monthly inbound leads without spending a single dollar on ads.\n\nWe build automated lead capture & review conversion systems for top local leaders.\n\nOpen to a 5-minute chat to see how it works for ${company}?\n\nBest regards,\nAkarsa Team`;
    const whatsappMessage = `Hey ${firstName}! Congrats on the ${rating}★ rating across ${reviews} reviews for ${company} in ${city}. We help top local businesses turn that reputation into 2x more booked clients via automated lead follow-ups. Worth a 2-min chat?`;

    return { subject, body, whatsappMessage };
  }

  // 4. GENERAL LOCAL LEADER TEMPLATE
  const subject = `${company} x local growth in ${city}`;
  const body = `Hey ${firstName},\n\nI was looking into established ${industry} providers in ${city} and came across ${company}.\n\n${payload.evidenceText ? `Noticed: ${payload.evidenceText}.` : `You've built a strong footprint in ${city}.`}\n\nWe help local business leaders automate lead follow-ups so missed calls and after-hours inquiries automatically convert into booked appointments.\n\nWould you be open to a quick 5-minute chat this week to see if this fits your current goals?\n\nBest regards,\nAkarsa Team`;
  const whatsappMessage = `Hey ${firstName}! Saw ${company}'s profile in ${city}. We help local businesses convert missed calls and map inquiries into booked clients automatically. Open to a quick 2-min chat?`;

  return { subject, body, whatsappMessage };
}
