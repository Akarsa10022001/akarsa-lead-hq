import { Connector, ConnectorEvidence, NormalizedLead } from './types';

export class WhoisConnector implements Connector {
  name = 'whois';

  async search(query: { domain: string }): Promise<any[]> {
    if (!query.domain) return [];
    
    // RDAP (Registration Data Access Protocol) is the modern, free replacement for WHOIS
    // We use a public RDAP bootstrap to find domain info
    const url = `https://rdap.org/domain/${encodeURIComponent(query.domain)}`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) return [];
      
      const data = await response.json();
      return [data]; // RDAP returns a single object
    } catch (e) {
      console.warn("WHOIS/RDAP API error:", e);
      return [];
    }
  }

  async fetchDetail(recordId: string): Promise<any> {
    return null;
  }

  normalize(rawRecord: any): NormalizedLead {
    return {
      company_name: 'Unknown',
      domain: rawRecord.ldhName,
      raw_data: rawRecord,
      source_name: this.name,
      evidence: this.getEvidence(rawRecord)
    };
  }

  getEvidence(rawRecord: any): ConnectorEvidence[] {
    const evidence: ConnectorEvidence[] = [];
    
    // Check for domain registration date in RDAP events
    const events = rawRecord.events || [];
    const registrationEvent = events.find((e: any) => e.eventAction === 'registration');
    
    if (registrationEvent && registrationEvent.eventDate) {
      const regYear = new Date(registrationEvent.eventDate).getFullYear();
      const currentYear = new Date().getFullYear();
      const age = currentYear - regYear;
      
      evidence.push({
        category: 'budget', // older domains usually mean established business
        signal_type: 'domain_age',
        evidence_text: `Domain registered in ${regYear} (${age} years ago)`
      });
    }

    return evidence;
  }
}
