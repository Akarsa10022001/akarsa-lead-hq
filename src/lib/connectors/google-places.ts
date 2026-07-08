import { Connector, ConnectorEvidence, NormalizedLead } from './types';
import { getGoogleType, getTextSearchQuery, isAgencyCategory } from './industries';

/**
 * Google Places API Connector (New)
 * Uses the Google Places API to find real businesses with phone numbers, websites, and ratings.
 * For agency categories, uses Text Search API (keyword-based) for much better accuracy.
 * For general categories, uses Nearby Search API (type-based).
 * Free tier: 5,000 requests/month under "Pro" SKU.
 * Requires GOOGLE_PLACES_API_KEY environment variable.
 */
export class GooglePlacesConnector implements Connector {
  name = 'google_places';

  async search(query: { location: string; type: string; radius?: number; limit?: number; pageToken?: string }): Promise<{ results: any[]; nextToken?: string }> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      console.warn('[GooglePlaces] GOOGLE_PLACES_API_KEY not set. Skipping.');
      return { results: [] };
    }

    const mappedType = getGoogleType(query.type);
    const textSearchKeyword = getTextSearchQuery(query.type);

    let results: any[] = [];
    let next_page_token: string | undefined;

    if (query.pageToken) {
      // Pagination works the same for both Text Search and Nearby Search
      console.log(`[GooglePlaces] Using pageToken: ${query.pageToken}`);
      const paginationUrl = `https://maps.googleapis.com/maps/api/place/${textSearchKeyword ? 'textsearch' : 'nearbysearch'}/json?pagetoken=${query.pageToken}&key=${apiKey}`;
      const paginationRes = await fetch(paginationUrl);
      const paginationData = await paginationRes.json();
      
      if (paginationData.status === 'INVALID_REQUEST') {
        console.log(`[GooglePlaces] Token not ready, waiting 2s...`);
        await new Promise(r => setTimeout(r, 2000));
        const retryRes = await fetch(paginationUrl);
        const retryData = await retryRes.json();
        if (retryData.status === 'OK') {
          results = retryData.results || [];
          next_page_token = retryData.next_page_token;
        }
      } else if (paginationData.status === 'OK') {
        results = paginationData.results || [];
        next_page_token = paginationData.next_page_token;
      }
    } else if (textSearchKeyword) {
      // === AGENCY CATEGORIES: Use Text Search API (keyword-based, much more accurate) ===
      const textQuery = `${textSearchKeyword} in ${query.location}`;
      const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(textQuery)}&key=${apiKey}`;
      console.log(`[GooglePlaces] Text Search for agencies: "${textQuery}"`);
      
      const textRes = await fetch(textSearchUrl);
      const textData = await textRes.json();

      if (textData.status === 'OK') {
        results = textData.results || [];
        next_page_token = textData.next_page_token;
        console.log(`[GooglePlaces] Text Search found ${results.length} results`);
      } else {
        console.warn(`[GooglePlaces] Text Search status: ${textData.status}`);
      }
    } else {
      // === GENERAL CATEGORIES: Use Nearby Search API (type-based) ===
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query.location)}&key=${apiKey}`;
      const geoRes = await fetch(geocodeUrl);
      const geoData = await geoRes.json();
      
      if (!geoData.results || geoData.results.length === 0) {
        console.warn(`[GooglePlaces] Could not geocode location: ${query.location}`);
        return { results: [] };
      }

      const { lat, lng } = geoData.results[0].geometry.location;
      const radius = query.radius || 5000;
      const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${encodeURIComponent(mappedType)}&key=${apiKey}`;
      
      const nearbyRes = await fetch(nearbyUrl);
      const nearbyData = await nearbyRes.json();

      if (nearbyData.status === 'OK') {
        results = nearbyData.results || [];
        next_page_token = nearbyData.next_page_token;
      }
    }
    
    // Step 3: Fetch Place Details for each result (to get phone, website)
    const detailedResults: any[] = [];

    // Process up to the requested limit
    const safeLimit = Math.min(Math.max(query.limit || 20, 1), 50);
    for (const place of results.slice(0, safeLimit)) {
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

    return { results: detailedResults, nextToken: next_page_token };
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
      rating: rawRecord.rating,
      review_count: rawRecord.user_ratings_total,
      raw_data: rawRecord,
      source_name: this.name,
      source_url: rawRecord.url || `https://www.google.com/maps/place/?q=place_id:${rawRecord.place_id}`,
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
