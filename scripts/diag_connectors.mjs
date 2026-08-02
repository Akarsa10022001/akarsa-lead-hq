// Direct connector diagnostics — bypasses dedupe, hits each API raw
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually
const env = {};
try {
  const raw = readFileSync('.env.local', 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=["']?([^"'\n]*)["']?/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
} catch {}
Object.assign(process.env, env);

const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;
const FOURSQUARE_KEY = process.env.FOURSQUARE_API_KEY;
const HUNTER_KEY = process.env.HUNTER_API_KEY;

const CITY = 'Singapore';   // Fresh city — not in DB
const QUERY = 'restaurant';

async function testGoogle() {
  console.log('\n===== 1. GOOGLE MAPS API =====');
  if (!GOOGLE_KEY) { console.log('❌ GOOGLE_PLACES_API_KEY not set'); return; }
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(QUERY+' in '+CITY)}&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  const d = await res.json();
  console.log('Status:', d.status);
  if (d.status === 'OK') {
    console.log(`✅ Returned ${d.results.length} results`);
    console.log('Sample:', d.results.slice(0,2).map(r => ({ name: r.name, phone: r.formatted_phone_number || 'N/A', rating: r.rating, has_website: !!r.website })));
  } else {
    console.log('❌ Error:', d.error_message || d.status);
  }
}

async function testFoursquare() {
  console.log('\n===== 2. FOURSQUARE API =====');
  if (!FOURSQUARE_KEY) { console.log('❌ FOURSQUARE_API_KEY not set'); return; }
  const url = `https://api.foursquare.com/v3/places/search?query=${encodeURIComponent(QUERY)}&near=${encodeURIComponent(CITY)}&limit=5`;
  const res = await fetch(url, { headers: { Authorization: FOURSQUARE_KEY, Accept: 'application/json' } });
  const d = await res.json();
  if (d.results) {
    console.log(`✅ Returned ${d.results.length} results`);
    console.log('Sample:', d.results.slice(0,2).map(r => ({ name: r.name, phone: r.tel || 'N/A', website: r.website || 'N/A', rating: r.rating })));
  } else {
    console.log('❌ Error:', JSON.stringify(d).slice(0,200));
  }
}

async function testOSM() {
  console.log('\n===== 3. OSM NOMINATIM =====');
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(QUERY+' '+CITY)}&format=json&addressdetails=1&extratags=1&limit=5`;
  const res = await fetch(url, { headers: { 'User-Agent': 'AkarsaLeadHQ/1.0 (contact@akarsa.com)' } });
  const d = await res.json();
  console.log(`Returned ${d.length} results`);
  if (d.length > 0) {
    console.log(`✅ Sample:`, d.slice(0,2).map(r => ({ name: r.display_name?.split(',')[0], phone: r.extratags?.phone || 'N/A', website: r.extratags?.website || 'N/A' })));
  } else {
    console.log('⚠️ 0 results — OSM data sparse for this query');
  }
}

async function testReddit() {
  console.log('\n===== 4. REDDIT INTENT =====');
  const sub = 'forhire';
  const url = `https://www.reddit.com/r/${sub}/search.json?q=need+a+website&sort=new&restrict_sr=1&limit=10`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AkarsaBot/1.0)' } });
  if (!res.ok) { console.log('❌ HTTP', res.status); return; }
  const d = await res.json();
  const posts = d?.data?.children || [];
  console.log(`Returned ${posts.length} raw posts`);
  const hiring = posts.filter(p => /\[hiring\]|need (a )?(website|agency|designer|marketer)|looking for (agency|web dev|marketing)/i.test(p.data.title));
  if (hiring.length > 0) {
    console.log(`✅ ${hiring.length} matched hiring regex`);
    console.log('Sample titles:', hiring.slice(0,3).map(p => p.data.title));
  } else {
    console.log('⚠️ 0 matched hiring regex — posts exist but titles don\'t match filter');
    console.log('Raw titles:', posts.slice(0,5).map(p => p.data.title));
  }
}

async function testGDELT() {
  console.log('\n===== 5. GDELT =====');
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query="digital marketing"&mode=artlist&format=json&timespan=1w`;
  const res = await fetch(url);
  if (!res.ok) { console.log('❌ HTTP', res.status); return; }
  const d = await res.json();
  const articles = d.articles || [];
  if (articles.length > 0) {
    console.log(`✅ Returned ${articles.length} articles`);
    console.log('Sample:', articles.slice(0,2).map(a => ({ title: a.title?.slice(0,60), url: a.url?.slice(0,50) })));
  } else {
    console.log('⚠️ 0 articles — GDELT returned empty');
  }
}

async function testOpenCorporates() {
  console.log('\n===== 6. OPENCORPORATES =====');
  const url = `https://api.opencorporates.com/v0.4/companies/search?q=digital+marketing&jurisdiction_code=sg&per_page=5`;
  const res = await fetch(url);
  if (!res.ok) { console.log('❌ HTTP', res.status, '— likely rate limited'); return; }
  const d = await res.json();
  const companies = d.results?.companies || [];
  if (companies.length > 0) {
    console.log(`✅ Returned ${companies.length} companies`);
    console.log('Sample:', companies.slice(0,2).map(c => ({ name: c.company?.name, status: c.company?.current_status })));
  } else {
    console.log('⚠️ 0 results');
  }
}

