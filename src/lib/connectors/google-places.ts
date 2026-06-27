import { Connector, ConnectorEvidence, NormalizedLead } from './types';

/**
 * Google Places API Connector (New)
 * Uses the Google Places API to find real businesses with phone numbers, websites, and ratings.
 * Free tier: 5,000 requests/month under "Pro" SKU.
 * Requires GOOGLE_PLACES_API_KEY environment variable.
 */
export class GooglePlacesConnector implements Connector {
  name = 'google_places';

  async search(query: { location: string; type: string; radius?: number }): Promise<any[]> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      console.warn('[GooglePlaces] GOOGLE_PLACES_API_KEY not set. Skipping.');
      return [];
    }

    // Step 1: Geocode the location name to lat/lng
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query.location)}&key=${apiKey}`;
    const geoRes = await fetch(geocodeUrl);
    const geoData = await geoRes.json();
    
    console.log("[GooglePlaces Debug] Geocode Response:", geoData);

    if (!geoData.results || geoData.results.length === 0) {
      console.warn(`[GooglePlaces] Could not geocode location: ${query.location}`);
      return [];
    }

    const { lat, lng } = geoData.results[0].geometry.location;

    // Step 2: Nearby Search for businesses
    const radius = query.radius || 5000; // 5km default
    const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${encodeURIComponent(query.type)}&key=${apiKey}`;
    
    const nearbyRes = await fetch(nearbyUrl);
    const nearbyData = await nearbyRes.json();

    if (nearbyData.status !== 'OK' && nearbyData.status !== 'ZERO_RESULTS') {
      console.error(`[GooglePlaces] Nearby Search Error: ${nearbyData.status} - ${nearbyData.error_message || ''}`);
      return [];
    }

    const results = nearbyData.results || [];
    
    // Step 3: Fetch Place Details for each result (to get phone, website)
    const detailedResults: any[] = [];

    // Process up to 10 to stay within free tier limits
    for (const place of results.slice(0, 10)) {
      try {
        const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,international_phone_number,website,formatted_address,rating,user_ratings_total,business_status,types,url&key=${apiKey}`;
        
        const detailRes = await fetch(detailUrl);
        const detailData = await detailRes.json();

        if (detailData.status === 'OK' && detailData.result) {
          detailedResults.push({
            ...detailData.result,
            place_id: place.place_id,
            _source: 'google_places'
          });
        }
      } catch (err) {
        console.warn(`[GooglePlaces] Failed to fetch details for ${place.name}: ${err}`);
      }
    }

    return detailedResults;
  }

  async fetchDetail(placeId: string): Promise<any> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return null;

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_phone_number,international_phone_number,website,formatted_address,rating,user_ratings_total,business_status,types,url&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.status === 'OK' ? data.result : null;
  }

  normalize(rawRecord: any): NormalizedLead {
    const types = rawRecord.types || [];
    const industry = types.includes('restaurant') ? 'Restaurant' :
                     types.includes('cafe') ? 'Cafe' :
                     types.includes('bar') ? 'Bar' :
                     types.includes('store') ? 'Store' :
                     types.includes('beauty_salon') ? 'Beauty Salon' :
                     types.includes('gym') ? 'Gym' :
                     types.includes('spa') ? 'Spa' :
                     types.includes('lodging') ? 'Hotel' :
                     types.find((t: string) => t !== 'point_of_interest' && t !== 'establishment') || 'Business';

    return {
      company_name: rawRecord.name || 'Unknown Business',
      domain: rawRecord.website || null,
      industry,
      phone: rawRecord.international_phone_number || rawRecord.formatted_phone_number || null,
      location: rawRecord.formatted_address || 'Unknown',
      raw_data: rawRecord,
      source_name: this.name,
      evidence: this.getEvidence(rawRecord)
    };
  }

  getEvidence(rawRecord: any): ConnectorEvidence[] {
    const evidence: ConnectorEvidence[] = [];

    if (rawRecord.website) {
      evidence.push({
        category: 'reachability',
        signal_type: 'website_found',
        evidence_text: `Website from Google Maps: ${rawRecord.website}`
      });
    } else {
      evidence.push({
        category: 'gap',
        signal_type: 'no_website',
        evidence_text: 'No website listed on Google Maps — potential client for web services'
      });
    }

    if (rawRecord.formatted_phone_number || rawRecord.international_phone_number) {
      evidence.push({
        category: 'reachability',
        signal_type: 'phone_found',
        evidence_text: `Phone from Google Maps: ${rawRecord.international_phone_number || rawRecord.formatted_phone_number}`
      });
    }

    if (rawRecord.rating && rawRecord.user_ratings_total) {
      const ratingSignal = rawRecord.rating < 3.5 ? 'low_rating' : rawRecord.rating >= 4.5 ? 'high_rating' : 'average_rating';
      evidence.push({
        category: 'trigger',
        signal_type: ratingSignal,
        evidence_text: `Google rating: ${rawRecord.rating}/5 (${rawRecord.user_ratings_total} reviews)`
      });
    }

    if (rawRecord.business_status && rawRecord.business_status !== 'OPERATIONAL') {
      evidence.push({
        category: 'trigger',
        signal_type: 'business_status_issue',
        evidence_text: `Business status: ${rawRecord.business_status}`
      });
    }

    return evidence;
  }
}
