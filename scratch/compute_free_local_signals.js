const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jwityrtfzuhnupjnmwfr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXR5cnRmenVobnVwam5td2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njg2NjUsImV4cCI6MjA5ODA0NDY2NX0.rhoeaty-pNUprAgjcp7wCCkoEIzfo0E3ptOi1mPtCFU';

const supabase = createClient(supabaseUrl, supabaseKey);

function calculateIntelScore(lead, signals) {
  let score = 0;
  const factors = {};

  const signalList = signals || lead.lead_signals || [];

  if (Array.isArray(signalList) && signalList.length > 0) {
    for (const s of signalList) {
      const type = s.signal_type;
      if (type === 'no_website_on_listing' && !factors.no_website_on_listing) {
        score += 25;
        factors.no_website_on_listing = 25;
      } else if (type === 'slow_mobile_site' && !factors.slow_mobile_site) {
        score += 25;
        factors.slow_mobile_site = 25;
      } else if (type === 'established_local' && !factors.established_local) {
        score += 15;
        factors.established_local = 15;
      } else if (type === 'strong_reputation' && !factors.strong_reputation) {
        score += 15;
        factors.strong_reputation = 15;
      } else if ((type === 'runs_ads' || type === 'active_ads') && !factors.runs_ads) {
        score += 35;
        factors.runs_ads = 35;
      } else if (type === 'has_pixel' && !factors.has_pixel) {
        score += 25;
        factors.has_pixel = 25;
      } else if (type === 'ig_active_low_engagement' && !factors.ig_active_low_engagement) {
        score += 20;
        factors.ig_active_low_engagement = 20;
      } else if (type === 'recent_reviews' && !factors.recent_reviews) {
        score += 15;
        factors.recent_reviews = 15;
      }
    }
  }

  const total = Math.min(score, 100);
  const grade = total >= 50 ? 'A' : (total >= 35 ? 'B' : (total >= 15 ? 'C' : 'D'));

  return {
    total,
    grade,
    factors
  };
}

