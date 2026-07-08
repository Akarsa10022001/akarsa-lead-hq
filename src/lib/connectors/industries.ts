export interface IndustryMapping {
  label: string;
  googleType: string;
  foursquareId: string;
  isAgency?: boolean; // If true, pitch Akarsa One. Otherwise, pitch general Akarsa Studio services.
}

export const INDUSTRY_MAP: IndustryMapping[] = [
  // === General Industries (pitch Akarsa Studio services) ===
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

  // === Agency Industries (pitch Akarsa One) ===
  { label: 'Digital Marketing Agency', googleType: 'advertising_agency', foursquareId: '11002', isAgency: true },
  { label: 'Social Media Agency', googleType: 'advertising_agency', foursquareId: '11002', isAgency: true },
  { label: 'Advertising Agency', googleType: 'advertising_agency', foursquareId: '11002', isAgency: true },
  { label: 'Branding Studio', googleType: 'advertising_agency', foursquareId: '11002', isAgency: true },
  { label: 'PR Firm', googleType: 'advertising_agency', foursquareId: '11002', isAgency: true },
  { label: 'Marketing Consultant', googleType: 'advertising_agency', foursquareId: '11002', isAgency: true },
  { label: 'SEO Agency', googleType: 'advertising_agency', foursquareId: '11002', isAgency: true },
  { label: 'Web Design Agency', googleType: 'advertising_agency', foursquareId: '11002', isAgency: true },
];

export function getRandomIndustryLabel(): string {
  const index = Math.floor(Math.random() * INDUSTRY_MAP.length);
  return INDUSTRY_MAP[index].label;
}

export function getGoogleType(label: string): string {
  const match = INDUSTRY_MAP.find(i => i.label === label);
  return match ? match.googleType : 'restaurant';
}

export function getFoursquareId(label: string): string {
  const match = INDUSTRY_MAP.find(i => i.label === label);
  return match ? match.foursquareId : '13065';
}

export function isAgencyCategory(label: string): boolean {
  const match = INDUSTRY_MAP.find(i => i.label === label);
  return match?.isAgency === true;
}

/** For agency categories, use Text Search keyword instead of type filter */
export function getTextSearchQuery(label: string): string | null {
  if (!isAgencyCategory(label)) return null;
  // Map label to a good Google Text Search keyword
  const keywordMap: Record<string, string> = {
    'Digital Marketing Agency': 'digital marketing agency',
    'Social Media Agency': 'social media marketing agency',
    'Advertising Agency': 'advertising agency',
    'Branding Studio': 'branding agency',
    'PR Firm': 'public relations agency',
    'Marketing Consultant': 'marketing consultant firm',
    'SEO Agency': 'SEO agency',
    'Web Design Agency': 'web design agency',
  };
  return keywordMap[label] || 'marketing agency';
}
