export interface ConnectorEvidence {
  category: 'budget' | 'gap' | 'reachability' | 'trigger';
  signal_type: string;
  evidence_text: string;
  evidence_url?: string;
}

export interface NormalizedLead {
  company_name: string;
  domain?: string;
  industry?: string;
  contact_name?: string;
  contact_title?: string;
  email?: string;
  phone?: string;
  location?: string;
  raw_data: any;
  source_name: string;
  evidence: ConnectorEvidence[];
}

export interface Connector {
  /**
   * Identifies the connector (e.g. 'osm', 'meta_ad_library')
   */
  name: string;
  
  /**
   * Search the data source using a given query/location/industry
   */
  search(query: any): Promise<any[]>;

  /**
   * Fetch full details for a specific record if needed
   */
  fetchDetail(recordId: string | any): Promise<any>;

  /**
   * Transform raw data into the standardized NormalizedLead structure
   */
  normalize(rawRecord: any): NormalizedLead;

  /**
   * Extract verification signals/chips from the record
   */
  getEvidence(rawRecord: any): ConnectorEvidence[];
}

/**
 * Compliance Circuit Breaker
 * Tracks when a source enforces ToS blocks (403/429) and auto-disables it globally
 * to ensure zero violations.
 */
export class ComplianceBreaker {
  private static disabledSources: Set<string> = new Set();

  static disable(sourceName: string, reason: string) {
    console.warn(`[COMPLIANCE] Auto-disabling source '${sourceName}' due to: ${reason}`);
    this.disabledSources.add(sourceName);
  }

  static isDisabled(sourceName: string): boolean {
    return this.disabledSources.has(sourceName);
  }
}
