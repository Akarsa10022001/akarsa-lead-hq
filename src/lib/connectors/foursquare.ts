import { Connector, ConnectorEvidence, NormalizedLead, ComplianceBreaker } from './types';
import { getFoursquareId } from './industries';

export class FoursquareConnector implements Connector {
  name = 'foursquare';

  async search(query: { location: string; type: string; limit?: number; cursor?: string }): Promise<{ results: any[]; nextToken?: string }> {
    if (ComplianceBreaker.isDisabled(this.name)) return { results: [] };
    
    const apiKey = process.env.FOURSQUARE_API_KEY;
    if (!apiKey) {
      console.warn("[FoursquareConnector] FOURSQUARE_API_KEY missing. Skipping.");
      return { results: [] };
    }

    // Resolve the numeric Foursquare Category ID from the friendly label passed down
    const categoryId = getFoursquareId(query.type);
    
    console.log(`[foursquare] received query.limit = ${query.limit}`);
    // Determine the safe limit (clamp to Foursquare's max 50)
    const safeLimit = Math.min(Math.max(query.limit || 20, 1), 50);
    console.log(`[foursquare] safeLimit after clamp = ${safeLimit}`);
    
    // We search near the provided location, filtering by category
    const url = new URL('https://api.foursquare.com/v3/places/search');
    url.searchParams.append('near', query.location);
    url.searchParams.append('categories', categoryId);
    url.searchParams.append('limit', safeLimit.toString());
    // Request specific fields to minimize payload and ensure we get what we need
    url.searchParams.append('fields', 'fsq_id,name,location,categories,tel,website,rating,stats');
    
    if (query.cursor) {
      url.searchParams.append('cursor', query.cursor);
    }
    
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
        return { results: [] };
      }

      if (!response.ok) return { results: [] };

      let nextToken: string | undefined;
      const linkHeader = response.headers.get('Link');
      if (linkHeader) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (match && match[1]) {
          const nextUrl = new URL(match[1]);
          nextToken = nextUrl.searchParams.get('cursor') || undefined;
        }
      }

      const data = await response.json();
      return { results: data.results || [], nextToken };
    } catch (e) {
      console.warn("[FoursquareConnector] Error:", e);
      return { results: [] };
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
      rating: rawRecord.rating ? rawRecord.rating / 2 : undefined,
      review_count: rawRecord.stats?.total_ratings,
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
