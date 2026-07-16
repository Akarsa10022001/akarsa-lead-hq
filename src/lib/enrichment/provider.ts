export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface DataProvenance {
  source: string;
  confidence: ConfidenceLevel;
  enriched_at: string;
  query?: string;
}

export interface EnrichmentResult {
  data: {
    linkedin_url?: string;
    email?: string;
    phone?: string;
    instagram_handle?: string;
  };
  provenance: Record<string, DataProvenance>;
}

export interface EnrichmentProvider {
  name: string;
  enrich(target: any): Promise<EnrichmentResult | null>;
}
