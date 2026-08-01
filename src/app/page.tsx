"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Mail, CheckCircle2, TrendingUp, Loader2, BrainCircuit, X, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import HitList from "@/components/dashboard/HitList";
import { INDUSTRY_MAP } from "@/lib/connectors/industries";

export default function Home() {
  const [isScanning, setIsScanning] = useState(false);
  const [metrics, setMetrics] = useState({
    totalLeads: 0,
    emailsSent: 0,
    meetingsBooked: 0, // Placeholder for future feature
    conversionRate: "0%"
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [lastRun, setLastRun] = useState<string>("Unknown");
  const [forecastState, setForecastState] = useState<{ historyDays: number; forecast: any | null }>({ historyDays: 0, forecast: null });
  const [hitListLeads, setHitListLeads] = useState<any[]>([]);
  const [toast, setToast] = useState<{show: boolean; title: string; desc: string; type: 'success'|'error'}>({show: false, title: '', desc: '', type: 'success'});

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    // 1. Fetch Funnel Metrics
    const { count: rawLeadsCount } = await supabase.from('leads').select('*', { count: 'exact', head: true });
    const { count: readyLeadsCount } = await supabase.from('sequence_ready_leads').select('*', { count: 'exact', head: true });
    const { count: activeSequencesCount } = await supabase.from('target_sequences').select('*', { count: 'exact', head: true }).in('status', ['active', 'pending_enrollment']);
    const { count: emailsSentCount } = await supabase.from('touches').select('*', { count: 'exact', head: true }).eq('send_status', 'sent');
    const { count: receivedMsgCount } = await supabase.from('outreach_messages').select('*', { count: 'exact', head: true }).eq('status', 'received');
    const { count: convRepliesCount } = await supabase.from('conversions').select('*', { count: 'exact', head: true }).in('outcome', ['replied', 'meeting_booked', 'won']);
    const repliesCount = Math.max(receivedMsgCount || 0, convRepliesCount || 0);

    let convRate = "0%";
    if (emailsSentCount && emailsSentCount > 0 && repliesCount !== null) {
      convRate = ((repliesCount / emailsSentCount) * 100).toFixed(1) + "%";
    }

    setMetrics({
      totalLeads: rawLeadsCount || 0,
      readyLeads: readyLeadsCount || 0,
      activeSequences: activeSequencesCount || 0,
      emailsSent: emailsSentCount || 0,
      replies: repliesCount || 0,
      conversionRate: convRate
    } as any);

    // 2. Fetch Recent Activity from Touches
    const { data: activityData } = await supabase
      .from('touches')
      .select(`
        id,
        created_at,
        channel,
        send_status,
        leads!inner(
          company_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    if (activityData) {
      setRecentActivity(activityData);
    }

    // 3. Fetch Last Run (most recent lead created)
    const { data: lastLead } = await supabase
      .from('leads')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastLead) {
      setLastRun(new Date(lastLead.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
    } else {
      setLastRun("Never");
    }

    // 4. Fetch AI Forecast
    try {
      const forecastRes = await fetch('/api/forecast');
      if (forecastRes.ok) {
        const data = await forecastRes.json();
        setForecastState(data);
      }
    } catch (e) {
      console.error("Failed to fetch forecast", e);
    }

    // 5. Fetch Hit List — show recent New leads regardless of quality_score
    const { data: hitData } = await supabase
      .from('leads')
      .select('*')
      .eq('status', 'New')
      .order('created_at', { ascending: false })
      .limit(15);
    
    if (hitData && hitData.length > 0) {
      // Attempt to fetch signals separately. If table is missing, Supabase returns error and data is null.
      const { data: signals } = await supabase.from('lead_signals').select('*').in('lead_id', hitData.map(l => l.id));
      
      const leadsWithSignals = hitData.map(lead => ({
        ...lead,
        lead_signals: signals ? signals.filter(s => s.lead_id === lead.id) : []
      }));
      setHitListLeads(leadsWithSignals);
    }
  };

  const [scanLocation, setScanLocation] = useState("");
  const [scanIndustry, setScanIndustry] = useState("Auto");

  const handleManualScan = async () => {
    setIsScanning(true);
    try {
      const payload: any = {};
      if (scanLocation.trim() !== "") {
        payload.location = scanLocation.trim();
      }
      if (scanIndustry !== "Auto") {
        payload.businessType = scanIndustry;
      }

      const res = await fetch('/api/cron/discovery', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      let data;
      const rawText = await res.text();
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        throw new Error(`Server returned non-JSON response (Status ${res.status}): ` + rawText.substring(0, 100));
      }

      if (data.success) {
        let msg = `Saved ${data.leads?.length || 0} leads.`;
        if (data.pipeline_log) {
          msg = `Found: ${data.pipeline_log.fetched_from_source} | Saved: ${data.pipeline_log.inserted_to_db}`;
        }
        setToast({ show: true, title: "Scan Complete", desc: msg, type: 'success' });
        fetchDashboardData(); // Refresh metrics and HitList
      } else {
        setToast({ show: true, title: "Scan Failed", desc: (data.message || data.error || 'Unknown error'), type: 'error' });
      }
    } catch (e: any) {
      setToast({ show: true, title: "Scan Error", desc: e.message, type: 'error' });
    } finally {
      setIsScanning(false);
      setTimeout(() => setToast(prev => ({...prev, show: false})), 5000);
    }
  };

  // Compute Daily Quests dynamically based on metrics
  const quests = [
    { label: "Send 10 Outreach Messages", current: metrics.emailsSent, target: 10 },
    { label: "Find 5 New Leads", current: metrics.totalLeads, target: 5 },
    { label: "Get 1 Reply", current: metrics.meetingsBooked, target: 1 }
  ];

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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            {/* Stat Cards */}
            {[
              { title: "Total Raw Leads", value: (metrics as any).totalLeads?.toString() || "0", icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
              { title: "Sequence Ready", value: (metrics as any).readyLeads?.toString() || "0", icon: BrainCircuit, color: "text-purple-500", bg: "bg-purple-500/10" },
              { title: "Active Pipeline", value: (metrics as any).activeSequences?.toString() || "0", icon: TrendingUp, color: "text-orange-500", bg: "bg-orange-500/10" },
              { title: "Emails Dispatched", value: (metrics as any).emailsSent?.toString() || "0", icon: Mail, color: "text-primary", bg: "bg-primary/10" },
              { title: "Inbound Replies", value: (metrics as any).replies?.toString() || "0", icon: CheckCircle2, color: "text-accent", bg: "bg-accent/10" },
            ].map((stat, idx) => (
              <motion.div 
                key={idx}
                whileHover={{ y: -5 }}
                className="p-5 bg-card border border-border flex flex-col justify-between relative overflow-hidden group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 flex items-center justify-center border border-border ${stat.bg} ${stat.color}`}>
                    <stat.icon className="w-4 h-4" />
                  </div>
                  <p className="text-muted-foreground text-[10px] uppercase tracking-widest font-bold leading-tight">{stat.title}</p>
                </div>
                <div>
                  <h3 className="text-3xl font-bold text-foreground font-heading">{stat.value}</h3>
                </div>
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-gradient-to-br from-transparent to-primary/5 blur-2xl group-hover:bg-primary/10 transition-colors"></div>
              </motion.div>
            ))}
          </div>

          {/* 30-Day AI Forecast Chart */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-8 p-6 bg-card border border-border"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 flex items-center justify-center border border-primary/20">
                  <BrainCircuit className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold font-heading uppercase tracking-wide">30-Day Lead Pipeline Projection</h3>
                  {forecastState.historyDays >= 7 && forecastState.forecast ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      Run-rate projection — last 7 days extrapolated · {forecastState.forecast.summary.predicted_total_30d} projected leads · Avg {forecastState.forecast.summary.predicted_avg_daily}/day
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      Not enough history for a projection.
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            {forecastState.historyDays >= 7 && forecastState.forecast ? (
              <div className="w-full h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecastState.forecast.forecast.map((d: any) => ({
                    date: d.date.slice(5), // MM-DD format
                    predicted: d.predicted_leads,
                  }))}>
                    <defs>
                      <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis 
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                      dx={-10}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="predicted" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorPredicted)" 
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="w-full h-[250px] flex items-center justify-center border-2 border-dashed border-border rounded-xl bg-muted/20">
                <div className="text-center max-w-sm px-6">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  </div>
                  <h4 className="text-foreground font-semibold mb-2">Analyzing Pipeline Data</h4>
                  <p className="text-muted-foreground text-sm">
                    Keep scanning for leads and recording activity. The ARIMA model requires a baseline of historical data to predict pipeline volume accurately.
                  </p>
                  <div className="flex items-center justify-center gap-4 mt-6">
                    <div className="w-48 h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary"
                        style={{ width: `${Math.min(100, (forecastState.historyDays / 7) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-primary font-mono">{forecastState.historyDays}/7 required</span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Hit List (Replaces Activity Feed) */}
            <div className="lg:col-span-2 p-6 bg-card border border-border">
              <HitList leads={hitListLeads} onUpdate={fetchDashboardData} />
            </div>

            {/* Quick Actions */}
            <div className="p-6 bg-surface-elevated border border-border flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold font-heading uppercase tracking-wide mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                  AI Agent Status
                </h3>
                <div className="p-4 bg-background border border-border mb-4">
                  <p className="text-sm text-muted-foreground mb-2">Last Scheduled Run:</p>
                  <p className="font-mono font-bold text-lg text-foreground">{lastRun}</p>
                  <p className="text-xs text-primary mt-1">Status: Sleeping (cron at 09:00 UTC)</p>
                </div>

                <div className="mb-6">
                  <h4 className="text-xs font-bold text-muted-foreground mb-3 uppercase tracking-widest">Dynamic Quests</h4>
                  {quests.map((q, i) => (
                    <div key={i} className="mb-3 last:mb-0">
                      <div className="flex justify-between text-xs mb-1 font-medium">
                        <span>{q.label}</span>
                        <span className="text-foreground font-mono">{q.current}/{q.target}</span>
                      </div>
                      <div className="w-full h-1 bg-border overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, (q.current/q.target) * 100)}%` }}
                          className={`h-full ${q.current >= q.target ? 'bg-accent' : 'bg-primary'}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                {/* SHARED CITY + INDUSTRY INPUTS */}
                <div className="mb-3">
                  <label className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground font-bold mb-1 block">🏙️ City / Location</label>
                  <input
                    type="text"
                    placeholder="E.g. Indore, India · Dubai, UAE"
                    value={scanLocation}
                    onChange={(e) => setScanLocation(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-border mb-2 focus:outline-none focus:border-primary transition-colors text-xs font-mono placeholder:text-muted-foreground rounded-md"
                  />
                  <label className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground font-bold mb-1 block">🏭 Industry / Keyword</label>
                  <select
                    value={scanIndustry}
                    onChange={(e) => setScanIndustry(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-border mb-3 focus:outline-none focus:border-primary transition-colors text-xs font-mono text-foreground rounded-md"
                  >
                    <option value="Auto">Auto (All Industries)</option>
                    {INDUSTRY_MAP.map(ind => (
                      <option key={ind.label} value={ind.label}>{ind.label}</option>
                    ))}
                  </select>
                </div>

                {/* MEGA LAUNCH BUTTON */}
                <button 
                  onClick={async () => {
                    const loc = scanLocation.trim() || 'Indore, India';
                    const cat = scanIndustry === 'Auto' ? 'All Industries (Mixed Scrape)' : scanIndustry;
                    if (!confirm(`⚡ MEGA LAUNCH 7 Sub-Agent Swarm?\n\nCity: ${loc}\nIndustry: ${cat}\n\nAll 7 scrapers will run in parallel.`)) return;
                    setIsScanning(true);
                    setToast({ show: true, title: "⚡ Mega Swarm Active", desc: "Spawning 7 sub-agents across all sources...", type: "success" });
                    try {
                      const sources = ['google_maps', 'foursquare', 'osm', 'reddit_intent', 'gdelt_news', 'opencorporates', 'meta_ads'];
                      const results = await Promise.allSettled(sources.map(src => {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 90000);
                        return fetch("/api/cron/discovery", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          signal: controller.signal,
                          body: JSON.stringify({
                            location: loc,
                            businessType: scanIndustry === 'Auto' ? 'Auto' : cat,
                            sourceType: src,
                            maxLeads: 10
                          })
                        })
                        .then(async r => {
                          clearTimeout(timeoutId);
                          if (!r.ok) return { success: false, error: `HTTP ${r.status}` };
                          return r.json();
                        })
                        .catch(err => {
                          clearTimeout(timeoutId);
                          return { success: false, error: err.name === 'AbortError' ? 'Timeout (15s)' : err.message };
                        });
                      }));

                      const totalSaved = results.reduce((acc, res) => {
                        if (res.status === 'fulfilled' && res.value?.success) {
                          return acc + (res.value.savedCount || res.value.leads?.length || 0);
                        }
                        return acc;
                      }, 0);

                      setToast({ show: true, title: "🎉 Mega Swarm Complete", desc: `Finished! Saved ${totalSaved} new leads.`, type: "success" });
                      fetchDashboardData();
                    } catch (e: any) {
                      setToast({ show: true, title: "Swarm Error", desc: e.message, type: "error" });
                    } finally {
                      setIsScanning(false);
                    }
                  }}
                  disabled={isScanning}
                  className="w-full py-3 mb-3 flex justify-center items-center gap-2 bg-gradient-to-r from-amber-500 via-orange-600 to-red-600 hover:from-amber-600 hover:to-red-700 text-white font-black font-heading tracking-wider uppercase transition-all shadow-lg active:scale-95 disabled:opacity-50 rounded-md cursor-pointer text-[11px]"
                >
                  {isScanning ? <><Loader2 className="w-4 h-4 animate-spin" /> 6 AGENTS ACTIVE...</> : "⚡ MEGA LAUNCH ALL 6 SWARMS"}
                </button>

                {/* 6 INDIVIDUAL SOURCE BUTTONS */}
                <div className="grid grid-cols-1 gap-1.5 mb-3">
                  {[
                    { id: 'google_maps', label: '📍 Google Maps API', color: 'bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-800/60 text-emerald-200' },
                    { id: 'foursquare', label: '🟣 Foursquare Places', color: 'bg-purple-950/40 hover:bg-purple-900/50 border-purple-800/60 text-purple-200' },
                    { id: 'osm', label: '🗺️ OSM / Nominatim', color: 'bg-sky-950/40 hover:bg-sky-900/50 border-sky-800/60 text-sky-200' },
                    { id: 'reddit_intent', label: '🔥 Reddit & RFP Intent', color: 'bg-orange-950/40 hover:bg-orange-900/50 border-orange-800/60 text-orange-200' },
                    { id: 'gdelt_news', label: '📰 GDELT News Triggers', color: 'bg-rose-950/40 hover:bg-rose-900/50 border-rose-800/60 text-rose-200' },
                    { id: 'opencorporates', label: '🏢 OpenCorporates', color: 'bg-cyan-950/40 hover:bg-cyan-900/50 border-cyan-800/60 text-cyan-200' },
                    { id: 'meta_ads', label: '📣 Meta Ads', color: 'bg-blue-950/40 hover:bg-blue-900/50 border-blue-800/60 text-blue-200' },
                  ].map(src => (
                    <button
                      key={src.id}
                      onClick={async () => {
                        const loc = scanLocation.trim() || 'Indore, India';
                        const cat = scanIndustry === 'Auto' ? 'All Industries (Mixed Scrape)' : scanIndustry;
                        setIsScanning(true);
                        setToast({ show: true, title: `Scanning ${src.label}`, desc: `${loc} · ${cat}`, type: "success" });
                        try {
                          const res = await fetch("/api/cron/discovery", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              location: loc,
                              businessType: scanIndustry === 'Auto' ? 'Auto' : cat,
                              sourceType: src.id,
                              maxLeads: 10
                            })
                          });
                          const data = await res.json();
                          setToast({ show: true, title: `${src.label} Done`, desc: data.message || `Saved ${data.savedCount || 0} leads`, type: data.success ? "success" : "error" });
                          fetchDashboardData();
                        } catch (e: any) {
                          setToast({ show: true, title: "Error", desc: e.message, type: "error" });
                        } finally {
                          setIsScanning(false);
                        }
                      }}
                      disabled={isScanning}
                      className={`w-full py-1.5 border ${src.color} font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer active:scale-95 disabled:opacity-50 px-3 rounded-md flex items-center justify-between`}
                    >
                      <span>{src.label}</span>
                    </button>
                  ))}
                </div>

                {/* CUSTOM MANUAL SCAN (same as before) */}
                <button 
                  onClick={handleManualScan}
                  disabled={isScanning}
                  className="w-full py-2 flex justify-center items-center gap-2 bg-secondary text-secondary-foreground font-bold font-heading tracking-wide uppercase hover:bg-secondary/90 transition-colors disabled:opacity-50 border border-border text-[10px] rounded-md cursor-pointer"
                >
                  {isScanning ? <><Loader2 className="w-3 h-3 animate-spin" /> Scanning...</> : "Custom Manual Scan"}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </main>
      
      {/* Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={`fixed bottom-6 right-6 z-50 p-4 rounded-xl shadow-2xl border flex items-start gap-3 w-80 ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-green-500/10 border-green-500/20 text-green-500'}`}
          >
            {toast.type === 'error' ? <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />}
            <div className="flex-1">
              <h4 className="font-bold text-sm">{toast.title}</h4>
              <p className="text-xs mt-1 opacity-80">{toast.desc}</p>
            </div>
            <button onClick={() => setToast(prev => ({...prev, show: false}))} className="p-1 hover:bg-black/10 rounded-md">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
