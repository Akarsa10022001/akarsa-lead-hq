export interface IndustryMapping {
  label: string;
  googleType: string;
  foursquareId: string;
}

export const INDUSTRY_MAP: IndustryMapping[] = [
  { label: 'Digital Marketing Agency', googleType: 'advertising_agency', foursquareId: '11002' },
  { label: 'Social Media Agency', googleType: 'advertising_agency', foursquareId: '11002' },
  { label: 'Advertising Agency', googleType: 'advertising_agency', foursquareId: '11002' },
  { label: 'Branding Studio', googleType: 'advertising_agency', foursquareId: '11002' },
  { label: 'PR Firm', googleType: 'advertising_agency', foursquareId: '11002' },
  { label: 'Marketing Consultant', googleType: 'advertising_agency', foursquareId: '11002' },
  { label: 'SEO Agency', googleType: 'advertising_agency', foursquareId: '11002' },
  { label: 'Web Design Agency', googleType: 'advertising_agency', foursquareId: '11002' },
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
