import { scrapeWebsiteEmails } from './lib/connectors/email-scraper';
import { guessEmails } from './lib/connectors/email-guesser';
import { GooglePlacesConnector } from './lib/connectors/google-places';

async function main() {
  console.log("=== Testing Pipeline ===");
  
  // Set the key for the test
  process.env.GOOGLE_PLACES_API_KEY = 'AIzaSyAzRCTkxJXb56y9qRhFiSDPcUbBPGQl0LI';

  console.log("\n0. Testing Google Places API...");
  const googleConnector = new GooglePlacesConnector();
  try {
    const searchRes = await googleConnector.search({
      location: 'Dubai, UAE',
      type: 'restaurant'
    });
    const rawLeads = searchRes.results;
    console.log(`Found ${rawLeads.length} leads from Google Places.`);
    if (rawLeads.length > 0) {
      const firstLead = googleConnector.normalize(rawLeads[0]);
      console.log("First Lead Normalized Data:", {
        company_name: firstLead.company_name,
        domain: firstLead.domain,
        phone: firstLead.phone,
        location: firstLead.location,
        industry: firstLead.industry
      });
      console.log("Evidence signals extracted:", firstLead.evidence.map(e => e.evidence_text));
    }
  } catch (e: any) {
    console.error("Google Places Error:", e.message);
  }

  const testDomain = 'dominos.co.in'; 

  console.log(`\n1. Testing Email Scraper on ${testDomain}...`);
  try {
    const scrapeRes = await scrapeWebsiteEmails(testDomain);
    console.log("Scrape result:", scrapeRes);
  } catch (e: any) {
    console.error("Scrape error:", e.message);
  }

  console.log(`\n2. Testing Pattern Guesser on ${testDomain}...`);
  try {
    const guessRes = await guessEmails(testDomain);
    console.log("Guess result (MX verified):", guessRes.mx_verified);
    if (guessRes.mx_verified) {
      console.log("Candidates:", guessRes.candidates.slice(0, 3), "...");
      console.log("MX Records:", guessRes.mx_records);
    }
  } catch (e: any) {
    console.error("Guess error:", e.message);
  }
}

main().catch(console.error);
