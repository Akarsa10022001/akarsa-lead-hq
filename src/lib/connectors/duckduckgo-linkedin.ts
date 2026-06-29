import { Connector, ConnectorEvidence, NormalizedLead } from './types';

export class DuckDuckGoLinkedInConnector implements Connector {
  name = 'duckduckgo_linkedin';

  async search(query: { companyName: string; location?: string }): Promise<{ results: any[]; nextToken?: string }> {
    if (!query.companyName) return { results: [] };
    
    // We scrape DDG HTML (no JS needed)
    // The query: site:linkedin.com/in "Company Name" founder OR ceo
    const locStr = query.location ? ` "${query.location}"` : '';
    const q = `site:linkedin.com/in "${query.companyName}"${locStr} (founder OR ceo OR owner)`;
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      if (!response.ok) return { results: [] };
      
      const html = await response.text();
      
      // Simple regex to extract the first result title
      const titleRegex = /<a class="result__url" href="[^"]+">([^<]+)<\/a>/i;
      const match = html.match(titleRegex);
      
      if (match && match[1]) {
        let nameRaw = match[1].trim();
        // LinkedIn titles are usually "First Last - Founder - Company | LinkedIn"
        // Let's grab just the name part (everything before the first dash or pipe)
        let cleanName = nameRaw.split('-')[0].split('|')[0].trim();
        // Remove "LinkedIn" if it somehow snuck in
        cleanName = cleanName.replace(/LinkedIn/i, '').trim();
        
        if (cleanName && cleanName.length > 2) {
          return { results: [{ contact_name: cleanName, raw_title: nameRaw }] };
        }
      }
      
      return { results: [] };
    } catch (e) {
      console.warn("DDG Scrape error:", e);
      return { results: [] };
    }
  }

  async fetchDetail(recordId: string): Promise<any> {
    return null;
  }

  normalize(rawRecord: any): NormalizedLead {
    return {
      company_name: 'Unknown',
      domain: null,
      raw_data: rawRecord,
      source_name: this.name,
      evidence: this.getEvidence(rawRecord)
    };
  }

  getEvidence(rawRecord: any): ConnectorEvidence[] {
    const evidence: ConnectorEvidence[] = [];
    if (rawRecord.contact_name) {
      evidence.push({
        category: 'reachability',
        signal_type: 'founder_name',
        evidence_text: `Found founder/owner name via LinkedIn: ${rawRecord.contact_name}`
      });
    }
    return evidence;
  }
}
