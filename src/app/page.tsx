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
    // 1. Fetch metrics
    const { count: leadsCount } = await supabase.from('leads').select('*', { count: 'exact', head: true });
    const { count: emailsCount } = await supabase.from('outreach_messages').select('*', { count: 'exact', head: true }).neq('status', 'received');
    const { count: repliesCount } = await supabase.from('outreach_messages').select('*', { count: 'exact', head: true }).eq('status', 'received');
    
    let convRate = "0%";
    if (emailsCount && emailsCount > 0 && repliesCount !== null) {
      convRate = ((repliesCount / emailsCount) * 100).toFixed(1) + "%";
    }

    setMetrics({
      totalLeads: leadsCount || 0,
      emailsSent: emailsCount || 0,
      meetingsBooked: repliesCount || 0, // Mapping replies to meetings booked for now
      conversionRate: convRate
    });

    // 2. Fetch Recent Activity
    const { data: activityData } = await supabase
      .from('outreach_messages')
      .select(`
        id,
        sent_at,
        channel,
        status,
        outreach_sequences!inner(
          leads!inner(
            company_name
          )
        )
      `)
      .order('sent_at', { ascending: false })
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

    // 5. Fetch Hit List (Safe fetch to prevent crashing if lead_signals is missing)
    const { data: hitData } = await supabase
      .from('leads')
      .select('*')
      .eq('status', 'New')
      .gt('quality_score', 0)
      .order('quality_score', { ascending: false, nullsFirst: false })
      .limit(15);
    
    if (hitData) {
      // Attempt to fetch signals separately so it doesn't crash the main query if table is missing
      const { data: signals } = await supabase.from('lead_signals').select('*').in('lead_id', hitData.map(l => l.id)).catch(() => ({ data: null }));
      
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {/* Stat Cards */}
            {[
              { title: "Total Leads", value: metrics.totalLeads.toString(), icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
              { title: "Messages Sent", value: metrics.emailsSent.toString(), icon: Mail, color: "text-primary", bg: "bg-primary/10" },
              { title: "Replies Received", value: metrics.meetingsBooked.toString(), icon: CheckCircle2, color: "text-accent", bg: "bg-accent/10" },
              { title: "Reply Rate", value: metrics.conversionRate, icon: TrendingUp, color: "text-orange-500", bg: "bg-orange-500/10" },
            ].map((stat, idx) => (
              <motion.div 
                key={idx}
                whileHover={{ y: -5 }}
                className="p-6 bg-card border border-border flex items-center gap-4 relative overflow-hidden group"
              >
                <div className={`w-12 h-12 flex items-center justify-center border border-border ${stat.bg} ${stat.color}`}>
                  <stat.icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-widest font-semibold">{stat.title}</p>
                  <h3 className="text-3xl font-bold mt-1 text-foreground font-heading">{stat.value}</h3>
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
                  <h3 className="text-xl font-bold font-heading uppercase tracking-wide">30-Day Lead Pipeline Forecast</h3>
                  {forecastState.historyDays >= 7 && forecastState.forecast ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      Powered by ARIMA · {forecastState.forecast.summary.predicted_total_30d} predicted leads · Avg {forecastState.forecast.summary.predicted_avg_daily}/day
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      Building forecast — need ~7 days of activity (currently Day {forecastState.historyDays} of 7)
                    </p>
                  )}
                </div>
              </div>
              <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold border border-primary/20">
                [ AI ENGINE v1.0 ]
              </span>
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
                <input
                  type="text"
                  placeholder="E.g. Dubai, UAE (Leave blank for auto)"
                  value={scanLocation}
                  onChange={(e) => setScanLocation(e.target.value)}
                  className="w-full px-4 py-3 bg-background border border-border mb-3 focus:outline-none focus:border-primary transition-colors text-sm font-mono placeholder:text-muted-foreground"
                />
                <select
                  value={scanIndustry}
                  onChange={(e) => setScanIndustry(e.target.value)}
                  className="w-full px-4 py-3 bg-background border border-border mb-3 focus:outline-none focus:border-primary transition-colors text-sm font-mono text-foreground"
                >
                  <option value="Auto">Auto (All Industries)</option>
                  {INDUSTRY_MAP.map(ind => (
                    <option key={ind.label} value={ind.label}>{ind.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground font-mono mb-4 uppercase tracking-widest text-center">
                  Note: Discovers physical locations only (no D2C/e-commerce)
                </p>
                <button 
                  onClick={handleManualScan}
                  disabled={isScanning}
                  className="w-full py-3 flex justify-center items-center gap-2 bg-primary text-primary-foreground font-bold font-heading tracking-wide uppercase hover:bg-primary/90 transition-colors disabled:opacity-50 border border-primary"
                >
                  {isScanning ? <><Loader2 className="w-5 h-5 animate-spin" /> Scanning...</> : "Launch Manual Scan"}
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