async function testHunter() {
  console.log('\n===== 7. HUNTER.IO (email fallback) =====');
  if (!HUNTER_KEY) { console.log('❌ HUNTER_API_KEY not set'); return; }
  const url = `https://api.hunter.io/v2/domain-search?domain=stripe.com&api_key=${HUNTER_KEY}&limit=2`;
  const res = await fetch(url);
  const d = await res.json();
  if (d.data?.emails?.length > 0) {
    console.log(`✅ Hunter working — found ${d.data.emails.length} emails for stripe.com`);
  } else {
    console.log('⚠️ Hunter issue:', JSON.stringify(d).slice(0,200));
  }
}

async function testMetaFallback() {
  console.log('\n===== 8. META ADS (DuckDuckGo fallback, no token) =====');
  const url = `https://api.duckduckgo.com/?q=site%3Afacebook.com+restaurant+Singapore&format=json&no_redirect=1&no_html=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) { console.log('❌ HTTP', res.status); return; }
  const d = await res.json();
  const topics = (d.RelatedTopics || []).filter(t => t.FirstURL);
  console.log(`DDG returned ${topics.length} topics`);
  if (topics.length > 0) {
    console.log('✅ Fallback working');
    console.log('Sample:', topics.slice(0,2).map(t => ({ text: t.Text?.slice(0,60), url: t.FirstURL })));
  } else {
    console.log('⚠️ DDG returned empty — Meta Ads needs META_AD_LIBRARY_TOKEN for real results');
  }
}

// Check Supabase DB via REST
async function checkSupabase() {
  console.log('\n===== SUPABASE DB STATE =====');
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPA_URL || !SUPA_KEY) { console.log('❌ Supabase env not loaded'); return; }

  const headers = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };
  const res = await fetch(`${SUPA_URL}/rest/v1/leads?select=score_grade,email,phone_e164&limit=5000`, { headers });
  const leads = await res.json();
  if (!Array.isArray(leads)) { console.log('❌ Supabase error:', JSON.stringify(leads).slice(0,200)); return; }

  const grades = {}, emails_count = leads.filter(l=>l.email).length, phones_count = leads.filter(l=>l.phone_e164).length;
  leads.forEach(l => { grades[l.score_grade||'null'] = (grades[l.score_grade||'null']||0)+1; });
  console.log(`✅ Total leads: ${leads.length}`);
  console.log(`   Grade dist: ${JSON.stringify(grades)}`);
  console.log(`   Has email: ${emails_count} | Has phone (E164): ${phones_count}`);
  console.log(`   Contactable (email OR phone): ${leads.filter(l=>l.email||l.phone_e164).length}`);

  // Sample A leads with email
  const res2 = await fetch(`${SUPA_URL}/rest/v1/leads?select=company_name,email,phone_e164,quality_score,location&score_grade=eq.A&email=not.is.null&limit=4`, { headers });
  const sampleA = await res2.json();
  console.log('\n   GRADE A SAMPLE (with real email):');
  (sampleA||[]).forEach(l => console.log(`   ✅ ${l.company_name} | ${l.email} | ${l.phone_e164||'no phone'} | score:${l.quality_score} | ${l.location?.slice(0,40)}`));

  // Cursor status
  const res3 = await fetch(`${SUPA_URL}/rest/v1/discovery_cursor?select=source,location,exhausted,page&limit=50`, { headers });
  const cursors = await res3.json();
  if (Array.isArray(cursors)) {
    const ex = cursors.filter(c=>c.exhausted);
    console.log(`\n   CURSORS: ${cursors.length} total | ${ex.length} exhausted`);
    ex.slice(0,6).forEach(c => console.log(`   EXHAUSTED: ${c.source}/${c.location}`));
  }
}

// Run all
(async () => {
  console.log('🔍 Akarsa Lead HQ — Connector Diagnostic\n');
  await testGoogle();
  await testFoursquare();
  await testOSM();
  await testReddit();
  await testGDELT();
  await testOpenCorporates();
  await testHunter();
  await testMetaFallback();
  await checkSupabase();
  console.log('\n✅ Diagnostic complete.');
})();
