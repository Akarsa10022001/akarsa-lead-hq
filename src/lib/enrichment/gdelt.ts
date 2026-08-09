/**
 * GDELT Enrichment
 * Uses the GDELT DOC 2.0 API to check for news mentions of the company.
 */

export async function checkGdeltNews(companyName: string): Promise<{
  newsMentions: number;
  latestArticleUrl?: string;
}> {
  const result = {
    newsMentions: 0
  };

  // Skip tiny generic names
  if (!companyName || companyName.length < 5) return result;

  try {
    const cleanName = companyName.replace(/LLC|Inc|Ltd/gi, '').trim();
    // Query GDELT for the exact phrase over the last 3 months
    const query = `"${cleanName}"`;
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=5`;
    
    const response = await fetch(url);
    if (!response.ok) return result;

    const data = await response.json();
    
    if (data && data.articles && data.articles.length > 0) {
      return {
        newsMentions: data.articles.length,
        latestArticleUrl: data.articles[0].url
      };
    }

    return result;
  } catch (error) {
    console.warn('[Enrichment] GDELT API error:', error);
    return result;
  }
}
