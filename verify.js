const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyDb() {
  const { data, error } = await supabase
    .from('target_sequences')
    .select('status');
    
  if (error) {
    console.error('Error fetching target_sequences:', error);
    process.exit(1);
  }
  
  const counts = {};
  for (const row of data || []) {
    counts[row.status] = (counts[row.status] || 0) + 1;
  }
  
  console.log('--- target_sequences status counts ---');
  for (const [status, count] of Object.entries(counts)) {
    console.log(`${status}: ${count}`);
  }
  if (Object.keys(counts).length === 0) {
    console.log('0 rows found.');
  }
}

verifyDb();
