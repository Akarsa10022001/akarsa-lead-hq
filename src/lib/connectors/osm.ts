import { Connector, ConnectorEvidence, NormalizedLead } from './types';

export class OSMOverpassConnector implements Connector {
  name = 'osm_overpass';

  async search(query: { location: string; tags: string[] }): Promise<any[]> {
    // 1. Geocode the location using free Nominatim to get a fast bounding box
    const nomResponse = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query.location)}&format=json&limit=1`, {
      headers: { 'User-Agent': 'akarsa-lead-hq/1.0 (contact@akarsa.com)' }
    });
    const nomData = await nomResponse.json();
    
    if (!nomData || nomData.length === 0) {
      console.warn("Location not found in Nominatim:", query.location);
      return [];
    }
    
    // Nominatim bbox: [south, north, west, east]
    // Overpass bbox: (south, west, north, east)
    const b = nomData[0].boundingbox;
    const bbox = `${b[0]},${b[2]},${b[1]},${b[3]}`;

    // 2. Query Overpass using the fast bbox
    const tagsString = query.tags.map(tag => `node[${tag}](${bbox});`).join('');
    
    const overpassQuery = `
      [out:json][timeout:15];
      (
        ${tagsString}
      );
      out 10;
    `;

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: `data=${encodeURIComponent(overpassQuery)}`,
    });

    if (!response.ok) {
      throw new Error(`OSM Overpass Error: ${response.status}`);
    }

    const data = await response.json();
    // Return elements that have a name tag
    return data.elements.filter((el: any) => el.tags && el.tags.name);
  }

  async fetchDetail(recordId: string): Promise<any> {
    // OSM usually returns all info in the search query, so this might just return the record or do a specific node lookup
    return null; 
  }

  normalize(rawRecord: any): NormalizedLead {
    const tags = rawRecord.tags || {};
    return {
      company_name: tags.name || 'Unknown Business',
      domain: tags.website || null,
      industry: tags.amenity || tags.shop || 'F&B',
      phone: tags.phone || tags['contact:phone'] || null,
      location: `${tags['addr:street'] || ''} ${tags['addr:city'] || ''}`.trim(),
      raw_data: rawRecord,
      source_name: this.name,
      evidence: this.getEvidence(rawRecord)
    };
  }

  getEvidence(rawRecord: any): ConnectorEvidence[] {
    const evidence: ConnectorEvidence[] = [];
    const tags = rawRecord.tags || {};
    
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
