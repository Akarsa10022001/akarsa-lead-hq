/**
 * Reddit Intent Enrichment
 * Searches Reddit for public posts indicating intent or need for services in the lead's industry.
 */

export async function checkRedditIntent(industry: string, location: string): Promise<{
  intentSignals: number;
  topPostUrl?: string;
}> {
  const result = {
    intentSignals: 0
  };

  if (!industry) return result;

  try {
    // Determine search term based on industry
    let query = '';
    const ind = industry.toLowerCase();
    
    if (ind.includes('restaurant') || ind.includes('cafe') || ind.includes('food')) {
      query = `"looking for a restaurant" OR "recommend a cafe" OR "where to eat"`;
    } else if (ind.includes('dental') || ind.includes('doctor') || ind.includes('clinic')) {
      query = `"looking for a dentist" OR "recommend a doctor" OR "need a clinic"`;
    } else if (ind.includes('auto') || ind.includes('car') || ind.includes('mechanic')) {
      query = `"car repair" OR "need a mechanic" OR "recommend a garage"`;
    } else if (ind.includes('real estate') || ind.includes('property')) {
      query = `"looking to buy" OR "need an agent" OR "renting in"`;
    } else {
      query = `"looking for a ${ind}" OR "recommend a ${ind}"`;
    }

    if (location) {
      query += ` ${location}`;
    }

    // Use Reddit JSON API (unauthenticated search is severely rate-limited, but works for basic queries)
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=3`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'AkarsaLeadHQ/1.0 (Lead Enrichment Service)'
      }
    });

    if (!response.ok) return result;

    const data = await response.json();
    
    if (data?.data?.children && data.data.children.length > 0) {
      return {
        intentSignals: data.data.children.length,
        topPostUrl: `https://reddit.com${data.data.children[0].data.permalink}`
      };
    }

    return result;
  } catch (error) {
    console.warn('[Enrichment] Reddit API error:', error);
    return result;
  }
}
