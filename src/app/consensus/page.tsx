"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ShieldCheck, Zap, Sparkles, CheckCircle2, AlertCircle, 
  MapPin, Phone, Mail, Globe, Star, Send, MessageSquare, 
  RefreshCw, Cpu, Layers, Award
} from "lucide-react";
import { useState } from "react";

const AGENTS = [
  { id: 'google_maps', name: 'Google Maps Agent', role: 'GMB Reputation & Reviews', icon: '📍', color: 'border-emerald-500/50 text-emerald-400' },
  { id: 'meta_ads', name: 'Meta Ad Library Agent', role: 'Active Marketing Budget', icon: '🔥', color: 'border-blue-500/50 text-blue-400' },
  { id: 'foursquare', name: 'Foursquare Places Agent', role: 'Venue Depth & Foot Traffic', icon: '🟣', color: 'border-purple-500/50 text-purple-400' },
  { id: 'osm', name: 'OSM / Nominatim Agent', role: 'GEO Coordinates & Address', icon: '🗺️', color: 'border-sky-500/50 text-sky-400' },
  { id: 'reddit_intent', name: 'Reddit & RFP Intent Agent', role: 'Community Buying Signals', icon: '⚡', color: 'border-amber-500/50 text-amber-400' },
  { id: 'gdelt_news', name: 'GDELT News Agent', role: 'Press Releases & Expansions', icon: '📰', color: 'border-indigo-500/50 text-indigo-400' },
  { id: 'opencorporates', name: 'OpenCorporates Agent', role: 'Trade Registration & Status', icon: '🏛️', color: 'border-rose-500/50 text-rose-400' },
  { id: 'telegram_intent', name: 'Telegram & Social Agent', role: 'Direct Mobile Reachability', icon: '✈️', color: 'border-cyan-500/50 text-cyan-400' },
  { id: 'urgent_need', name: 'Urgent Need Filter Agent', role: 'Vulnerabilities & Wasted Ad Budget', icon: '🚨', color: 'border-red-500/50 text-red-400' },
];

