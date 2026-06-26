import { Connector, ConnectorEvidence, NormalizedLead } from './types';

export class OSMOverpassConnector implements Connector {
  name = 'osm_overpass';

  async search(query: { location: string; tags: string[] }): Promise<any[]> {
    // Basic Overpass QL query building
    // e.g., area["name"="Indore"]->.searchArea; node["amenity"="restaurant"](area.searchArea); out json;
    
    // For safety and rate limits, we use a small radius around a coordinate if location isn't easily geocoded,
    // but here we can just use the area search.
    const tagsString = query.tags.map(tag => `node[${tag}](area.searchArea);`).join('');
    
    const overpassQuery = `
      [out:json][timeout:25];
      area["name"="${query.location}"]->.searchArea;
      (
        ${tagsString}
      );
      out body;
      >;
      out skel qt;
    `;

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: overpassQuery,
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
