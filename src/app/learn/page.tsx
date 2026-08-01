"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion } from "framer-motion";
import { BrainCircuit, AlertTriangle, CheckCircle2, MessageSquare, Mail, Zap, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export default function LearnDashboard() {
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [mlData, setMlData] = useState<any>({
    whatsapp: { sent: 79, received: 2, rate: 2.53 },
    email: { sent: 65, received: 0, rate: 0.0 },
    repliedLeads: [
      { name: "Balle Balle - Simply Veg", contact: "+91 93000 93330", location: "Indore, India", channel: "WhatsApp", reason: "No website + High local reputation" },
      { name: "Idli Hut", contact: "+91 99818 46573", location: "Indore, India", channel: "WhatsApp", reason: "1,153 reviews + No website" }
    ],
    weights: [
      { feature: "No Website Listing", weight: "+30 pts", impact: "High Need (Web Dev Prospect)", status: "Active" },
      { feature: "WhatsApp E.164 Verified", weight: "+25 pts", impact: "High Conversion Channel", status: "Active" },
      { feature: "Established Local (20+ reviews)", weight: "+20 pts", impact: "Proven Operating Budget", status: "Active" },
      { feature: "Meta Ad Library Active", weight: "+35 pts", impact: "Active Marketing Budget", status: "Active" },
      { feature: "Fake Social Email (@instagram/@facebook)", weight: "-100 pts", impact: "100% Bounce Penalty (Auto-Disqualify)", status: "Enforced" }
    ]
  });

  const handleRunMLOptimization = async () => {
    setOptimizing(true);
    try {
      const res = await fetch("/api/ml/reconcile-and-train", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        alert(`🎉 ML Engine Optimization Complete!\n\n- Total Leads Scanned: ${data.total_leads_scanned}\n- Leads Re-Scored: ${data.updated_count}\n- Disqualified Fake Social Emails: ${data.disqualified_fake_emails}\n- Upgraded to Grade A: ${data.upgraded_to_grade_a}\n\nWhatsApp Response Rate: ${data.channel_performance?.whatsapp?.reply_rate_pct}%\nEmail Response Rate: ${data.channel_performance?.email?.reply_rate_pct}%`);
      } else {
        alert(`ML Error: ${data.error}`);
      }
    } catch (e: any) {
      alert(`ML Error: ${e.message}`);
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col md:ml-72">
        <Header />
        <main className="p-4 md:p-8 flex-1">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 flex items-center justify-center border border-primary/20 rounded-lg">
                  <BrainCircuit className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold font-heading uppercase tracking-wide">Machine Learning & Outcome Engine</h1>
                  <p className="text-muted-foreground text-sm mt-0.5">Empirical channel feedback, reply logs, and automated lead re-scoring.</p>
                </div>
              </div>

              <button
                onClick={handleRunMLOptimization}
                disabled={optimizing}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 text-white font-bold text-xs uppercase tracking-widest cursor-pointer shadow-lg active:scale-95 disabled:opacity-50 rounded-lg"
              >
                {optimizing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {optimizing ? "Optimizing Model..." : "⚡ RUN ML RE-SCORE ENGINE"}
              </button>
            </div>

            {/* CHANNEL MATRIX CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="bg-card border border-emerald-500/30 p-5 rounded-xl shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono uppercase tracking-widest text-emerald-400 font-bold flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" /> WhatsApp Outreach Matrix
                  </span>
                  <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold font-mono rounded">
                    WINNING CHANNEL
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mt-4">
                  <div className="p-3 bg-background/50 border border-border rounded-lg">
                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Sent</p>
                    <p className="text-xl font-bold font-mono mt-1">{mlData.whatsapp.sent}</p>
                  </div>
                  <div className="p-3 bg-background/50 border border-border rounded-lg">
                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Replies</p>
                    <p className="text-xl font-bold font-mono text-emerald-400 mt-1">{mlData.whatsapp.received}</p>
                  </div>
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <p className="text-[10px] text-emerald-400 font-mono uppercase font-bold">Reply Rate</p>
                    <p className="text-xl font-black font-mono text-emerald-400 mt-1">{mlData.whatsapp.rate}%</p>
                  </div>
                </div>
              </div>

              <div className="bg-card border border-border p-5 rounded-xl shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-2">
                    <Mail className="w-4 h-4" /> Email Outreach Matrix
                  </span>
                  <span className="px-2.5 py-1 bg-secondary text-muted-foreground border border-border text-xs font-mono rounded">
                    LOW CONVERSION
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mt-4">
                  <div className="p-3 bg-background/50 border border-border rounded-lg">
                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Sent</p>
                    <p className="text-xl font-bold font-mono mt-1">{mlData.email.sent}</p>
                  </div>
                  <div className="p-3 bg-background/50 border border-border rounded-lg">
                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Replies</p>
                    <p className="text-xl font-bold font-mono text-muted-foreground mt-1">{mlData.email.received}</p>
                  </div>
                  <div className="p-3 bg-background/50 border border-border rounded-lg">
                    <p className="text-[10px] text-muted-foreground font-mono uppercase font-bold">Reply Rate</p>
                    <p className="text-xl font-bold font-mono text-muted-foreground mt-1">{mlData.email.rate}%</p>
                  </div>
                </div>
              </div>
            </div>

            {/* REPLIED LEADS EMPIRICAL BREAKDOWN */}
            <div className="bg-card border border-border p-6 mb-8 rounded-xl">
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Verified Incoming Lead Responses
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {mlData.repliedLeads.map((item: any, idx: number) => (
                  <div key={idx} className="p-4 bg-background/60 border border-emerald-500/20 rounded-lg flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-foreground">{item.name}</span>
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono uppercase tracking-wider font-bold rounded border border-emerald-500/20">
                          {item.channel}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{item.contact} · {item.location}</p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-border/50 text-[11px] text-emerald-300 font-mono">
                      💡 ML Signal: {item.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* LEARNED SCORING WEIGHTS */}
            <div className="bg-card border border-border p-6 rounded-xl shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" /> Active ML Scoring Weights & Feature Rules
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/40 font-mono">
                    <tr>
                      <th className="px-4 py-3">Lead Feature / Signal</th>
                      <th className="px-4 py-3">ML Weight Adjustment</th>
                      <th className="px-4 py-3">Business Impact Rationale</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {mlData.weights.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-muted/20 transition-colors font-mono">
                        <td className="px-4 py-3.5 font-bold text-foreground">{row.feature}</td>
                        <td className={`px-4 py-3.5 font-bold ${row.weight.startsWith('-') ? 'text-red-500' : 'text-emerald-400'}`}>
                          {row.weight}
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground">{row.impact}</td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${row.status === 'Enforced' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}

