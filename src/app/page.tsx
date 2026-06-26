"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion } from "framer-motion";
import { Users, Mail, CheckCircle2, TrendingUp, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

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
  };

  const handleManualScan = async () => {
    setIsScanning(true);
    try {
      const res = await fetch('/api/cron/discovery', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Scan complete! Found ${data.leads?.length || 0} leads.`);
        fetchDashboardData(); // Refresh metrics
      } else {
        alert("Scan failed: " + data.error);
      }
    } catch (e) {
      alert("Error triggering scan.");
    } finally {
      setIsScanning(false);
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
                className="p-6 rounded-2xl bg-card border border-border flex items-center gap-4 relative overflow-hidden group"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color}`}>
                  <stat.icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-muted-foreground text-sm font-medium">{stat.title}</p>
                  <h3 className="text-3xl font-bold mt-1 text-foreground">{stat.value}</h3>
                </div>
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-gradient-to-br from-transparent to-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors"></div>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Activity Feed */}
            <div className="lg:col-span-2 p-6 rounded-2xl bg-card border border-border">
              <h3 className="text-lg font-bold mb-4">Recent Activity</h3>
              <div className="space-y-4">
                {recentActivity.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No activity yet. Run a scan to find leads!</p>
                ) : (
                  recentActivity.map((activity, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-4 rounded-xl bg-secondary/50 border border-border/50">
                      <div className={`w-2 h-2 rounded-full ${activity.status === 'received' ? 'bg-accent' : 'bg-primary'}`}></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {activity.status === 'received' 
                            ? `Received reply from ${activity.outreach_sequences.leads.company_name} via ${activity.channel}` 
                            : `Sent ${activity.channel} to ${activity.outreach_sequences.leads.company_name}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(activity.sent_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                  AI Agent Status
                </h3>
                <div className="p-4 rounded-xl bg-background border border-border mb-4">
                  <p className="text-sm text-muted-foreground mb-2">Last Scheduled Run:</p>
                  <p className="font-mono font-bold text-lg">{lastRun}</p>
                  <p className="text-xs text-primary mt-1">Status: Sleeping (cron at 09:00 UTC)</p>
                </div>

                <div className="mb-6">
                  <h4 className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider">Dynamic Quests</h4>
                  {quests.map((q, i) => (
                    <div key={i} className="mb-3 last:mb-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span>{q.label}</span>
                        <span className="text-primary font-mono">{q.current}/{q.target}</span>
                      </div>
                      <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
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

              <button 
                onClick={handleManualScan}
                disabled={isScanning}
                className="w-full py-3 flex justify-center items-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors shadow-[0_0_20px_rgba(147,51,234,0.3)] disabled:opacity-50 disabled:shadow-none"
              >
                {isScanning ? <><Loader2 className="w-5 h-5 animate-spin" /> Scanning OSM...</> : "Launch Manual Scan"}
              </button>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
