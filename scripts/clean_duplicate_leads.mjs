import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Read .env.local raw file directly
const envContent = readFileSync('.env.local', 'utf-8');
let supabaseUrl = '';
let supabaseKey = '';

for (const line of envContent.split('\n')) {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
    supabaseUrl = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
  }
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
    supabaseKey = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
  }
}

if (!supabaseUrl || !supabaseKey) {
  console.error('Could not find Supabase URL or Key in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanDuplicates() {
  console.log('====================================================');
  console.log('   SUPABASE LEADS TABLE DEDUPLICATION CLEANUP      ');
  console.log('====================================================\n');

  // Fetch all leads
  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, company_name, created_at')
    .order('created_at', { ascending: true }); // Keep oldest, delete newer duplicates

  if (error || !leads) {
    console.error('Failed to fetch leads:', error);
    return;
  }

  console.log(`Total leads in database before cleanup: ${leads.length}`);

  const seen = new Map();
  const duplicateIdsToDelete = [];

  for (const lead of leads) {
    const key = (lead.company_name || '').trim().toLowerCase();
    if (!key) continue;

    if (seen.has(key)) {
      // Duplicate found! Mark for deletion
      duplicateIdsToDelete.push(lead.id);
    } else {
      seen.set(key, lead.id);
    }
  }

  console.log(`Found ${duplicateIdsToDelete.length} duplicate lead rows to delete.`);

  if (duplicateIdsToDelete.length > 0) {
    // Delete in batches of 100
    const BATCH_SIZE = 100;
    let deletedCount = 0;

    for (let i = 0; i < duplicateIdsToDelete.length; i += BATCH_SIZE) {
      const batch = duplicateIdsToDelete.slice(i, i + BATCH_SIZE);
      const { error: delErr } = await supabase
        .from('leads')
        .delete()
        .in('id', batch);

      if (delErr) {
        console.error(`Batch delete error:`, delErr);
      } else {
        deletedCount += batch.length;
        console.log(`  ✓ Deleted batch of ${batch.length} duplicates (${deletedCount}/${duplicateIdsToDelete.length})`);
      }
    }
    console.log(`\n🎉 Successfully deleted ${deletedCount} duplicate lead rows!`);
  } else {
    console.log('✅ No duplicates found in database!');
  }

  const { count: finalCount } = await supabase.from('leads').select('*', { count: 'exact', head: true });
  console.log(`📊 Final total unique leads in database: ${finalCount}`);
  console.log('\n====================================================');
}

cleanDuplicates();
