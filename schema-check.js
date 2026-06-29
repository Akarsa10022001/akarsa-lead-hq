const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.rpc('query_schema', {
    query: "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='leads';"
  });
  
  if (error) {
    // If there is no RPC, let's just select 1 row from leads and print its keys
    const { data: rowData, error: rowError } = await supabase.from('leads').select('*').limit(1);
    if (rowError) {
      console.error("Error reading leads:", rowError);
    } else if (rowData.length > 0) {
      console.log("Leads columns (from row keys):", Object.keys(rowData[0]));
    } else {
      console.log("Leads table is empty, cannot infer all columns.");
    }
  } else {
    console.log("Schema columns:", data);
  }
}
check();
