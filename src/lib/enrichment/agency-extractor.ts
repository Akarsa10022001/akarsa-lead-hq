import { callLLM } from '../llm';

export interface AgencySignals {
  manages_multiple_clients?: string | null;
  platforms_managed?: string | null;
  team_size_or_client_count?: string | null;
  reporting_analytics_offering?: string | null;
  source_url: string;
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
