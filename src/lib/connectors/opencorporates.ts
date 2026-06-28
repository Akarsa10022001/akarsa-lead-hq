import { Connector, ConnectorEvidence, NormalizedLead, ComplianceBreaker } from './types';

export class OpenCorporatesConnector implements Connector {
  name = 'opencorporates';

  async search(query: { companyName: string }): Promise<any[]> {
    if (!query.companyName || ComplianceBreaker.isDisabled(this.name)) return [];
    
    const apiToken = process.env.OPENCORPORATES_API_TOKEN;
    const tokenQuery = apiToken ? `&api_token=${apiToken}` : '';
    const url = `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(query.companyName)}${tokenQuery}`;
    
    try {
      const response = await fetch(url);
      
      if (response.status === 403 || response.status === 429) {
        ComplianceBreaker.disable(this.name, `Received HTTP ${response.status} ToS block`);
        return [];
      }
      
      if (!response.ok) return [];
      
      const data = await response.json();
      return data.results?.companies || [];
    } catch (e) {
      console.warn("OpenCorporates API error:", e);
      return [];
    }
  }

  async fetchDetail(recordId: string): Promise<any> {
    return null;
  }

  normalize(rawRecord: any): NormalizedLead {
    const comp = rawRecord.company || {};
    return {
      company_name: comp.name || 'Unknown',
      raw_data: rawRecord,
      source_name: this.name,
      evidence: this.getEvidence(rawRecord)
    };
  }

  getEvidence(rawRecord: any): ConnectorEvidence[] {
    const evidence: ConnectorEvidence[] = [];
    const comp = rawRecord.company || {};
    
    if (comp.incorporation_date) {
      const incYear = new Date(comp.incorporation_date).getFullYear();
      const currentYear = new Date().getFullYear();
      const age = currentYear - incYear;
      
      evidence.push({
        category: 'budget', // older companies generally have more stable budgets
        signal_type: 'company_age',
        evidence_text: `Incorporated in ${incYear} (${age} years ago)`,
        evidence_url: comp.opencorporates_url
      });
    }

    if (comp.current_status) {
      evidence.push({
        category: 'reachability',
        signal_type: 'active_status',
        evidence_text: `Corporate status: ${comp.current_status}`
      });
    }

    return evidence;
  }
}
