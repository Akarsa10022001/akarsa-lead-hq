export interface IndustryMapping {
  label: string;
  googleType: string;
  foursquareId: string;
}

export const INDUSTRY_MAP: IndustryMapping[] = [
  { label: 'Restaurants & Cafés', googleType: 'restaurant', foursquareId: '13065' },
  { label: 'Real Estate', googleType: 'real_estate_agency', foursquareId: '11137' },
  { label: 'Dental & Medical Clinics', googleType: 'dentist', foursquareId: '15000' },
  { label: 'Fitness & Gyms', googleType: 'gym', foursquareId: '18021' },
  { label: 'Beauty & Wellness', googleType: 'beauty_salon', foursquareId: '11062' },
  { label: 'Hotels & Hospitality', googleType: 'lodging', foursquareId: '19014' },
  { label: 'Automotive', googleType: 'car_dealer', foursquareId: '11000' },
  { label: 'Education & Coaching', googleType: 'school', foursquareId: '12009' },
  { label: 'Home & Interiors', googleType: 'furniture_store', foursquareId: '17089' },
  { label: 'Professional Services', googleType: 'lawyer', foursquareId: '11085' },
  { label: 'Retail & Boutiques', googleType: 'clothing_store', foursquareId: '17000' },
  { label: 'Digital Marketing Agency', googleType: 'advertising_agency', foursquareId: '11002' },
  { label: 'Social Media Agency', googleType: 'advertising_agency', foursquareId: '11002' },
  { label: 'Advertising Agency', googleType: 'advertising_agency', foursquareId: '11002' },
  { label: 'Branding Studio', googleType: 'graphic_designer', foursquareId: '11002' },
  { label: 'PR Firm', googleType: 'public_relations_firm', foursquareId: '11002' },
  { label: 'Marketing Consultant', googleType: 'advertising_agency', foursquareId: '11002' },
];

export function getRandomIndustryLabel(): string {
  const index = Math.floor(Math.random() * INDUSTRY_MAP.length);
  return INDUSTRY_MAP[index].label;
}

export function getGoogleType(label: string): string {
  const match = INDUSTRY_MAP.find(i => i.label === label);
  return match ? match.googleType : 'restaurant'; // Default to restaurant
}

export function getFoursquareId(label: string): string {
  const match = INDUSTRY_MAP.find(i => i.label === label);
  return match ? match.foursquareId : '13065'; // Default to Dining
}
