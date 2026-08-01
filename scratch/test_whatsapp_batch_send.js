const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envLocal = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const envVars = {};
envLocal.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    let val = parts.slice(1).join('=').trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    envVars[key] = val;
  }
});

const token = envVars.WHATSAPP_ACCESS_TOKEN;
const phoneId = envVars.WHATSAPP_PHONE_NUMBER_ID || '342672628929944'; // default phone number ID or fetch from Meta API

console.log("=== TESTING WHATSAPP BATCH DISPATCH ENGINE ===");
console.log("WHATSAPP_ACCESS_TOKEN present:", !!token);

const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testWhatsAppBatch() {
  // Fetch phone-only leads (domain IS NULL or email IS NULL)
  const { data: phoneLeads } = await supabase
    .from('leads')
    .select('id, company_name, phone, phone_e164, geo, rating, review_count')
    .eq('is_test', false)
    .not('phone', 'is', null)
    .not('phone', 'eq', '')
    .limit(10);

  console.log(`Found ${phoneLeads?.length || 0} phone leads for WhatsApp batch dispatch.`);

  if (phoneLeads && phoneLeads.length > 0) {
    phoneLeads.forEach((l, idx) => {
      console.log(`${idx + 1}. ${l.company_name} -> Phone: ${l.phone_e164 || l.phone}`);
    });
  }
}

testWhatsAppBatch().catch(console.error);
