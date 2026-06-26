import { Connector, ConnectorEvidence, NormalizedLead } from './types';

export class CustomTechConnector implements Connector {
  name = 'custom_tech';

  async search(query: { url: string }): Promise<any[]> {
    if (!query.url) return [];
    
    try {
      const targetUrl = query.url.startsWith('http') ? query.url : `https://${query.url}`;
      
      // We implement a gentle timeout fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(targetUrl, { 
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AkarsaBot/1.0; +http://akarsa.com)' }
      });
      clearTimeout(timeoutId);

      if (!response.ok) return [];

      const html = await response.text();
      
      // Simple custom regex for detecting tech stacks
      const techDetected: string[] = [];
      if (html.includes('fbq(') || html.includes('fbevents.js')) techDetected.push('meta_pixel');
      if (html.includes('gtag(') || html.includes('googletagmanager.com')) techDetected.push('google_analytics');
      if (html.includes('shopify.com')) techDetected.push('shopify');
      if (html.includes('wp-content')) techDetected.push('wordpress');

      return [{
        url: targetUrl,
        html_length: html.length,
        tech: techDetected
      }];
    } catch (e) {
      console.warn(`Failed to fetch tech stack for ${query.url}:`, e);
      return [];
    }
  }

  async fetchDetail(recordId: string): Promise<any> {
    return null;
  }

  normalize(rawRecord: any): NormalizedLead {
    return {
      company_name: rawRecord.url, // Usually this enriches an existing lead rather than creating a new one
      domain: rawRecord.url,
      raw_data: rawRecord,
      source_name: this.name,
      evidence: this.getEvidence(rawRecord)
    };
  }

  getEvidence(rawRecord: any): ConnectorEvidence[] {
    const evidence: ConnectorEvidence[] = [];
    const tech = rawRecord.tech || [];
    
    if (tech.includes('shopify') || tech.includes('wordpress')) {
      evidence.push({
        category: 'budget',
        signal_type: 'has_ecommerce',
        evidence_text: `Using ${tech.includes('shopify') ? 'Shopify' : 'WordPress'} for their storefront`
      });
    }

    if (!tech.includes('meta_pixel')) {
      evidence.push({
        category: 'gap',
        signal_type: 'no_pixel',
        evidence_text: `No Meta Pixel detected on the primary website`
      });
    }

    return evidence;
  }
}
