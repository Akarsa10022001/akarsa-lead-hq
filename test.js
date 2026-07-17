require('dotenv').config({ path: '.env.vercel.production' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: seqs } = await supabase.from('target_sequences').select('*');
  const { data: touches } = await supabase.from('touch_queue').select('*');
  console.log(`Sequences: ${seqs.length}`);
  console.log(`Touches: ${touches.length}`);
}
run();
