const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStatusDist() {
  console.log("=== CHECKING LEADS STATUS DISTRIBUTION ===");
  
  let allLeads = [];
  let pageIndex = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data } = await supabase
      .from('leads')
      .select('id, company_name, email, status')
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

  console.log("Total leads loaded:", allLeads.length);

  const statusMap = {};
  const emailableStatusMap = {};

  allLeads.forEach(l => {
    const st = l.status || 'NULL';
    statusMap[st] = (statusMap[st] || 0) + 1;

    if (l.email && l.email.includes('@')) {
      emailableStatusMap[st] = (emailableStatusMap[st] || 0) + 1;
    }
  });

  console.log("All Leads status breakdown:", statusMap);
  console.log("Emailable Leads (email LIKE %@%) status breakdown:", emailableStatusMap);
}

checkStatusDist();
