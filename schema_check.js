require('dotenv').config({ path: '.env.vercel.production' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: lead, error } = await supabase.from('leads').select('*').limit(1);
  if (error) {
      console.error("DB Error:", error);
  }
  if (lead && lead.length > 0) {
      console.log(Object.keys(lead[0]).join(', '));
  } else {
      console.log('No leads found or error.');
  }
}
run();
