const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  let allLeads = [];
  let pageIndex = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, status, email, phone')
      .eq('is_test', false)
      .range(pageIndex * pageSize, (pageIndex + 1) * pageSize - 1);

    if (error) {
      console.error("Fetch error:", error);
      break;
    }

    if (data && data.length > 0) {
      allLeads = allLeads.concat(data);
      if (data.length < pageSize) hasMore = false;
      else pageIndex++;
    } else {
      hasMore = false;
    }
  }

  const total = allLeads.length;
  const newLeads = allLeads.filter(l => l.status === 'New');
  const contactedLeads = allLeads.filter(l => (l.status || '').toLowerCase() === 'contacted');

  const emailableNew = newLeads.filter(l => l.email && l.email.includes('@'));
  const phoneNew = newLeads.filter(l => l.phone && l.phone.length > 5);

  console.log("=== REAL-TIME SUPABASE LEADS CENSUS ===");
  console.log(`Total Non-Test Leads: ${total}`);
  console.log(`Status 'New' Leads: ${newLeads.length}`);
  console.log(`Status 'Contacted' Leads: ${contactedLeads.length}`);
  console.log(`New Emailable Leads: ${emailableNew.length}`);
  console.log(`New Phone Leads: ${phoneNew.length}`);
}

run().catch(console.error);
