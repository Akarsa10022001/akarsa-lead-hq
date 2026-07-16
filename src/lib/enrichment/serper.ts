import { EnrichmentProvider, EnrichmentResult } from './provider';

export class SerperProvider implements EnrichmentProvider {
  name = 'serper';

  async enrich(target: any): Promise<EnrichmentResult | null> {
    const apiKey = process.env.SERPER_API_KEY;
    const query = `site:linkedin.com/in "${target.contact_name}" "${target.company_name}"`;

    if (!apiKey) {
      console.warn('[Serper] No API key found. Returning mock enrichment.');
      // Mock logic for testing if no key is present
      return {
        data: {
          linkedin_url: `https://linkedin.com/in/${target.contact_name?.replace(/\s+/g, '-').toLowerCase()}`
        },
        provenance: {
          linkedin_url: {
            source: this.name,
            confidence: 'low', // Mocked guess
            enriched_at: new Date().toISOString(),
            query
          }
        }
      };
    }

    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: query, num: 3 })
      });

      const json = await res.json();
      const firstResult = json.organic?.[0];

      if (firstResult && firstResult.link.includes('linkedin.com/in/')) {
        // Simple heuristic: if the title strongly matches the name, confidence is medium. Otherwise low.
        const titleMatch = firstResult.title.toLowerCase().includes(target.contact_name?.toLowerCase() || '');
        
        return {
          data: {
            linkedin_url: firstResult.link
          },
          provenance: {
            linkedin_url: {
              source: this.name,
              confidence: titleMatch ? 'medium' : 'low',
              enriched_at: new Date().toISOString(),
              query
            }
          }
        };
      }
      return null;
    } catch (err) {
      console.error('[Serper] Enrichment failed:', err);
      return null;
    }
  }
}
