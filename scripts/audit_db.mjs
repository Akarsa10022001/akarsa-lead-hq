import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Read .env.local raw file directly
const envContent = readFileSync('.env.local', 'utf-8');
let supabaseUrl = '';
let supabaseKey = '';

for (const line of envContent.split('\n')) {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
    supabaseUrl = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
  }
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
    supabaseKey = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
  }
}

if (!supabaseUrl || !supabaseKey) {
  console.error('Could not find Supabase URL or Key in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
  console.log('====================================================');
  console.log('   AKARSA LEAD HQ — LIVE SUPABASE DATABASE AUDIT   ');
  console.log('====================================================\n');

  // 1. Total Leads
  const { data: leads, error } = await supabase
    .from('leads')
    .select('id,company_name,industry,location,email,phone,phone_e164,domain,score_grade,quality_score,created_at')
    .limit(5000);

  if (error) {
    console.error('Supabase Error:', error);
    return;
  }

  console.log(`📊 TOTAL REAL LEADS IN SUPABASE: ${leads.length}`);

  // 2. Grade Breakdown
  const grades = { A: 0, B: 0, C: 0, D: 0, Unknown: 0 };
  let hasEmail = 0;
  let hasPhone = 0;
  let hasWebsite = 0;
  let hasBoth = 0;

  leads.forEach(l => {
    const g = l.score_grade || 'Unknown';
    grades[g] = (grades[g] || 0) + 1;

    if (l.email) hasEmail++;
    if (l.phone || l.phone_e164) hasPhone++;
    if (l.domain) hasWebsite++;
    if (l.email && (l.phone || l.phone_e164)) hasBoth++;
  });

  console.log('\n🏆 REAL GRADE BREAKDOWN:');
  console.log(`   Grade A (Top High-Conversion): ${grades.A}`);
  console.log(`   Grade B (Solid Prospects): ${grades.B}`);
  console.log(`   Grade C (Needs Enrichment): ${grades.C}`);
  console.log(`   Grade D (Basic Listings): ${grades.D}`);

  console.log('\n📞 REAL VERIFIED CONTACT DATA:');
  console.log(`   - Leads with Scraped Email: ${hasEmail}`);
  console.log(`   - Leads with Phone Number: ${hasPhone}`);
  console.log(`   - Leads with Website: ${hasWebsite}`);
  console.log(`   - High-Value Leads (BOTH Email + Phone): ${hasBoth}`);

  // 3. Raw records
  const { data: rawRecords } = await supabase.from('raw_records').select('source_name').limit(5000);
  if (rawRecords) {
    const sources = {};
    rawRecords.forEach(r => {
      const s = r.source_name || 'other';
      sources[s] = (sources[s] || 0) + 1;
    });
    console.log('\n🛰️ DISCOVERY LAUNCH PADS INGESTED RECORDS:');
    Object.entries(sources).forEach(([src, count]) => {
      console.log(`   - ${src}: ${count} raw records`);
    });
  }

  // 4. Samples
  const recent = leads.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  console.log('\n🔥 RECENT REAL LEADS SAVED IN SUPABASE:');
  recent.forEach((l, i) => {
    console.log(`\n  [Lead #${i + 1}] ${l.company_name}`);
    console.log(`   Industry: ${l.industry || 'General'} | Location: ${l.location?.slice(0, 50)}`);
    console.log(`   Email: ${l.email || 'None'} | Phone: ${l.phone || l.phone_e164 || 'None'}`);
    console.log(`   Score: ${l.quality_score} (Grade ${l.score_grade}) | Created: ${l.created_at}`);
  });

  console.log('\n====================================================');
}

runAudit();