export default function ConsensusSwarm() {
  const [city, setCity] = useState("Dubai, UAE");
  const [industry, setIndustry] = useState("Auto");
  const [isScanning, setIsScanning] = useState(false);
  const [activeAgentIndex, setActiveAgentIndex] = useState(-1);
  const [winner, setWinner] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [seenLeadIds, setSeenLeadIds] = useState<string[]>([]);

  const runConsensusSwarm = async (shouldExcludeCurrent = false) => {
    setIsScanning(true);
    setWinner(null);
    setError(null);
    setActiveAgentIndex(0);

    // Build exclusion list
    const currentExclusions = shouldExcludeCurrent && winner ? [...seenLeadIds, winner.id] : seenLeadIds;

    // Simulate real-time agent collaboration feed animation
    const interval = setInterval(() => {
      setActiveAgentIndex((prev) => {
        if (prev >= AGENTS.length - 1) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 400);

    try {
      const res = await fetch("/api/consensus/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, industry, excludeIds: currentExclusions }),
      });

      const data = await res.json();
      clearInterval(interval);

      if (data.success && data.winner) {
        setActiveAgentIndex(AGENTS.length - 1);
        setWinner(data.winner);
        setSeenLeadIds((prev) => Array.from(new Set([...prev, data.winner.id])));
      } else {
        setError(data.error || "Failed to find consensus lead.");
      }
    } catch (err: any) {
      clearInterval(interval);
      setError(err.message || "Failed to execute Consensus Swarm.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleSendEmail = async () => {
    if (!winner || !winner.email) return;
    try {
      const res = await fetch("/api/dispatch/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetEmail: winner.email,
          emailSubject: winner.masterCopy.subject,
          emailBody: winner.masterCopy.body,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(`🚀 Sent via Resend API (be@akarsaone.xyz) to ${winner.email}! Message ID: ${data.messageId}`);
      } else {
        alert(`Email dispatch error: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Dispatch error: ${e.message}`);
    }
  };

  const handleSendWhatsApp = () => {
    if (!winner || !winner.phone) return;
    const cleanPhone = winner.phone.replace(/\D/g, "");
    const text = encodeURIComponent(winner.masterCopy.whatsappMessage);
    window.open(`https://web.whatsapp.com/send?phone=${cleanPhone}&text=${text}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      
      <main className="md:ml-72 p-4 md:p-8 space-y-6">
          
          {/* Header Banner */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-gradient-to-r from-purple-950/40 via-background to-blue-950/40 p-6 border border-purple-500/20">
            <div>
              <div className="flex items-center gap-2 text-purple-400 font-bold uppercase tracking-widest text-xs mb-1">
                <Sparkles className="w-4 h-4" /> Multi-Agent Intelligence Engine
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight">8-Agent Consensus Swarm</h1>
              <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
                Instead of 500 shallow leads, all 8 specialized agents collaborate to cross-verify, vet, and deliver <span className="text-purple-300 font-semibold">1 single Highest-Quality Grade A+ Target</span>.
              </p>
            </div>

            <button
              onClick={() => runConsensusSwarm(false)}
              disabled={isScanning}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-widest transition-all shadow-xl shadow-purple-900/30 flex items-center gap-2 disabled:opacity-50"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Agents Collaborating...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Launch 8-Agent Swarm
                </>
              )}
            </button>
          </div>

          {/* Controls Bar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-card border border-border p-4">
            <div>
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider block mb-1">
                Target City / Region
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="E.g. Dubai, UAE, London, UK, Austin, USA"
                className="w-full bg-secondary/50 border border-border px-3 py-2 text-sm focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider block mb-1">
                Target Industry / Niche
              </label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full bg-secondary/50 border border-border px-3 py-2 text-sm focus:outline-none focus:border-purple-500 font-mono text-foreground cursor-pointer"
              >
                <option value="Auto">Auto (All Industries)</option>
                <option value="Digital Marketing">Digital Marketing & Agencies</option>
                <option value="Dental">Dental & Healthcare</option>
                <option value="Real Estate">Real Estate & Property</option>
                <option value="Fitness">Fitness & Gyms</option>
                <option value="Restaurant">Restaurants & Hospitality</option>
                <option value="SaaS">SaaS & Software</option>
                <option value="E-Commerce">E-Commerce & Retail</option>
                <option value="Legal">Legal & Financial Services</option>
              </select>
            </div>
          </div>

          {/* 9-Agent Collaboration Status Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-3 gap-3">
            {AGENTS.map((agent, index) => {
              const isActive = activeAgentIndex >= index;
              const isCurrent = activeAgentIndex === index && isScanning;

              return (
                <div
                  key={agent.id}
                  className={`p-3 border transition-all duration-300 ${
                    isCurrent
                      ? "bg-purple-950/60 border-purple-500 ring-1 ring-purple-500/50 scale-[1.02]"
                      : isActive
                      ? "bg-card border-border"
                      : "bg-card/30 border-border/40 opacity-40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-lg">{agent.icon}</span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isCurrent
                          ? "bg-purple-400 animate-ping"
                          : isActive
                          ? "bg-emerald-400"
                          : "bg-muted"
                      }`}
                    />
                  </div>
                  <h4 className="font-bold text-xs truncate">{agent.name}</h4>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{agent.role}</p>
                </div>
              );
            })}
          </div>

          {/* Error Notice */}
          {error && (
            <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs font-mono flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* WINNER RESULT DISPLAY */}
          {winner && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border-2 border-purple-500/50 p-6 space-y-6 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 bg-gradient-to-l from-purple-600 to-blue-600 text-white font-mono font-bold text-xs px-4 py-1.5 uppercase tracking-widest flex items-center gap-1.5 shadow-lg">
                <Award className="w-4 h-4" /> #1 Consensus Target ({winner.consensusScore}/100)
              </div>

              {/* Lead Info Bar */}
              <div className="pt-4 md:pt-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-black text-white">{winner.companyName}</h2>
                  {winner.rating && (
                    <span className="px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold flex items-center gap-1">
                      <Star className="w-3 h-3 fill-amber-400" /> {winner.rating}★ ({winner.reviewCount} reviews)
                    </span>
                  )}
                </div>
                
                <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-muted-foreground mt-2">
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-purple-400" /> {winner.city}</span>
                  {winner.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-emerald-400" /> {winner.phone}</span>}
                  {winner.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-blue-400" /> {winner.email}</span>}
                  {winner.domain && <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5 text-sky-400" /> {winner.domain}</span>}
                </div>
              </div>

              {/* Pain Problem & Conversion Opportunity Box */}
              {winner.painProblem && (
                <div className="p-3.5 bg-amber-950/30 border border-amber-500/40 text-amber-200 text-xs font-mono">
                  <span className="font-bold text-amber-400 block uppercase tracking-wider mb-1">
                    🎯 Identified Pain Problem & Offer Opportunity:
                  </span>
                  {winner.painProblem}
                </div>
              )}

              {/* 8-Agent Verification Matrix */}
              <div>
                <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> 8-Agent Verification Audit
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {winner.verifications.map((v: any) => (
                    <div key={v.agentId} className="p-2.5 bg-secondary/30 border border-border/60 text-xs font-mono flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-foreground block">{v.agentName}</span>
                        <span className="text-muted-foreground text-[11px]">{v.finding}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Master Outreach Copy Section */}
              <div className="bg-secondary/40 border border-border p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h4 className="font-bold text-xs uppercase tracking-widest text-purple-300">
                    Master Outreach Draft (Auto-Personalized)
                  </h4>
                  <span className="text-[10px] font-mono text-muted-foreground">Subject: {winner.masterCopy.subject}</span>
                </div>

                <div className="text-xs font-mono whitespace-pre-wrap text-foreground/90 leading-relaxed bg-background/60 p-3 border border-border/40">
                  {winner.masterCopy.body}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <button
                    onClick={handleSendEmail}
                    className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg"
                  >
                    <Send className="w-4 h-4" /> Send Email via Resend (be@akarsaone.xyz)
                  </button>

                  <button
                    onClick={handleSendWhatsApp}
                    className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg"
                  >
                    <MessageSquare className="w-4 h-4" /> Open in WhatsApp Web
                  </button>

                  <button
                    onClick={() => runConsensusSwarm(true)}
                    disabled={isScanning}
                    className="w-full sm:w-auto px-5 py-2.5 bg-purple-900/60 hover:bg-purple-800/80 border border-purple-500/50 text-purple-200 font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} /> Scout Next Target ➔
                  </button>
                </div>
              </div>

            </motion.div>
          )}

        </main>
    </div>
  );
}
