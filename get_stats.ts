import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log("=== COLUMNS ===");
  const { data: limit1 } = await supabase.from('leads').select('*').limit(1);
  if (limit1 && limit1.length > 0) {
    console.log(Object.keys(limit1[0]).join(', '));
  } else {
    console.log("No leads found or error.");
  }

  console.log("\n=== DISCOVERY CURSOR ===");
  const { data: cursor } = await supabase.from('discovery_cursor').select('*').limit(2);
  console.log(JSON.stringify(cursor, null, 2));

  console.log("\n=== COUNTS ===");
  const countQueries = [
    { name: 'total', q: supabase.from('leads').select('id', { count: 'exact', head: true }) },
    { name: 'has_email', q: supabase.from('leads').select('id', { count: 'exact', head: true }).not('email', 'is', null) },
    { name: 'verified_email', q: supabase.from('leads').select('id', { count: 'exact', head: true }).eq('email_verified', true) },
    { name: 'has_phone', q: supabase.from('leads').select('id', { count: 'exact', head: true }).not('phone_e164', 'is', null) },
    { name: 'has_contact_name', q: supabase.from('leads').select('id', { count: 'exact', head: true }).not('contact_name', 'is', null) },
    { name: 'has_rating', q: supabase.from('leads').select('id', { count: 'exact', head: true }).not('rating', 'is', null) },
    { name: 'has_website_status', q: supabase.from('leads').select('id', { count: 'exact', head: true }).not('website_status', 'is', null) }
  ];

  for (const q of countQueries) {
    const { count } = await q.q;
    console.log(`${q.name}: ${count}`);
  }

  console.log("\n=== QUALITY SCORE DISTRIBUTION ===");
  const { data: scores } = await supabase.from('leads').select('quality_score');
  const dist = {};
  if (scores) {
    scores.forEach(s => {
      const qs = s.quality_score;
      dist[qs] = (dist[qs] || 0) + 1;
    });
    Object.entries(dist).sort((a,b) => Number(b[0]) - Number(a[0])).forEach(([k,v]) => {
      console.log(`Score ${k}: ${v} leads`);
    });
  }

  console.log("\n=== EMAIL SCRAPING SUCCESS RATE ===");
  const { count: totalEmails } = await supabase.from('leads').select('id', { count: 'exact', head: true }).not('email', 'is', null);
  const { count: scrapeEmails } = await supabase.from('leads').select('id', { count: 'exact', head: true }).not('email', 'is', null).contains('score_factors', JSON.stringify({ named_email: 15 })); // We don't have exactly "from scrape", but we can see if we have them. 
  console.log(`total_emails: ${totalEmails}, we need to analyze logs for scraped vs source.`);
}
run();
