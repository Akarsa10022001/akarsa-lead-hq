import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function run() {
  const { data, error } = await supabase.rpc('get_view_def', { view_name: 'sequence_ready_leads' });
  if (error) {
     // fallback if rpc doesn't exist
     console.log("No rpc, let's just query it");
     const { data: sample } = await supabase.from('sequence_ready_leads').select('*').limit(1);
     console.log(sample);
  } else {
     console.log(data);
  }
}
run();
