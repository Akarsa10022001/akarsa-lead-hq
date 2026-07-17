"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion } from "framer-motion";
import { BrainCircuit, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export default function LearnDashboard() {
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    setLoading(true);
    // Fetching from the learn_insights view created in 011_lead_engine_loop.sql
    // This view enforces the > 15 sample size limit internally.
    const { data, error } = await supabase.from('learn_insights').select('*').order('win_rate', { ascending: false });
    if (!error && data) {
      setInsights(data);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="p-4 md:p-8 flex-1">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-primary/10 flex items-center justify-center border border-primary/20">
                <BrainCircuit className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-heading uppercase tracking-wide">Machine Learning Insights</h1>
                <p className="text-muted-foreground text-sm mt-1">Read-only outcome analysis to manually adjust score weights (Minimum sample size: 15 attempts).</p>
              </div>
            </div>

            <div className="bg-card border border-border p-6 mb-8">
              <div className="flex items-center gap-2 mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>
                  <strong>CRITICAL:</strong> Do not blindly adjust weights based on low sample sizes. Only statistically significant cohorts (&gt;15 attempts) are shown here to prevent fabricated confidence.
                </span>
              </div>

              {loading ? (
                <p className="text-muted-foreground text-sm font-mono animate-pulse">Analyzing conversions...</p>
              ) : insights.length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed border-border flex flex-col items-center">
                  <BrainCircuit className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
                  <h3 className="text-lg font-bold text-foreground">Insufficient Data</h3>
                  <p className="text-sm text-muted-foreground max-w-md mt-2">
                    No cohort has reached the minimum sample size of 15 outreach attempts yet. Keep running the engine to generate statistically significant insights.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 font-medium">Industry</th>
                        <th className="px-4 py-3 font-medium">Geo Region</th>
                        <th className="px-4 py-3 font-medium">Runs Ads?</th>
                        <th className="px-4 py-3 font-medium text-right">Total Attempts</th>
                        <th className="px-4 py-3 font-medium text-right text-green-500">Wins</th>
                        <th className="px-4 py-3 font-medium text-right">Win Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insights.map((row, i) => (
                        <tr key={i} className="border-b border-border hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium">{row.industry || 'Unknown'}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.geo || 'Unknown'}</td>
                          <td className="px-4 py-3">
                            {row.runs_ads ? (
                              <span className="px-2 py-1 bg-green-500/10 text-green-500 rounded text-xs font-bold border border-green-500/20">YES</span>
                            ) : (
                              <span className="px-2 py-1 bg-red-500/10 text-red-500 rounded text-xs font-bold border border-red-500/20">NO</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{row.attempts}</td>
                          <td className="px-4 py-3 text-right font-mono text-green-500 font-bold">{row.wins}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold">
                            {(row.win_rate * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
