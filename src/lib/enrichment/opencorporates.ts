/**
 * OpenCorporates Enrichment
 * Uses the OpenCorporates public API to check for company registration.
 */

export async function checkOpenCorporates(companyName: string, countryCode: string = 'ae'): Promise<{
  isRegistered: boolean;
  registrationName?: string;
  jurisdiction?: string;
  companyNumber?: string;
}> {
  const result = {
    isRegistered: false
  };

  if (!companyName || companyName.length < 3) return result;

  try {
    // We clean the company name (remove LLC, Inc, etc.) for a better search
    const cleanName = companyName
      .replace(/LLC|L\.L\.C|Inc|Ltd|Limited|Corporation|Corp/gi, '')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim();

    // Use OpenCorporates Open Data API (no token required for public basic search, rate limited)
    const url = `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(cleanName)}&jurisdiction_code=${countryCode}&per_page=1`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) return result;

    const data = await response.json();
    
    if (data?.results?.companies && data.results.companies.length > 0) {
      const company = data.results.companies[0].company;
      return {
        isRegistered: true,
        registrationName: company.name,
        jurisdiction: company.jurisdiction_code,
        companyNumber: company.company_number
      };
    }

    return result;
  } catch (error) {
    console.warn('[Enrichment] OpenCorporates API error:', error);
    return result;
  }
}
