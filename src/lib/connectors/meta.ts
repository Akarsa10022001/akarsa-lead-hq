import { Connector, ConnectorEvidence, NormalizedLead } from './types';

export class MetaAdLibraryConnector implements Connector {
  name = 'meta_ad_library';

  async search(query: { pageId?: string; keyword?: string }): Promise<{ results: any[]; nextToken?: string }> {
    const token = process.env.META_AD_LIBRARY_TOKEN;
    if (!token) {
      console.warn("META_AD_LIBRARY_TOKEN not set, returning mock data for connector");
      return { results: [] };
    }

    // Example implementation using Meta Graph API for Ad Library
    // This requires a valid access token and appropriate permissions.
    const url = new URL('https://graph.facebook.com/v19.0/ads_archive');
    url.searchParams.append('access_token', token);
    url.searchParams.append('ad_reached_countries', 'IN');
    url.searchParams.append('search_terms', query.keyword || 'restaurant');
    url.searchParams.append('ad_active_status', 'ALL');

    try {
      const response = await fetch(url.toString());
      if (!response.ok) return { results: [] };
      const data = await response.json();
      return { results: data.data || [] };
    } catch (e) {
      console.error(e);
      return { results: [] };
    }
  }

  async fetchDetail(recordId: string): Promise<any> {
    return null;
  }

  normalize(rawRecord: any): NormalizedLead {
    return {
      company_name: rawRecord.page_name || 'Unknown Page',
      raw_data: rawRecord,
      source_name: this.name,
      evidence: this.getEvidence(rawRecord)
    };
  }

  getEvidence(rawRecord: any): ConnectorEvidence[] {
    const evidence: ConnectorEvidence[] = [];
    
    if (rawRecord.ad_active_status === 'ACTIVE') {
      evidence.push({
        category: 'budget',
        signal_type: 'active_ads',
        evidence_text: `Currently running active ads on Meta Platforms`
      });
    }

    return evidence;
  }
}
