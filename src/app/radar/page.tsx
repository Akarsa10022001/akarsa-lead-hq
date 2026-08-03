"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, Mail, ChevronDown, Edit2, MessageSquare, Trash2, Send, Target } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { generateSmartOutreachCopy } from "@/lib/outreach/copy-generator";

export default function Radar() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  useEffect(() => {
    async function fetchLeads() {
      let allLeads: any[] = [];
      let pageIndex = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('leads')
          .select('*')
          .eq('is_test', false)
          .order('created_at', { ascending: false })
          .range(pageIndex * pageSize, (pageIndex + 1) * pageSize - 1);

        if (error) {
          console.error("Error fetching leads:", error);
          break;
        }

        if (data && data.length > 0) {
          allLeads = allLeads.concat(data);
          if (data.length < pageSize) hasMore = false;
          else pageIndex++;
        } else {
          hasMore = false;
        }
      }

      setLeads(allLeads);
      setLoading(false);
    }
    fetchLeads();
  }, []);

  const excludedStatuses = ['won', 'lost', 'dead', 'rejected', 'contacted'];
  const seenCompanyNames = new Set<string>();

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          lead.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          lead.industry?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const leadStatusLower = (lead.status || '').toLowerCase();
    const matchesStatus = statusFilter 
      ? leadStatusLower === statusFilter.toLowerCase() 
      : !excludedStatuses.includes(leadStatusLower);
      
    if (!matchesSearch || !matchesStatus) return false;

    // Deduplicate identical company names in UI
    const nameKey = (lead.company_name || '').trim().toLowerCase();
    if (nameKey && seenCompanyNames.has(nameKey)) return false;
    if (nameKey) seenCompanyNames.add(nameKey);

    return true;
  });

  const handleDeleteLead = async (leadId: string, companyName: string) => {
    if (confirm(`Are you sure you want to delete ${companyName}? This action cannot be undone.`)) {
      const { error } = await supabase.from('leads').delete().eq('id', leadId);
      if (!error) {
        setLeads(leads.filter(l => l.id !== leadId));
      } else {
        alert("Failed to delete lead.");
      }
    }
  };

  const handleEditLead = async (lead: any) => {
    const newContactName = window.prompt("Enter contact person's name (e.g. John Doe):", lead.contact_name || "");
    if (newContactName === null) return;

    const newPhone = window.prompt("Enter new phone number (include country code, e.g., 919876543210):", lead.phone || "");
    if (newPhone === null) return;

    const updatePayload: any = {};
    if (newContactName !== lead.contact_name) updatePayload.contact_name = newContactName;
    if (newPhone !== lead.phone) updatePayload.phone = newPhone;

    if (Object.keys(updatePayload).length > 0) {
      const { error } = await supabase.from('leads').update(updatePayload).eq('id', lead.id);
      if (!error) {
        setLeads(leads.map(l => l.id === lead.id ? { ...l, ...updatePayload } : l));
        alert("Lead updated successfully!");
      } else {
        alert("Failed to update lead info.");
      }
    }
  };

  const handleMarkReplied = async (lead: any) => {
    if (confirm(`Mark WhatsApp conversation with ${lead.company_name} as Replied? This will log it in your Priority Inbox.`)) {
      // 1. Update Lead Status
      await supabase.from('leads').update({ status: 'Replied' }).eq('id', lead.id);
      
      // 2. Find the sequence
      const { data: sequence } = await supabase
        .from('outreach_sequences')
        .select('id')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sequence) {
        // 3. Insert fake inbound message so it appears in Inbox
        await supabase.from('outreach_messages').insert({
          sequence_id: sequence.id,
          step_number: 1,
          channel: 'whatsapp',
          draft_content: '(Logged Manually from WhatsApp)',
          sent_at: new Date().toISOString(),
          status: 'received'
        });
      }

      setLeads(leads.map(l => l.id === lead.id ? { ...l, status: 'Replied' } : l));
      alert("Successfully logged to Inbox!");
    }
  };

  const handlePromoteToDream25 = async (lead: any) => {
    const contact = (lead.contact_name || '').trim();
    const contactLower = contact.toLowerCase();
    
    const isGenericContact = !contact ||
                             contactLower === 'n/a' ||
                             contactLower.includes("info") ||
                             contactLower.includes("support") ||
                             contactLower.includes("contact") ||
                             contactLower.includes("sales") ||
                             contactLower.includes("team") ||
                             contactLower.includes("office");

    if (isGenericContact) {
      alert("Promotion failed: A target must have a valid personal contact name, not a generic alias like 'info' or 'team'. The 17-touch sequence is wasted on a generic inbox.");
      return;
    }

    try {
      // Check if already exists in dream_targets
      const { data: existing } = await supabase
        .from('dream_targets')
        .select('id')
        .eq('lead_id', lead.id)
        .maybeSingle();

      if (existing) {
        alert("This lead is already in your Dream 25 targets.");
        return;
      }

      // 1. Insert into dream_targets
      const social = lead.social_links || {};
      const { data: target, error: targetError } = await supabase
        .from('dream_targets')
        .insert({
          lead_id: lead.id,
          company_name: lead.company_name,
          contact_name: lead.contact_name,
          contact_title: 'Owner', // Default decision maker title
          email: lead.email || null,
          phone: lead.phone || null,
          linkedin_url: social.linkedin || null,
          instagram_handle: social.instagram || null,
          notes: lead.ai_hook_draft || 'Promoted from Radar.'
        })
        .select()
        .single();

      if (targetError) throw targetError;

      // 2. Insert WhatsApp consent
      await supabase
        .from('consents')
        .insert({
          target_id: target.id,
          channel: 'whatsapp',
          opted_in: false,
          source: 'radar_promotion'
        });

      // 3. Assign 17-touch sequence
      await supabase
        .from('target_sequences')
        .insert({
          target_id: target.id,
          sequence_id: 'd3b07384-d113-4c9b-8c5d-2b47d3d19117',
          current_step: 0,
          status: 'active'
        });

      alert(`Successfully promoted ${lead.company_name} to Dream 25 Targets!`);
    } catch (err: any) {
      console.error("Error promoting to Dream 25:", err);
      alert(`Promotion failed: ${err.message}`);
    }
  };


  const [waQueue, setWaQueue] = useState<any[]>([]);
  const [waIndex, setWaIndex] = useState(0);
  const [waModalOpen, setWaModalOpen] = useState(false);

  const startWaQueue = () => {
    const phoneLeads = filteredLeads.filter(l => l.status === 'New' && l.phone).slice(0, 20);
    if (phoneLeads.length === 0) {
      alert("No new phone leads available for WhatsApp.");
      return;
    }
    setWaQueue(phoneLeads);
    setWaIndex(0);
    setWaModalOpen(true);
  };

  const handleSendCurrentWa = async () => {
    if (waIndex >= waQueue.length) return;
    const currentLead = waQueue[waIndex];
    const cleanPhone = currentLead.phone.replace(/\D/g, '');
    
    const copy = generateSmartOutreachCopy({
      companyName: currentLead.company_name,
      contactName: currentLead.contact_name,
      industry: currentLead.industry,
      city: currentLead.geo || currentLead.location,
      rating: currentLead.rating,
      reviewCount: currentLead.review_count,
      evidenceText: currentLead.ai_hook_draft,
      hasWebsite: !!currentLead.domain
    });

    const text = encodeURIComponent(copy.whatsappMessage);
    
    // Open in WhatsApp Web
    window.open(`https://web.whatsapp.com/send?phone=${cleanPhone}&text=${text}`, '_blank');

    // Mark as Contacted
    await supabase.from('leads').update({ status: 'Contacted' }).eq('id', currentLead.id);

    // Remove from local leads state so it immediately vanishes from Radar table
    setLeads(prev => prev.map(l => l.id === currentLead.id ? { ...l, status: 'Contacted' } : l));

    if (waIndex + 1 < waQueue.length) {
      setWaIndex(waIndex + 1);
    } else {
      alert("🎉 WhatsApp Queue Complete! All batch leads processed and moved to Contacted.");
      setWaModalOpen(false);
    }
  };

  const [scanningSource, setScanningSource] = useState<string | null>(null);
  const [megaSwarmActive, setMegaSwarmActive] = useState(false);
  const [swarmStatuses, setSwarmStatuses] = useState<Record<string, string>>({});
  const [scanLocation, setScanLocation] = useState('');
  const [scanIndustry, setScanIndustry] = useState('Auto');

  // All available scraping sources
  const SCRAPER_SOURCES = [
    { id: 'google_maps', label: '📍 Google Maps API', desc: 'Places API with ratings, phone, website', color: 'bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-800/60 text-emerald-200', dotColor: 'bg-emerald-400' },
    { id: 'foursquare', label: '🟣 Foursquare Places', desc: 'Venue discovery with categories & tips', color: 'bg-purple-950/40 hover:bg-purple-900/50 border-purple-800/60 text-purple-200', dotColor: 'bg-purple-400' },
    { id: 'osm', label: '🗺️ OSM / Nominatim', desc: 'Free open-source map POI data', color: 'bg-sky-950/40 hover:bg-sky-900/50 border-sky-800/60 text-sky-200', dotColor: 'bg-sky-400' },
    { id: 'reddit_intent', label: '🔥 Reddit & RFP Intent', desc: 'Live hiring posts from r/forhire, r/smallbusiness', color: 'bg-orange-950/40 hover:bg-orange-900/50 border-orange-800/60 text-orange-200', dotColor: 'bg-orange-400' },
    { id: 'gdelt_news', label: '📰 GDELT News Triggers', desc: 'Global news signals & company mentions', color: 'bg-rose-950/40 hover:bg-rose-900/50 border-rose-800/60 text-rose-200', dotColor: 'bg-rose-400' },
    { id: 'opencorporates', label: '🏢 OpenCorporates Registry', desc: 'Company registrations & filings', color: 'bg-cyan-950/40 hover:bg-cyan-900/50 border-cyan-800/60 text-cyan-200', dotColor: 'bg-cyan-400' },
    { id: 'meta_ads', label: '📣 Meta Ad Library', desc: 'Businesses actively running Facebook/Instagram ads — proven budget', color: 'bg-blue-950/40 hover:bg-blue-900/50 border-blue-800/60 text-blue-200', dotColor: 'bg-blue-400' },
    { id: 'telegram_intent', label: '✈️ Telegram & Social Intent', desc: 'Buying signals from public Telegram groups, Discord & B2B channels', color: 'bg-indigo-950/40 hover:bg-indigo-900/50 border-indigo-800/60 text-indigo-200', dotColor: 'bg-indigo-400' },
  ];

  const getResolvedLocation = () => scanLocation.trim() || 'Indore, India';
  const getResolvedIndustry = () => scanIndustry === 'Auto' ? 'All Industries (Mixed Scrape)' : scanIndustry;

  const handleLaunchScan = async (sourceId: string) => {
    const loc = getResolvedLocation();
    const cat = getResolvedIndustry();

    setScanningSource(sourceId);
    try {
      // 90s timeout — full pipeline (website scrape + email guess + LLM) takes 20-60s for 10 leads
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);
      const res = await fetch("/api/cron/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          location: loc,
          businessType: scanIndustry === 'Auto' ? 'Auto' : cat,
          sourceType: sourceId,
          maxLeads: 12
        })
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        alert(`🎉 ${sourceId.toUpperCase()} Scan Complete!\n\n${data.message || `Saved ${data.savedCount || data.leads?.length || 0} leads.`}\n\nCity: ${loc}\nIndustry: ${cat}`);
        if (data.leads && data.leads.length > 0) {
          setLeads(prev => [...data.leads, ...prev]);
        } else {
          window.location.reload();
        }
      } else {
        alert(`Scan error: ${data.error || data.message}`);
      }
    } catch (err: any) {
      alert(`Scan error: ${err.name === 'AbortError' ? 'Timed out (90s). The pipeline may still be running — refresh in a minute.' : err.message}`);
    } finally {
      setScanningSource(null);
    }
  };

  const handleMegaLaunchSwarm = async () => {
    const loc = getResolvedLocation();
    const cat = getResolvedIndustry();

    if (!confirm(`⚡ MEGA LAUNCH — Parallel Multi-Agent Swarm\n\nThis will spawn 6 sub-agents scraping in parallel:\n\n📍 Google Maps API\n🟣 Foursquare Places\n🗺️ OSM / Nominatim\n🔥 Reddit & RFP Intent\n📰 GDELT News Triggers\n🏢 OpenCorporates Registry\n\nCity: ${loc}\nIndustry: ${cat}\n\nAll 6 agents will run concurrently, each scraping from a different source.`)) return;

    setMegaSwarmActive(true);
    const initialStatuses: Record<string, string> = {};
    SCRAPER_SOURCES.forEach(s => { initialStatuses[s.id] = '🤖 Scanning...'; });
    setSwarmStatuses(initialStatuses);

    try {
      const promises = SCRAPER_SOURCES.map(source => {
        const controller = new AbortController();
        // 90s per agent — full enrichment pipeline needs 20-60s for 10 leads
        const timeoutId = setTimeout(() => controller.abort(), 90000);
        return fetch("/api/cron/discovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            location: loc,
            businessType: scanIndustry === 'Auto' ? 'Auto' : (source.id === 'reddit_intent' ? `${cat} agency web dev marketing` : cat),
            sourceType: source.id,
            maxLeads: 10
          })
        })
        .then(async r => {
          clearTimeout(timeoutId);
          if (!r.ok) return { sourceId: source.id, success: false, error: `HTTP ${r.status}` };
          const data = await r.json();
          setSwarmStatuses(prev => ({ ...prev, [source.id]: data.success ? `✅ ${data.savedCount || data.leads?.length || data.pipeline_log?.inserted_to_db || 0} leads found` : `❌ ${data.error || 'Failed'}` }));
          return { sourceId: source.id, ...data };
        })
        .catch(err => {
          clearTimeout(timeoutId);
          const errMsg = err.name === 'AbortError' ? 'Timeout (15s)' : err.message;
          setSwarmStatuses(prev => ({ ...prev, [source.id]: `❌ Error: ${errMsg}` }));
          return { sourceId: source.id, success: false, error: errMsg };
        });
      });

      const results = await Promise.allSettled(promises);

      let allNewLeads: any[] = [];
      let summaryLines: string[] = [];

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value?.success) {
          const count = result.value.savedCount || result.value.leads?.length || result.value.pipeline_log?.inserted_to_db || 0;
          const src = SCRAPER_SOURCES.find(s => s.id === result.value.sourceId);
          summaryLines.push(`${src?.label || result.value.sourceId}: ${count} leads`);
          if (result.value.leads) allNewLeads = [...allNewLeads, ...result.value.leads];
        }
      }

      alert(`🎉 MEGA SWARM COMPLETE!\n\nCity: ${loc} | Industry: ${cat}\n\n${summaryLines.join('\n') || 'All agents finished.'}\n\nTotal new leads injected: ${allNewLeads.length}`);

      if (allNewLeads.length > 0) {
        setLeads(prev => [...allNewLeads, ...prev]);
      } else {
        window.location.reload();
      }
    } catch (e: any) {
      alert(`Mega launch error: ${e.message}`);
    } finally {
      setMegaSwarmActive(false);
      const doneStatuses: Record<string, string> = {};
      SCRAPER_SOURCES.forEach(s => { doneStatuses[s.id] = '✅ Done'; });
      setSwarmStatuses(doneStatuses);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      
      <main className="md:ml-72 p-4 md:p-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold">Lead Radar</h1>
              <p className="text-muted-foreground mt-1">AI-scouted targets waiting for your engagement.</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <button
                onClick={async () => {
                  if (confirm(`Trigger 1-Click Auto-Outreach across all emailable New leads? This will generate evidence-based personalized emails and send them automatically via your verified Gmail SMTP.`)) {
                    setLoading(true);
                    try {
                      const res = await fetch("/api/cron/enroll-and-send-bulk", { method: "POST" });
                      const data = await res.json();
                      if (data.success) {
                        alert(`🎉 1-Click Outreach Success! Dispatched ${data.sentCount} personalized emails via Gmail. ${data.totalRemainingNew} remaining.`);
                        
                        const sentIds = new Set((data.sentResults || []).map((r: any) => r.id));
                        setLeads(prev => prev.map(l => sentIds.has(l.id) ? { ...l, status: 'Contacted' } : l));
                      } else {
                        alert(`Bulk send error: ${data.error}`);
                      }
                    } catch (e: any) {
                      alert(`Bulk send error: ${e.message}`);
                    } finally {
                      setLoading(false);
                    }
                  }
                }}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-bold text-xs uppercase tracking-widest cursor-pointer shadow-md active:scale-95 disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> ⚡ 1-Click Email Auto-Send ({leads.filter(l => (l.status || '').toLowerCase() === 'new' && l.email && l.email.includes('@')).length})
              </button>

              <button
                onClick={startWaQueue}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white hover:bg-emerald-700 transition-all font-bold text-xs uppercase tracking-widest cursor-pointer shadow-md active:scale-95 disabled:opacity-50"
              >
                <MessageSquare className="w-4 h-4" /> 📲 WhatsApp Web Queue Runner ({leads.filter(l => (l.status || '').toLowerCase() === 'new' && l.phone && l.phone.length > 5).length})
              </button>
            </div>
          </div>

          {/* ═══════════════ MULTI-SOURCE SCRAPER COMMAND CENTER ═══════════════ */}
          <div className="bg-card border border-border/80 p-6 mb-8 rounded-xl shadow-lg relative overflow-hidden">
            {/* Decorative gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/3 via-transparent to-accent/3 pointer-events-none" />
            
            <div className="relative z-10">
              {/* Header + Mega Launch */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
                <div>
                  <span className="text-sm font-mono uppercase tracking-widest text-primary flex items-center gap-1.5 font-black">
                    <Target className="w-4 h-4 text-primary animate-pulse" /> MULTI-SOURCE SCRAPER COMMAND CENTER
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">Select your city &amp; industry below → Click any source to scrape, or MEGA LAUNCH all 6 sub-agents in parallel.</p>
                </div>

                <button
                  onClick={handleMegaLaunchSwarm}
                  disabled={megaSwarmActive || !!scanningSource}
                  className="flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-amber-500 via-orange-600 to-red-600 hover:from-amber-600 hover:to-red-700 text-white font-black text-xs uppercase tracking-widest transition-all cursor-pointer shadow-lg active:scale-95 disabled:opacity-50 rounded-lg whitespace-nowrap"
                >
                  {megaSwarmActive ? "⚡ 6 AGENTS ACTIVE..." : "⚡ MEGA LAUNCH ALL 6 SWARMS"}
                </button>
              </div>

              {/* SHARED CITY + INDUSTRY INPUTS — used by ALL sources */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5 p-4 bg-background/60 border border-border rounded-lg">
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold mb-1.5 block">🏙️ Target City / Location</label>
                  <input
                    type="text"
                    placeholder="E.g. Indore, India  ·  Dubai, UAE  ·  New York, US"
                    value={scanLocation}
                    onChange={(e) => setScanLocation(e.target.value)}
                    className="w-full px-4 py-2.5 bg-background border border-border focus:outline-none focus:border-primary transition-colors text-sm font-mono placeholder:text-muted-foreground rounded-md"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold mb-1.5 block">🏭 Target Industry / Keyword</label>
                  <select
                    value={scanIndustry}
                    onChange={(e) => setScanIndustry(e.target.value)}
                    className="w-full px-4 py-2.5 bg-background border border-border focus:outline-none focus:border-primary transition-colors text-sm font-mono text-foreground rounded-md"
                  >
                    <option value="Auto">Auto (All Industries)</option>
                    <optgroup label="── General Industries ──">
                      <option value="Restaurants & Cafés">Restaurants & Cafés</option>
                      <option value="Real Estate">Real Estate</option>
                      <option value="Dental & Medical Clinics">Dental & Medical Clinics</option>
                      <option value="Fitness & Gyms">Fitness & Gyms</option>
                      <option value="Beauty & Wellness">Beauty & Wellness</option>
                      <option value="Hotels & Hospitality">Hotels & Hospitality</option>
                      <option value="Automotive">Automotive</option>
                      <option value="Education & Coaching">Education & Coaching</option>
                      <option value="Home & Interiors">Home & Interiors</option>
                      <option value="Professional Services">Professional Services</option>
                      <option value="Retail & Boutiques">Retail & Boutiques</option>
                    </optgroup>
                    <optgroup label="── Agency Industries (Akarsa One) ──">
                      <option value="Digital Marketing Agency">Digital Marketing Agency</option>
                      <option value="Social Media Agency">Social Media Agency</option>
                      <option value="Advertising Agency">Advertising Agency</option>
                      <option value="Branding Studio">Branding Studio</option>
                      <option value="PR Firm">PR Firm</option>
                      <option value="Marketing Consultant">Marketing Consultant</option>
                      <option value="SEO Agency">SEO Agency</option>
                      <option value="Web Design Agency">Web Design Agency</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* LIVE SWARM HUD MONITOR */}
              {megaSwarmActive && (
                <div className="bg-background/90 border border-primary/40 p-4 rounded-lg mb-5">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-primary font-bold mb-3">🛰️ LIVE SWARM STATUS MONITOR</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {SCRAPER_SOURCES.map(source => (
                      <div key={source.id} className="flex items-center gap-2 text-xs font-mono p-2 bg-card/50 rounded border border-border/50">
                        <span className={`w-2 h-2 rounded-full ${source.dotColor} ${swarmStatuses[source.id]?.includes('Scanning') ? 'animate-pulse' : ''}`} />
                        <span className="text-muted-foreground truncate">{source.label.split(' ').slice(1).join(' ')}:</span>
                        <span className="text-foreground font-semibold truncate">{swarmStatuses[source.id] || 'Idle'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 6 DEDICATED SOURCE LAUNCH BUTTONS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {SCRAPER_SOURCES.map(source => (
                  <button
                    key={source.id}
                    onClick={() => handleLaunchScan(source.id)}
                    disabled={megaSwarmActive || !!scanningSource}
                    className={`flex flex-col items-start gap-1 px-4 py-3 border ${source.color} font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm active:scale-[0.97] disabled:opacity-50 rounded-lg text-left relative overflow-hidden`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-sm">{source.label}</span>
                      {scanningSource === source.id && (
                        <span className="text-[10px] animate-pulse font-mono">Scanning...</span>
                      )}
                    </div>
                    <span className="text-[10px] opacity-70 font-normal normal-case tracking-normal">{source.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search targets..." 
                className="pl-9 pr-4 py-2 bg-background border border-border text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-full transition-all font-mono"
              />
            </div>
            
            <div className="relative">
              <button 
                onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-background border border-border text-sm hover:bg-secondary transition-colors font-mono uppercase tracking-widest"
              >
                <Filter className="w-4 h-4" /> 
                {statusFilter || "All Statuses"} 
                <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
              </button>
              <AnimatePresence>
                {filterMenuOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-48 bg-card border border-border shadow-xl z-50 overflow-hidden"
                  >
                    <button onClick={() => { setStatusFilter(null); setFilterMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-secondary transition-colors font-mono uppercase tracking-widest">All Statuses</button>
                    <button onClick={() => { setStatusFilter('New'); setFilterMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-secondary transition-colors text-primary font-medium font-mono uppercase tracking-widest">New</button>
                    <button onClick={() => { setStatusFilter('Contacted'); setFilterMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-secondary transition-colors text-blue-500 font-medium font-mono uppercase tracking-widest">Contacted</button>
                    <button onClick={() => { setStatusFilter('Won'); setFilterMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-secondary transition-colors text-accent font-medium font-mono uppercase tracking-widest">Won</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="bg-card border border-border overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-secondary/50 border-b border-border">
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest font-heading">Company</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest font-heading">Contact</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest font-heading">Intel</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest font-heading">Industry</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest font-heading">AI Hook</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest font-heading">Status</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest font-heading text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-muted-foreground font-mono">Loading leads...</td>
                  </tr>
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-muted-foreground font-mono">No leads found matching your filters.</td>
                  </tr>
                ) : filteredLeads.map((lead, idx) => {
                  const score = lead.score_total || lead.quality_score || 0;
                  const grade = lead.score_grade || lead.intel_grade || (score >= 50 ? 'A' : (score >= 35 ? 'B' : (score >= 15 ? 'C' : 'D')));
                  const gradeColors: Record<string, string> = { A: 'bg-green-500/10 text-green-500 border-green-500/30', B: 'bg-blue-500/10 text-blue-500 border-blue-500/30', C: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30', D: 'bg-red-500/10 text-red-500 border-red-500/30' };
                  
                  return (
                  <motion.tr 
                    key={lead.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="border-b border-border/50 hover:bg-secondary/30 transition-colors group"
                  >
                    <td className="p-4">
                      <div className="font-bold font-heading uppercase tracking-wide">{lead.company_name}</div>
                      {lead.location && <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[200px]">{lead.location}</div>}
                    </td>
                    <td className="p-4">
                      <div className="text-sm font-medium">{lead.contact_name || 'N/A'}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{lead.phone || lead.email || 'No contact'}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`w-8 h-8 flex items-center justify-center text-sm font-black border rounded-lg ${gradeColors[grade] || gradeColors.D}`}>
                          {grade}
                        </span>
                        <span className="text-[9px] text-muted-foreground font-mono">{score}/100</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 bg-background text-foreground text-[10px] font-medium border border-border uppercase tracking-widest">
                        {lead.industry}
                      </span>
                    </td>
                    <td className="p-4 text-sm max-w-[200px] truncate text-muted-foreground font-mono">
                      "{lead.ai_hook_draft || 'Generating...'}"
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 text-[10px] uppercase tracking-widest font-bold border ${
                        lead.status === 'New' ? 'bg-primary/10 text-primary border-primary/20' : 
                        lead.status === 'Contacted' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 
                        'bg-accent/10 text-accent border-accent/20'
                      }`}>
                        {lead.status || 'New'}
                      </span>
                    </td>
                    <td className="p-4 text-right flex justify-end gap-2">
                      <button 
                        onClick={() => handleDeleteLead(lead.id, lead.company_name)}
                        className="inline-block p-2 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all opacity-0 group-hover:opacity-100 cursor-pointer border border-transparent hover:border-destructive"
                        title="Delete Lead"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {lead.status === 'Contacted' && (
                        <button 
                          onClick={() => handleMarkReplied(lead)}
                          className="inline-block p-2 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all opacity-0 group-hover:opacity-100 cursor-pointer border border-transparent hover:border-[#25D366]"
                          title="Mark WhatsApp Replied"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        onClick={() => handleEditLead(lead)}
                        className="inline-block p-2 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all opacity-0 group-hover:opacity-100 cursor-pointer border border-transparent hover:border-primary"
                        title="Edit Phone"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {/* WhatsApp Send Button - always visible */}
                      {lead.phone && (
                        <a
                          href={`https://wa.me/${(lead.phone || '').replace(/[\s\-()]/g, '').replace(/^\+/, '')}?text=${encodeURIComponent(lead.ai_hook_draft || `Hi! I came across ${lead.company_name} and had a quick question.`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={async (e) => {
                            // Mark lead as Contacted when they click Send
                            await supabase.from('leads').update({ status: 'Contacted' }).eq('id', lead.id);
                            setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'Contacted' } : l));
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#25D366] text-white hover:bg-[#20bd5a] hover:shadow-lg hover:shadow-[#25D366]/30 transition-all cursor-pointer border border-[#25D366] font-bold text-[10px] uppercase tracking-widest"
                          title="Send via WhatsApp"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Send
                        </a>
                      )}
                      <button
                        onClick={() => handlePromoteToDream25(lead)}
                        className="inline-block p-2 bg-[#f59e0b]/10 text-[#f59e0b] hover:bg-[#f59e0b] hover:text-white transition-all opacity-0 group-hover:opacity-100 cursor-pointer border border-transparent hover:border-[#f59e0b]"
                        title="Promote to Dream 25"
                      >
                        <Target className="w-4 h-4" />
                      </button>
                      <Link 
                        href={`/campaigns?leadId=${lead.id}`}
                        className="inline-block p-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-all opacity-0 group-hover:opacity-100 border border-primary"
                        title="Start Campaign"
                      >
                        <Mail className="w-4 h-4" />
                      </Link>
                    </td>
                  </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* WHATSAPP WEB QUEUE RUNNER MODAL */}
        <AnimatePresence>
          {waModalOpen && waQueue.length > 0 && waIndex < waQueue.length && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
            >
              <div className="bg-card border border-border max-w-lg w-full p-6 shadow-2xl rounded-none">
                <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
                  <div className="flex items-center gap-2 text-emerald-500 font-bold uppercase tracking-widest text-sm">
                    <MessageSquare className="w-4 h-4" /> WhatsApp Web Queue Runner
                  </div>
                  <span className="text-xs font-mono bg-secondary px-2 py-1">
                    Lead {waIndex + 1} of {waQueue.length}
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="font-bold text-lg">{waQueue[waIndex].company_name}</h3>
                    <p className="text-xs text-muted-foreground font-mono">
                      Phone: {waQueue[waIndex].phone} | Location: {waQueue[waIndex].geo || waQueue[waIndex].location || 'N/A'}
                    </p>
                  </div>

                  <div className="p-3 bg-secondary/50 border border-border text-xs font-mono leading-relaxed">
                    <p className="font-bold text-primary mb-1">Pre-filled WhatsApp Copy:</p>
                    Hi {waQueue[waIndex].company_name} Team! Saw your profile in {waQueue[waIndex].geo || waQueue[waIndex].location || 'your area'}. We help top local businesses scale revenue with automated client acquisition infrastructure. Would you be open to a quick 5-minute chat?
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <button
                      onClick={() => setWaModalOpen(false)}
                      className="px-4 py-2 border border-border text-xs uppercase tracking-widest hover:bg-secondary transition-colors"
                    >
                      Close Queue
                    </button>
                    
                    <button
                      onClick={handleSendCurrentWa}
                      className="flex-1 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg"
                    >
                      <Send className="w-4 h-4" /> Open in WhatsApp Web & Next ➔
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
