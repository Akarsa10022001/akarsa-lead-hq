const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function summaryCensus() {
  let allLeads = [];
  let pageIndex = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data } = await supabase
      .from('leads')
      .select('id, email, phone_e164, phone, geo, location, review_count, rating, is_test')
      .eq('is_test', false)
      .range(pageIndex * pageSize, (pageIndex + 1) * pageSize - 1);

    if (data && data.length > 0) {
      allLeads = allLeads.concat(data);
      if (data.length < pageSize) hasMore = false;
      else pageIndex++;
    } else {
      hasMore = false;
    }
  }

  const realEmails = allLeads.filter(l => l.email && l.email.trim() !== '' && l.email.includes('@'));
  const phoneOnlyLeads = allLeads.filter(l => (!l.email || l.email.trim() === '') && (l.phone || l.phone_e164));
  const review50_300 = allLeads.filter(l => {
    const rc = parseInt(l.review_count || 0, 10);
    return rc >= 50 && rc <= 300;
  });

  console.log("=== CENSUS SUMMARY OVER ALL 1,285 LEADS ===");
  console.log(`1. Total production leads (is_test = false): ${allLeads.length}`);
  console.log(`2. Genuinely real emails (email LIKE '%@%'): ${realEmails.length} (${((realEmails.length / allLeads.length) * 100).toFixed(1)}%)`);
  console.log(`3. Phone-only leads (no email address): ${phoneOnlyLeads.length} (${((phoneOnlyLeads.length / allLeads.length) * 100).toFixed(1)}%)`);
  console.log(`4. Leads with review_count BETWEEN 50 AND 300: ${review50_300.length} (${((review50_300.length / allLeads.length) * 100).toFixed(1)}%)`);
}

summaryCensus();
