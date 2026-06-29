import { Connector, ConnectorEvidence, NormalizedLead, ComplianceBreaker } from './types';

export class FoursquareConnector implements Connector {
  name = 'foursquare';

  async search(query: { location: string; type: string; limit?: number }): Promise<any[]> {
    if (ComplianceBreaker.isDisabled(this.name)) return [];
    
    const apiKey = process.env.FOURSQUARE_API_KEY;
    if (!apiKey) {
      console.warn("[FoursquareConnector] FOURSQUARE_API_KEY missing. Skipping.");
      return [];
    }

    // Foursquare category mapping (simplified). e.g., 'restaurant' -> '13065' (Dining and Drinking)
    const categoryMap: Record<string, string> = {
      'restaurant': '13065',
      'retail': '17000',
      'software': '11128',
      'hotel': '19014',
      'cafe': '13032'
    };
    
    // Attempt to map category or default to dining
    const categoryId = categoryMap[query.type.toLowerCase()] || '13065';
    
    // Determine the safe limit (clamp to Foursquare's max 50)
    const safeLimit = Math.min(Math.max(query.limit || 20, 1), 50);
    
    // We search near the provided location, filtering by category
    const url = new URL('https://api.foursquare.com/v3/places/search');
    url.searchParams.append('near', query.location);
    url.searchParams.append('categories', categoryId);
    url.searchParams.append('limit', safeLimit.toString());
    // Request specific fields to minimize payload and ensure we get what we need
    url.searchParams.append('fields', 'fsq_id,name,location,categories,tel,website,rating');
    
    console.log(`[FoursquareConnector] Outbound URL: ${url.toString()}`);

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': apiKey,
          'Accept': 'application/json'
        }
      });

      if (response.status === 403 || response.status === 429) {
        ComplianceBreaker.disable(this.name, `Received HTTP ${response.status} from Foursquare`);
        return [];
      }

      if (!response.ok) return [];

      const data = await response.json();
      return data.results || [];
    } catch (e) {
      console.warn("[FoursquareConnector] Error:", e);
      return [];
    }
  }

  async fetchDetail(recordId: string): Promise<any> {
    return null; // The search endpoint with fields parameter usually provides enough data
  }

  normalize(rawRecord: any): NormalizedLead {
    const categories = rawRecord.categories || [];
    const primaryCategory = categories.length > 0 ? categories[0].name : 'Venue';
    
    // Format location
    let locationStr = 'Unknown Location';
    if (rawRecord.location) {
      const parts = [];
      if (rawRecord.location.address) parts.push(rawRecord.location.address);
      if (rawRecord.location.locality) parts.push(rawRecord.location.locality);
      if (rawRecord.location.region) parts.push(rawRecord.location.region);
      if (parts.length > 0) locationStr = parts.join(', ');
    }

    return {
      company_name: rawRecord.name || 'Unknown Business',
      domain: rawRecord.website || null,
      industry: primaryCategory,
      phone: rawRecord.tel || null,
      location: locationStr,
      raw_data: rawRecord,
      source_name: this.name,
      evidence: this.getEvidence(rawRecord)
    };
  }

  getEvidence(rawRecord: any): ConnectorEvidence[] {
    const evidence: ConnectorEvidence[] = [];
    
    if (rawRecord.rating) {
      evidence.push({
        category: 'budget', // higher rating usually indicates more established/premium venues
        signal_type: 'foursquare_rating',
        evidence_text: `Foursquare rating: ${rawRecord.rating}/10`
      });
    }

    if (rawRecord.website) {
      evidence.push({
        category: 'reachability',
        signal_type: 'website_found',
        evidence_text: `Website published on Foursquare: ${rawRecord.website}`
      });
    }

    if (rawRecord.tel) {
      evidence.push({
        category: 'reachability',
        signal_type: 'phone_found',
        evidence_text: `Phone number listed on Foursquare`
      });
    }

    return evidence;
  }
}