async function fastComputeFreeLocalSignals() {
  console.log("=== FAST COMPUTING FREE LOCAL SIGNALS ACROSS ALL LEADS ===");

  let allLeads = [];
  let pageIndex = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data } = await supabase
      .from('leads')
      .select('id, company_name, domain, rating, review_count, geo, location, is_test')
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

  console.log(`Loaded ${allLeads.length} leads for signal generation.`);

  let noWebsiteCount = 0;
  let strongRepCount = 0;
  let establishedLocalCount = 0;

  const signalsToInsert = [];

  for (const lead of allLeads) {
    const domainStr = (lead.domain || '').trim();
    const ratingVal = parseFloat(lead.rating || 0);
    const reviewVal = parseInt(lead.review_count || 0, 10);
    const geoStr = lead.geo || lead.location || 'Indore, India';

    // 1. Signal: no_website_on_listing (+25 pts)
    if (!domainStr || domainStr === '' || domainStr === 'null') {
      noWebsiteCount++;
      signalsToInsert.push({
        lead_id: lead.id,
        signal_type: 'no_website_on_listing',
        category: 'gap',
        evidence_text: `Listing has no official website URL, relying solely on Google Maps presence`
      });
    }

    // 2. Signal: strong_reputation (+15 pts)
    if (reviewVal >= 100 && ratingVal >= 4.3) {
      strongRepCount++;
      signalsToInsert.push({
        lead_id: lead.id,
        signal_type: 'strong_reputation',
        category: 'trigger',
        evidence_text: `Strong local reputation with ${ratingVal} stars across ${reviewVal} Google reviews`
      });
    }

    // 3. Signal: established_local (+15 pts)
    if (reviewVal >= 50 && reviewVal <= 300) {
      establishedLocalCount++;
      signalsToInsert.push({
        lead_id: lead.id,
        signal_type: 'established_local',
        category: 'reachability',
        evidence_text: `Established local business in ${geoStr} with ${reviewVal} customer reviews`
      });
    }
  }

  console.log(`\nGenerated Local Signals:`);
  console.log(`- no_website_on_listing: ${noWebsiteCount}`);
  console.log(`- strong_reputation: ${strongRepCount}`);
  console.log(`- established_local: ${establishedLocalCount}`);

  // Insert signals chunk by chunk
  console.log(`Inserting ${signalsToInsert.length} signals into lead_signals...`);
  let insertedSignalsCount = 0;

  for (let i = 0; i < signalsToInsert.length; i += 100) {
    const chunk = signalsToInsert.slice(i, i + 100);
    const { data: inserted, error } = await supabase.from('lead_signals').insert(chunk).select('id');
    if (error) {
      console.error("Insert signals error:", error.message);
    } else {
      insertedSignalsCount += (inserted?.length || 0);
    }
  }

  console.log(`Successfully inserted ${insertedSignalsCount} signals into lead_signals.`);

  // Paginated fetch of ALL lead_signals
  console.log("Recalculating score_total and grade thresholds for all leads...");
  let allSignals = [];
  let sigPageIndex = 0;
  let sigHasMore = true;

  while (sigHasMore) {
    const { data: sigPage, error: sigErr } = await supabase
      .from('lead_signals')
      .select('lead_id, signal_type, evidence_text')
      .range(sigPageIndex * pageSize, (sigPageIndex + 1) * pageSize - 1);

    if (sigErr) break;
    if (sigPage && sigPage.length > 0) {
      allSignals = allSignals.concat(sigPage);
      if (sigPage.length < pageSize) sigHasMore = false;
      else sigPageIndex++;
    } else {
      sigHasMore = false;
    }
  }

  console.log(`Fetched ${allSignals.length} total signals from lead_signals table.`);
  
  const signalsByLead = {};
  allSignals.forEach(s => {
    signalsByLead[s.lead_id] = signalsByLead[s.lead_id] || [];
    signalsByLead[s.lead_id].push(s);
  });

  const gradeDist = { A: 0, B: 0, C: 0, D: 0 };
  const scoreDist = {};

  const leadUpdates = [];
  for (const lead of allLeads) {
    const leadSignals = signalsByLead[lead.id] || [];
    const intel = calculateIntelScore(lead, leadSignals);

    gradeDist[intel.grade] = (gradeDist[intel.grade] || 0) + 1;
    scoreDist[intel.total] = (scoreDist[intel.total] || 0) + 1;

    leadUpdates.push({
      id: lead.id,
      score_total: intel.total,
      quality_score: intel.total,
      score_grade: intel.grade,
      score_factors: intel.factors
    });
  }

  // Group lead updates by (score_total, score_grade) to update in fast parallel batches
  console.log("Saving new scores and grade thresholds to DB in fast parallel batches...");
  const groupMap = {};
  leadUpdates.forEach(u => {
    const key = `${u.score_total}_${u.score_grade}`;
    groupMap[key] = groupMap[key] || [];
    groupMap[key].push(u.id);
  });

  for (const [key, ids] of Object.entries(groupMap)) {
    const [scoreTotalStr, gradeStr] = key.split('_');
    const scoreVal = parseInt(scoreTotalStr, 10);

    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error: upErr } = await supabase.from('leads').update({
        score_total: scoreVal,
        quality_score: scoreVal,
        score_grade: gradeStr
      }).in('id', chunk);

      if (upErr) console.error(`Error updating group ${key}:`, upErr.message);
    }
  }

  console.log("\n--- REBALANCED GRADE DISTRIBUTION ACROSS ALL LEADS ---");
  console.log(`Grade A (Score >= 50): ${gradeDist.A} leads (${((gradeDist.A / allLeads.length) * 100).toFixed(1)}%)`);
  console.log(`Grade B (Score 35-49): ${gradeDist.B} leads (${((gradeDist.B / allLeads.length) * 100).toFixed(1)}%)`);
  console.log(`Grade C (Score 15-34): ${gradeDist.C} leads (${((gradeDist.C / allLeads.length) * 100).toFixed(1)}%)`);
  console.log(`Grade D (Score < 15):  ${gradeDist.D} leads (${((gradeDist.D / allLeads.length) * 100).toFixed(1)}%)`);

  console.log("\n--- SCORE TOTAL BREAKDOWN ---");
  console.log(JSON.stringify(scoreDist, null, 2));

  console.log("\n--- 5 SAMPLE QUOTABLE EVIDENCE TEXT STRINGS ---");
  const localSignals = allSignals.filter(s => ['no_website_on_listing', 'strong_reputation', 'established_local'].includes(s.signal_type));
  localSignals.slice(0, 5).forEach((s, idx) => {
    console.log(`${idx + 1}. [${s.signal_type}]: "${s.evidence_text}"`);
  });
}

fastComputeFreeLocalSignals().catch(console.error);
