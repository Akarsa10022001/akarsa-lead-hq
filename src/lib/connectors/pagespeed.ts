import { Connector, ConnectorEvidence, NormalizedLead } from './types';

export class PageSpeedConnector implements Connector {
  name = 'pagespeed';

  async search(query: { url: string }): Promise<{ results: any[]; nextToken?: string }> {
    if (!query.url) return { results: [] };

    let targetUrl = query.url;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    const apiKey = process.env.PAGESPEED_API_KEY;
    const apiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    apiUrl.searchParams.append('url', targetUrl);
    apiUrl.searchParams.append('strategy', 'mobile');
    apiUrl.searchParams.append('category', 'PERFORMANCE');
    if (apiKey) {
      apiUrl.searchParams.append('key', apiKey);
    }

    try {
      const response = await fetch(apiUrl.toString(), {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        console.warn(`[PageSpeed API] HTTP ${response.status} for ${targetUrl}`);
        return { results: [] };
      }

      const data = await response.json();
      const lighthouse = data?.lighthouseResult;
      if (!lighthouse) return { results: [] };

      const perfScore = Math.round((lighthouse.categories?.performance?.score || 0) * 100);
      const lcpDisplay = lighthouse.audits?.['largest-contentful-paint']?.displayValue || 
                         `${((lighthouse.audits?.['largest-contentful-paint']?.numericValue || 0) / 1000).toFixed(1)}s`;

      return {
        results: [{
          url: targetUrl,
          perfScore,
          lcpDisplay,
          raw: data
        }]
      };
    } catch (error: any) {
      console.error(`[PageSpeed API] Fetch error for ${targetUrl}:`, error.message);
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

    if (rawRecord && rawRecord.perfScore < 50) {
      evidence.push({
        category: 'digital',
        signal_type: 'slow_mobile_site',
        evidence_text: `Mobile PageSpeed ${rawRecord.perfScore}/100, largest contentful paint ${rawRecord.lcpDisplay}`
      });
    }

    return evidence;
  }
}
