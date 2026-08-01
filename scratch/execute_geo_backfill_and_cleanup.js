const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';

const supabase = createClient(supabaseUrl, supabaseKey);

function inferCityFromAddressOrPhone(lead) {
  const addr = (lead.geo || lead.location || '').toLowerCase();
  const phone = (lead.phone_e164 || lead.phone || '').toString();

  // Address matching
  if (addr.includes('indore') || addr.includes('madhya pradesh') || addr.includes('45200')) return 'Indore, India';
  if (addr.includes('bengaluru') || addr.includes('bangalore') || addr.includes('karnataka') || addr.includes('hsr layout') || addr.includes('btm layout') || addr.includes('indiranagar')) return 'Bengaluru, India';
  if (addr.includes('mumbai') || addr.includes('maharashtra') || addr.includes('40000')) return 'Mumbai, India';
  if (addr.includes('delhi') || addr.includes('new delhi') || addr.includes('okhla') || addr.includes('11002')) return 'New Delhi, India';

  if (addr.includes('london') || addr.includes('tottenham') || addr.includes('clerkenwell') || addr.includes('welbeck') || addr.includes('southwark') || addr.includes('tavistock') || addr.includes('w1t') || addr.includes('wc1h') || addr.includes('se1') || addr.includes('w1g')) return 'London, UK';
  if (addr.includes('manchester') || addr.includes('salford') || addr.includes('m3 5as') || addr.includes('m1 7dg') || addr.includes('m2 4jf')) return 'Manchester, UK';

  if (addr.includes('dubai') || addr.includes('burj khalifa') || addr.includes('yansoon') || addr.includes('city walk') || addr.includes('al wasl')) return 'Dubai, UAE';
  if (addr.includes('abu dhabi')) return 'Abu Dhabi, UAE';

  if (addr.includes('austin') || addr.includes('tx 787')) return 'Austin, TX, USA';
  if (addr.includes('san francisco') || addr.includes('ca 941')) return 'San Francisco, CA, USA';
  if (addr.includes('singapore') || addr.includes('059818') || addr.includes('208561')) return 'Singapore';

  // Phone area code matching
  if (phone.startsWith('+91731') || phone.startsWith('91731') || phone.startsWith('0731')) return 'Indore, India';
  if (phone.startsWith('+9180') || phone.startsWith('9180')) return 'Bengaluru, India';
  if (phone.startsWith('+9122') || phone.startsWith('9122')) return 'Mumbai, India';
  if (phone.startsWith('+9111') || phone.startsWith('9111')) return 'New Delhi, India';

  if (phone.startsWith('+4420') || phone.startsWith('4420')) return 'London, UK';
  if (phone.startsWith('+44161') || phone.startsWith('44161')) return 'Manchester, UK';

  if (phone.startsWith('+9714') || phone.startsWith('9714')) return 'Dubai, UAE';
  if (phone.startsWith('+9712') || phone.startsWith('9712')) return 'Abu Dhabi, UAE';

  if (phone.startsWith('+1512') || phone.startsWith('1512')) return 'Austin, TX, USA';
  if (phone.startsWith('+1415') || phone.startsWith('1415')) return 'San Francisco, CA, USA';

  // Fallback to Country
  if (phone.startsWith('+91') || phone.startsWith('91')) return 'India (Other)';
  if (phone.startsWith('+44') || phone.startsWith('44')) return 'UK (Other)';
  if (phone.startsWith('+971') || phone.startsWith('971')) return 'UAE (Other)';
  if (phone.startsWith('+1') || phone.startsWith('1')) return 'USA (Other)';

  return 'Unspecified';
}

async function runFastGeoBackfill() {
  console.log("=== FAST DATA CLEANUP & GEO BACKFILL ===");

  // 1. UPDATE leads SET email = NULL WHERE email = '' OR email = 'null';
  const { data: emptyLeads } = await supabase.from('leads').select('id').or("email.eq.,email.eq.null");
  const affectedRowCount = emptyLeads?.length || 0;

  if (affectedRowCount > 0) {
    await supabase.from('leads').update({ email: null }).or("email.eq.,email.eq.null");
  }

  console.log(`1. UPDATE leads SET email = NULL WHERE email = ''; affected rows: ${affectedRowCount}`);

  // Fetch all 1,285 leads
  let allLeads = [];
  let pageIndex = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data } = await supabase
      .from('leads')
      .select('id, company_name, email, phone, phone_e164, geo, location, is_test')
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

  const emailableLeads = allLeads.filter(l => l.email && l.email.trim() !== '' && l.email.includes('@'));
  console.log(`2. Real Emailable Universe (email LIKE '%@%'): ${emailableLeads.length} / ${allLeads.length} (${((emailableLeads.length / allLeads.length) * 100).toFixed(1)}%)`);

  // Group leads by inferred city to update in bulk chunks
  const cityGroups = {};
  allLeads.forEach(lead => {
    const inferred = inferCityFromAddressOrPhone(lead);
    if (inferred !== 'Unspecified' && lead.geo !== inferred) {
      cityGroups[inferred] = cityGroups[inferred] || [];
      cityGroups[inferred].push(lead.id);
      lead.geo = inferred;
    }
  });

  let totalUpdated = 0;
  for (const [city, ids] of Object.entries(cityGroups)) {
    totalUpdated += ids.length;
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      await supabase.from('leads').update({ geo: city }).in('id', chunk);
    }
  }

  console.log(`3. Backfilled clean city geo values for ${totalUpdated} leads.`);

  // City distribution breakdown
  const cityDist = {};
  allLeads.forEach(l => {
    const c = l.geo || 'Unspecified';
    cityDist[c] = (cityDist[c] || 0) + 1;
  });

  console.log("\n--- CLEAN CITY GEOGRAPHIC DISTRIBUTION (WHERE is_test = false GROUP BY geo ORDER BY 2 DESC) ---");
  const sorted = Object.entries(cityDist).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([city, count], idx) => {
    console.log(`${idx + 1}. ${city}: ${count} leads (${((count / allLeads.length) * 100).toFixed(1)}%)`);
  });
}

runFastGeoBackfill().catch(console.error);
