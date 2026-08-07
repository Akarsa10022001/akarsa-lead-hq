import { execSync } from 'child_process';

const CITIES = ['', 'Dubai, UAE', 'London', 'Fake City 123', 'Indore'];
const INDUSTRIES = ['', 'Auto', 'E-Commerce & Retail', 'Dental', 'Digital Marketing Agency', 'Nonexistent Niche 99'];
const EXCLUSIONS = [[], ['123'], Array(50).fill('999')]; // Empty, single, massive

async function runTests() {
  console.log("🚀 Starting Aggressive Consensus Permutation Testing...");
  let total = 0;
  let passed = 0;
  let failed = 0;
  let errors: any[] = [];

  for (const city of CITIES) {
    for (const industry of INDUSTRIES) {
      for (const exclude of EXCLUSIONS) {
        total++;
        const payload = { city, industry, excludeIds: exclude };
        
        try {
          const res = await fetch('http://localhost:3000/api/consensus/scout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          const text = await res.text();
          let data;
          try {
             data = JSON.parse(text);
          } catch(e) {
             throw new Error(`Invalid JSON: ${text.substring(0, 50)}`);
          }

          if (res.status === 500) {
            throw new Error(`500 Internal Server Error: ${data.error || text}`);
          }
          
          if (!data.success && !data.error) {
             throw new Error(`Missing error message on failure`);
          }

          passed++;
        } catch (error: any) {
          failed++;
          errors.push({ payload, error: error.message });
          console.error(`❌ FAILED [City: '${city}' | Ind: '${industry}']: ${error.message}`);
        }
      }
    }
  }

  console.log(`\n📊 RESULTS: ${passed}/${total} passed. ${failed} failed.`);
  if (failed > 0) {
    console.log("First 3 errors:", errors.slice(0, 3));
    process.exit(1);
  } else {
    console.log("✅ ALL EDGE CASES HANDLED FLAWLESSLY.");
  }
}

runTests();
