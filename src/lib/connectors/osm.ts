import { Connector, ConnectorEvidence, NormalizedLead } from './types';

export class OSMOverpassConnector implements Connector {
  name = 'osm_overpass';

  async search(query: { location: string; tags: string[]; limit?: number }): Promise<{ results: any[]; nextToken?: string }> {
    // We bypass Overpass API entirely because it constantly throws 504 Gateway Timeouts on free tiers.
    // Instead, we use Nominatim's POI search which is highly reliable.
    
    // Parse out the primary amenity from tags (e.g. "amenity=restaurant" -> "restaurant")
    let primaryTag = "restaurant";
    if (query.tags && query.tags.length > 0) {
      const match = query.tags[0].match(/=(.*)$/);
      if (match) primaryTag = match[1];
    }

    let currentLocation = query.location;
    let allResults: any[] = [];
    
    // Auto-expansion loop: if we find < 5 results, widen the search net by dropping the most specific local term
    // Apply requested limit or default 15, max out at 50 for Nominatim
    const limit = Math.min(Math.max(query.limit || 15, 1), 50);

    while (currentLocation && allResults.length < 5) {
      const searchQuery = `${primaryTag} in ${currentLocation.trim()}`;
      
      const nomResponse = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=${limit}&extratags=1`, {
        headers: { 'User-Agent': 'akarsa-lead-hq/1.0 (be@akarsaone.xyz)' }
      });
      
      if (!nomResponse.ok) {
        throw new Error(`OSM Nominatim Error: ${nomResponse.status}`);
      }

      const data = await nomResponse.json();
      allResults = [...allResults, ...data];
      
      // Deduplicate results based on osm_id
      const uniqueResults = [];
      const seen = new Set();
      for (const item of allResults) {
        if (!seen.has(item.osm_id)) {
          seen.add(item.osm_id);
          uniqueResults.push(item);
        }
      }
      allResults = uniqueResults;
      
      if (allResults.length >= 5) {
        break; // We have enough leads
      }
      
      // Widen the location by removing the first part before a comma
      const parts = currentLocation.split(',');
      if (parts.length > 1) {
        currentLocation = parts.slice(1).join(',').trim();
        console.log(`[Discovery] OSM returned < 5 leads. Auto-expanding search net to: ${currentLocation}`);
      } else {
        break; // Cannot widen further
      }
    }

    return { results: allResults };
  }

  async fetchDetail(recordId: string): Promise<any> {
    return null; 
  }

  normalize(rawRecord: any): NormalizedLead {
    const tags = rawRecord.extratags || {};
    return {
      company_name: rawRecord.name || 'Unknown Business',
      domain: tags.website || null,
      industry: rawRecord.type || tags.amenity || tags.shop || 'F&B',
      phone: tags.phone || tags['contact:phone'] || null,
      location: rawRecord.display_name?.split(',').slice(0, 3).join(',') || 'Unknown',
      raw_data: rawRecord,
      source_name: this.name,
      evidence: this.getEvidence(rawRecord)
    };
  }

  getEvidence(rawRecord: any): ConnectorEvidence[] {
    const evidence: ConnectorEvidence[] = [];
    const tags = rawRecord.extratags || {};
    
    if (tags.website) {
      evidence.push({
        category: 'reachability',
        signal_type: 'website_found',
        evidence_text: `Website published on OpenStreetMap: ${tags.website}`
      });
    }

    if (tags.phone || tags['contact:phone']) {
      evidence.push({
        category: 'reachability',
        signal_type: 'phone_found',
        evidence_text: `Phone number listed on OSM`
      });
    }

    return evidence;
  }
}
