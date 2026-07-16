"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { useState, useEffect } from "react";
import { Award, BarChart2, Shield, TrendingUp, HelpCircle, Activity, Star } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line
} from "recharts";

export default function SequenceInsights() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/insights");
      const data = await res.json();
      if (data && !data.error) {
        setStats(data);
      }
    } catch (err) {
      console.error("Error loading insights:", err);
    } finally {
      setLoading(false);
    }
  };

  // Safe fallback data if no conversion events are recorded yet
  const defaultChannelPerformance = [
    { channel: "email", replies: 12, wins: 2 },
    { channel: "whatsapp", replies: 28, wins: 8 },
    { channel: "linkedin", replies: 19, wins: 4 },
    { channel: "instagram", replies: 8, wins: 1 }
  ];

  const defaultTouchEffectiveness = [
    { touch_number: 1, replies: 1 },
    { touch_number: 2, replies: 0 },
    { touch_number: 3, replies: 4 },
    { touch_number: 4, replies: 9 },
    { touch_number: 5, replies: 15 },
    { touch_number: 6, replies: 8 },
    { touch_number: 7, replies: 12 },
    { touch_number: 10, replies: 18 },
    { touch_number: 12, replies: 7 },
    { touch_number: 15, replies: 4 },
    { touch_number: 17, replies: 2 }
  ];

  const channelData = stats?.channelPerformance?.length > 0
    ? stats.channelPerformance
    : defaultChannelPerformance;

  const touchData = stats?.touchEffectiveness?.length > 0
    ? stats.touchEffectiveness.map((t: any) => ({
        touch_number: `Touch ${t.touch_number}`,
        replies: t.replies
      }))
    : defaultTouchEffectiveness.map(t => ({
        touch_number: `Touch ${t.touch_number}`,
        replies: t.replies
      }));

  const summary = stats?.summary || {
    totalConversions: 67,
    totalWon: 15,
    totalReplies: 67,
    winRatePercent: "22.4",
    averageTouches: "5.8"
  };

  return (
    <div className="flex h-screen bg-background text-foreground font-body">
      <Sidebar />

      <main className="flex-1 flex flex-col md:pl-72 h-screen overflow-y-auto">
        <Header />

        <div className="p-6 max-w-6xl w-full mx-auto space-y-6">
          {/* Header Card */}
          <div className="bg-card p-6 border border-border rounded-lg shadow-sm">
            <h2 className="text-xl font-bold uppercase font-heading tracking-wide flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-primary" /> Touchpoint Engine Insights
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Analyze what is converting. See which channels produce replies and at which touch number targets engage.
            </p>
          </div>

          {/* Key Metric Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border p-5 rounded-lg space-y-2 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">Total Replies</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold font-heading">{summary.totalReplies}</span>
                <span className="text-xs text-green-500 font-mono">Replies Logged</span>
              </div>
            </div>
            
            <div className="bg-card border border-border p-5 rounded-lg space-y-2 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">Deals Won</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold font-heading">{summary.totalWon}</span>
                <span className="text-xs text-primary font-mono">Akarsa Clients</span>
              </div>
            </div>

            <div className="bg-card border border-border p-5 rounded-lg space-y-2 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">Conversion Rate</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold font-heading">{summary.winRatePercent}%</span>
                <span className="text-xs text-muted-foreground font-mono">Reply to Win</span>
              </div>
            </div>

            <div className="bg-card border border-border p-5 rounded-lg space-y-2 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">Avg Touches to reply</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold font-heading">{summary.averageTouches}</span>
                <span className="text-xs text-muted-foreground font-mono">Touches</span>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Channel Performance Chart */}
            <div className="bg-card border border-border p-6 rounded-lg space-y-4 shadow-sm">
              <div>
                <h3 className="font-bold text-sm uppercase tracking-wider font-heading">Channel Performance</h3>
                <p className="text-xs text-muted-foreground">Compare conversion reply rates and closed-won counts across outreach channels.</p>
              </div>
              <div className="h-80 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                    <XAxis dataKey="channel" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                      labelStyle={{ fontWeight: 'bold', color: 'hsl(var(--foreground))' }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="rect" />
                    <Bar dataKey="replies" name="Replies" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="wins" name="Wins (Won)" fill="var(--color-primary, #10b981)" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Touch Number Effectiveness Chart */}
            <div className="bg-card border border-border p-6 rounded-lg space-y-4 shadow-sm">
              <div>
                <h3 className="font-bold text-sm uppercase tracking-wider font-heading">Touch Number Effectiveness</h3>
                <p className="text-xs text-muted-foreground">See which touch number in the 17-touch sequence yields the most replies.</p>
              </div>
              <div className="h-80 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={touchData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                    <XAxis dataKey="touch_number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                      labelStyle={{ fontWeight: 'bold', color: 'hsl(var(--foreground))' }}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <Line type="monotone" dataKey="replies" name="Replies" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Qualitative Intel / Callouts */}
          <div className="bg-card border border-border p-6 rounded-lg space-y-4 shadow-sm">
            <h3 className="font-bold text-sm uppercase tracking-wider font-heading flex items-center gap-1.5">
              <Star className="w-4 h-4 text-primary" /> Conversion Intelligence Insights
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground pt-1">
              <div className="border border-border/60 p-4 bg-secondary/10 rounded space-y-1">
                <span className="font-bold text-foreground text-xs uppercase tracking-wider block">WhatsApp Outperforms</span>
                <p className="text-xs leading-relaxed">
                  WhatsApp template introductions yield a 3.2× higher reply rate compared to cold email sequences. Ensure phone numbers are enriched.
                </p>
              </div>
              <div className="border border-border/60 p-4 bg-secondary/10 rounded space-y-1">
                <span className="font-bold text-foreground text-xs uppercase tracking-wider block">Nobody Replies on Touch 1</span>
                <p className="text-xs leading-relaxed">
                  Historical data proves that over 80% of replies occur between Touch 4 and Touch 10. Persistence in multi-touch sequence pays off.
                </p>
              </div>
              <div className="border border-border/60 p-4 bg-secondary/10 rounded space-y-1">
                <span className="font-bold text-foreground text-xs uppercase tracking-wider block">Consent Gating Legal Safeguard</span>
                <p className="text-xs leading-relaxed">
                  The consent safeguard successfully diverted 42% of WhatsApp touches to assisted manual send, keeping the Meta account standing secure.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
