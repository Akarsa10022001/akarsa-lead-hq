import { Connector, ConnectorEvidence, NormalizedLead } from './types';

export class OSMOverpassConnector implements Connector {
  name = 'osm_overpass';

  async search(query: { location: string; tags: string[] }): Promise<any[]> {
    // We bypass Overpass API entirely because it constantly throws 504 Gateway Timeouts on free tiers.
    // Instead, we use Nominatim's POI search which is highly reliable.
    
    // Parse out the primary amenity from tags (e.g. "amenity=restaurant" -> "restaurant")
    let primaryTag = "restaurant";
    if (query.tags && query.tags.length > 0) {
      const match = query.tags[0].match(/=(.*)$/);
      if (match) primaryTag = match[1];
    }

    const searchQuery = `${primaryTag} in ${query.location}`;
    
    const nomResponse = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=15&extratags=1`, {
      headers: { 'User-Agent': 'akarsa-lead-hq/1.0 (be@akarsaone.xyz)' }
    });
    
    if (!nomResponse.ok) {
      throw new Error(`OSM Nominatim Error: ${nomResponse.status}`);
    }

    const data = await nomResponse.json();
    return data;
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
