const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '../.env.local');
let content = fs.readFileSync(envPath, 'utf8');

const token = 'EAFZBNK408TEgBSHa8eIphtkHiFQ6Yxldjva42E4mSX85ZAtsc9GWkBWUIZBuECPsbmbPilSQ3WbTKZBj3AIzvC6Yj4JqsPa316URpyZABKMzPP09BPS6JbkcmuuQ6ua5JAh4ZCv9MpIZC1tiJ7jbBSOyogMxvQSoqYn4ZA2haacBp1DHjCZB84VMqoKD3qZCURBN8zAIdgfbSPzefyeReseC7ii5wxYwAL4CJ6kFUFyuxSRfn8V0l6N6De92BH0LZAE1EZCAyzGH8laYvjWCOLaIMyRLgAZDZD';

if (content.includes('WHATSAPP_ACCESS_TOKEN=')) {
  content = content.replace(/WHATSAPP_ACCESS_TOKEN=.*/g, `WHATSAPP_ACCESS_TOKEN="${token}"`);
} else {
  content += `\nWHATSAPP_ACCESS_TOKEN="${token}"\n`;
}

fs.writeFileSync(envPath, content, 'utf8');
console.log("SUCCESS: Updated WHATSAPP_ACCESS_TOKEN in .env.local!");

async function updateDbSocialAccount() {
  const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: existing } = await supabase.from('social_accounts').select('id').eq('channel', 'whatsapp').limit(1);

  if (existing && existing.length > 0) {
    await supabase.from('social_accounts').update({
      access_token: token,
      status: 'active',
      updated_at: new Date().toISOString()
    }).eq('id', existing[0].id);
    console.log("SUCCESS: Updated social_accounts entry in Supabase!");
  } else {
    await supabase.from('social_accounts').insert({
      channel: 'whatsapp',
      account_name: 'AkarsaOne WhatsApp Business',
      access_token: token,
      status: 'active'
    });
    console.log("SUCCESS: Inserted social_accounts entry in Supabase!");
  }
}

updateDbSocialAccount().catch(console.error);
