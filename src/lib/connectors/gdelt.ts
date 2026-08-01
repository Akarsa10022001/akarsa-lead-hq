import { Connector, ConnectorEvidence, NormalizedLead } from './types';

export class GDELTConnector implements Connector {
  name = 'gdelt';

  async search(query: { keyword: string }): Promise<{ results: any[]; nextToken?: string }> {
    if (!query.keyword) return { results: [] };
    
    // GDELT v2 DOC API - finding recent news articles matching the keyword
    // Using a timeframe of the last 1 week
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query="${encodeURIComponent(query.keyword)}"&mode=artlist&format=json&timespan=1w`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) return { results: [] };
      
      const data = await response.json();
      // FIX: was returning `data.articles || []` (wrong shape — array instead of {results})
      const articles = data.articles || [];
      return { results: articles };
    } catch (e) {
      console.warn("GDELT API error:", e);
      return { results: [] };
    }
  }

  async fetchDetail(recordId: string): Promise<any> {
    return null;
  }

  normalize(rawRecord: any): NormalizedLead {
    // FIX: was always returning company_name: 'Unknown'
    // Now extracts a meaningful company name from article title by stripping common news suffixes
    const title: string = rawRecord?.title || '';
    const url: string = rawRecord?.url || '';

    // Extract domain as company name proxy (e.g. "techcrunch.com" → "Techcrunch")
    let companyName = 'Unknown';
    if (title) {
      // Attempt to extract company name: take first segment before ' - ', ' | ', or ' — '
      const cleaned = title.replace(/\s[-|—]\s.*/g, '').trim();
      companyName = cleaned.length > 5 ? cleaned.substring(0, 80) : title.substring(0, 80);
    }

    // Extract domain from article URL for website signal
    let domain: string | undefined;
    let location: string | undefined;
    try {
      const parsed = new URL(url);
      domain = parsed.hostname.replace(/^www\./, '');
    } catch {}

    return {
      company_name: companyName,
      domain,
      location,
      source_url: url,
      raw_data: rawRecord,
      source_name: this.name,
      evidence: this.getEvidence(rawRecord)
    };
  }

  getEvidence(rawRecord: any): ConnectorEvidence[] {
    const evidence: ConnectorEvidence[] = [];
    
    if (rawRecord.url && rawRecord.title) {
      evidence.push({
        category: 'trigger',
        signal_type: 'news_mention',
        evidence_text: `Recent news coverage: ${rawRecord.title}`,
        evidence_url: rawRecord.url
      });
    }

    // Seendate signal (freshness)
    if (rawRecord.seendate) {
      evidence.push({
        category: 'trigger',
        signal_type: 'news_freshness',
        evidence_text: `Article published: ${rawRecord.seendate}`
      });
    }

    return evidence;
  }
}
