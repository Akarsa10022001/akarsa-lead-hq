import { callLLM } from '../llm';
import { isAgencyCategory } from '../connectors/industries';

export interface AgencySignals {
  manages_multiple_clients?: string | null;
  platforms_managed?: string | null;
  team_size_or_client_count?: string | null;
  reporting_analytics_offering?: string | null;
  source_url: string;
}

export interface DecisionMakerIntel {
  name?: string;
  role?: string; // "Owner", "Founder", "Marketing Director", etc.
  best_channel: 'whatsapp' | 'email' | 'linkedin';
  personalized_opener: string;
  outreach_angle: string; // Short description of the best pitch angle
}

export async function extractAgencySignals(htmlText: string, url: string): Promise<AgencySignals | null> {
  // Truncate to first 10,000 characters to save tokens/time
  const text = htmlText.substring(0, 10000).replace(/\s+/g, ' ');
  
  if (!text || text.length < 100) return null;

  const prompt = `You are a strict data extractor. Below is the text scraped from an agency's website.
Extract the following information ONLY if it is explicitly stated in the text. DO NOT invent, infer, or hallucinate anything.
If a piece of information is missing, leave the field null.

1. "manages_multiple_clients": Quote the phrase/sentence that proves they manage social media or marketing for multiple clients (e.g. from their portfolio or case studies).
2. "platforms_managed": Comma-separated list of platforms they explicitly state they manage (e.g., "Instagram, YouTube, LinkedIn").
3. "team_size_or_client_count": Quote any mention of their team size or number of clients.
4. "reporting_analytics_offering": Quote any mention of providing "analytics", "monthly reports", or "performance tracking" to clients.

Text from ${url}:
"""
${text}
"""

Return valid JSON with the exact keys: manages_multiple_clients, platforms_managed, team_size_or_client_count, reporting_analytics_offering. Values should be strings or null.`;

  try {
    const result = await callLLM({
      task: 'Extract agency signals',
      prompt,
      preferredProvider: 'groq'
    });
    
    if (result) {
      return {
        manages_multiple_clients: result.manages_multiple_clients || null,
        platforms_managed: result.platforms_managed || null,
        team_size_or_client_count: result.team_size_or_client_count || null,
        reporting_analytics_offering: result.reporting_analytics_offering || null,
        source_url: url
      };
    }
  } catch (e) {
    console.error(`Failed to extract agency signals for ${url}`, e);
  }
  return null;
}

/**
 * Layer 11: AI Decision-Maker Identification
 * Analyzes ALL collected evidence to identify the decision-maker,
 * recommend the best outreach channel, and generate a hyper-personalized opener.
 */
export async function identifyDecisionMaker(
  companyName: string,
  industry: string,
  location: string,
  allEvidence: { signal_type: string; evidence_text: string }[],
  socialProfiles: any[],
  contactName?: string,
  email?: string,
  phone?: string
): Promise<DecisionMakerIntel> {
  const evidenceStr = allEvidence.map(e => `[${e.signal_type}] ${e.evidence_text}`).join('\n');
  const socialStr = socialProfiles.map(p => 
    `${p.platform}: ${p.url} | Followers: ${p.followers || 'N/A'} | Bio: ${p.bio || 'N/A'} | Name from bio: ${p.extracted_name || 'N/A'}`
  ).join('\n');

  const isAgency = isAgencyCategory(industry);

  const prompt = `You are an elite sales intelligence analyst. Analyze all the intelligence below about "${companyName}" (${industry}, ${location}) and provide:

KNOWN CONTACT: ${contactName || 'Unknown'} | Email: ${email || 'None'} | Phone: ${phone || 'None'}

INTELLIGENCE DATA:
${evidenceStr || 'No additional intelligence'}

SOCIAL PROFILES:
${socialStr || 'No social profiles found'}

Based on this intelligence, provide:
1. "name": The most likely decision-maker's name (use known contact if available, or extract from social bios, or make a reasonable guess based on the company name for small businesses. If truly unknown, return null).
2. "role": Their likely role (e.g., "Owner", "Founder", "Marketing Director", "General Manager").
3. "best_channel": Which channel is most likely to get a response: "whatsapp" (if we have phone), "email" (if we have verified email), or "linkedin" (if we found their LinkedIn).
4. "personalized_opener": Write a hyper-personalized 2-sentence opening message that references SPECIFIC facts from the intelligence data. ${isAgency ? 'Pitch "Akarsa One" - a multi-client analytics dashboard for agencies.' : 'Pitch "Akarsa Studio" - web development, social media management, and digital marketing services.'}
5. "outreach_angle": A 5-10 word description of the best pitch angle (e.g., "Their 50+ clients need unified reporting", "No website despite 5K Instagram followers").

Return valid JSON with keys: name, role, best_channel, personalized_opener, outreach_angle.`;

  try {
    const result = await callLLM({
      task: 'Identify decision-maker and personalize outreach',
      prompt,
      preferredProvider: 'groq'
    });

    if (result) {
      return {
        name: result.name || contactName || undefined,
        role: result.role || undefined,
        best_channel: result.best_channel || (phone ? 'whatsapp' : 'email'),
        personalized_opener: result.personalized_opener || `Hi! I came across ${companyName} and noticed an opportunity.`,
        outreach_angle: result.outreach_angle || 'General digital growth opportunity'
      };
    }
  } catch (e) {
    console.warn(`[DecisionMaker] LLM analysis failed for ${companyName}:`, e);
  }

  // Fallback
  return {
    name: contactName || undefined,
    best_channel: phone ? 'whatsapp' : 'email',
    personalized_opener: `Hi! I came across ${companyName} and noticed an opportunity to help grow your online presence.`,
    outreach_angle: 'Digital growth opportunity'
  };
}
