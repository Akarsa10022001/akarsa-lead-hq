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
      return data.articles || [];
    } catch (e) {
      console.warn("GDELT API error:", e);
      return { results: [] };
    }
  }

  async fetchDetail(recordId: string): Promise<any> {
    return null;
  }

  normalize(rawRecord: any): NormalizedLead {
    return {
      company_name: 'Unknown',
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

    return evidence;
  }
}
