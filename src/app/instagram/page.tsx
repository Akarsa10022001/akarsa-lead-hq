"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, MessageSquare, ChevronDown, ChevronUp, Save,
  ExternalLink, Mail, Phone, MapPin, Zap, CheckCircle2,
  Loader2, AlertTriangle, TrendingUp, Eye, EyeOff,
  GitBranch, Play, Clock, ShieldCheck, Terminal, Sparkles
} from "lucide-react";

const IgIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const ApifyIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" fill="currentColor">
    <path d="M16 2L2 28h28L16 2zm0 6l9.5 18H6.5L16 8z"/>
  </svg>
);

const GithubIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

// ── Types ─────────────────────────────────────────────────────────────────────
interface MiningResult {
  username: string; fullName: string; biography: string;
  category: string | null; externalUrl: string | null;
  email: string | null; phone: string | null; whatsapp: string | null;
  followerCount: number; location: string | null;
  hasMetaPixel: boolean; hasGoogleAnalytics: boolean;
  isBusinessAccount: boolean; profilePicUrl: string | null;
  source: string; classifiedAs: string; isGoodTarget: boolean; igUrl: string;
  score?: number;
  grade?: 'A' | 'B' | 'C' | 'D';
  gradeLabel?: string;
  gradeColor?: string;
  scoreReasons?: string[];
}

interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  event: string;
}

const SOURCE_BADGES: Record<string, { color: string; label: string }> = {
  comments: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "Commenter" },
  related:  { color: "bg-purple-500/20 text-purple-400 border-purple-500/30", label: "Similar" },
};

function extractUsername(urlOrHandle: string): string {
  const m = urlOrHandle.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) return m[1].replace(/\/$/, "");
  return urlOrHandle.replace(/^@/, "").replace(/\/$/, "").trim();
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function InstagramAgent() {
  const [engineMode, setEngineMode] = useState<"apify" | "github">("apify");

  // Apify Engine State
  const [targetUrl, setTargetUrl] = useState("");
  const [apifyToken, setApifyToken] = useState(() => typeof window !== "undefined" ? localStorage.getItem("apify_token") || "" : "");
  const [showApifyToken, setShowApifyToken] = useState(false);
  const [showApifyHelp, setShowApifyHelp] = useState(false);
  const [sources, setSources] = useState({ comments: true, related: true });
  const [maxLeads, setMaxLeads] = useState(50);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [leads, setLeads] = useState<MiningResult[]>([]);
  const [targetProfile, setTargetProfile] = useState<any>(null);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // GitHub Actions Engine State
  const [ghTargets, setGhTargets] = useState("peakarchitects");
  const [ghKeywords, setGhKeywords] = useState("architects UK, interior designers, boutique cafes");
  const [ghMaxLeads, setGhMaxLeads] = useState(30);
  const [ghToken, setGhToken] = useState(() => typeof window !== "undefined" ? localStorage.getItem("gh_pat_token") || "" : "");
  const [showGhToken, setShowGhToken] = useState(false);
  const [showGhHelp, setShowGhHelp] = useState(false);
  const [ghDispatching, setGhDispatching] = useState(false);
  const [ghMessage, setGhMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  useEffect(() => { if (apifyToken) localStorage.setItem("apify_token", apifyToken); }, [apifyToken]);
  useEffect(() => { if (ghToken) localStorage.setItem("gh_pat_token", ghToken); }, [ghToken]);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);
  const log = useCallback((msg: string) => setLogs(p => [...p.slice(-400), msg]), []);

  // Fetch recent GitHub Action runs
  const fetchRecentRuns = useCallback(async () => {
    if (!ghToken) return;
    setLoadingRuns(true);
    try {
      const res = await fetch(`/api/agent/trigger-github-miner?token=${encodeURIComponent(ghToken.trim())}`);
      const data = await res.json();
      if (data.runs) setWorkflowRuns(data.runs);
    } catch {}
    finally { setLoadingRuns(false); }
  }, [ghToken]);

  useEffect(() => {
    if (engineMode === "github" && ghToken) {
      fetchRecentRuns();
    }
  }, [engineMode, ghToken, fetchRecentRuns]);

  // ── Dispatch GitHub Action Miner ──────────────────────────────────────────
  const dispatchGithubMiner = async () => {
    if (!ghToken.trim()) {
      setGhMessage({ text: "Please enter your GitHub Personal Access Token (PAT) first.", type: "error" });
      setShowGhHelp(true);
      return;
    }

    setGhDispatching(true);
    setGhMessage(null);

    try {
      const res = await fetch("/api/agent/trigger-github-miner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: ghToken.trim(),
          targets: ghTargets.trim(),
          keywords: ghKeywords.trim(),
          maxLeads: ghMaxLeads,
          dryRun: false,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setGhMessage({ text: "🚀 Job Dispatched! GitHub is running Playwright & X-Ray Miner. Leads will write directly into Lead Radar.", type: "success" });
        setTimeout(fetchRecentRuns, 3000);
      } else {
        setGhMessage({ text: data.error || "Failed to trigger GitHub Action", type: "error" });
      }
    } catch (err: any) {
      setGhMessage({ text: err.message, type: "error" });
    } finally {
      setGhDispatching(false);
    }
  };

  // ── Start mining via Apify (Live Stream) ──────────────────────────────────
  const startApifyMining = async () => {
    if (!targetUrl.trim() || status === "running") return;
    if (!apifyToken.trim()) { setShowApifyHelp(true); log("❌ Paste your Apify API token first."); return; }

    abortRef.current = new AbortController();
    setStatus("running"); setLeads([]); setLogs([]); setTargetProfile(null);
    setSavedCount(0); setSelectedLeads(new Set());

    const username = extractUsername(targetUrl);
    log(`🎯 Starting Apify run for @${username}...`);

    try {
      const res = await fetch("/api/agent/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl, apifyToken: apifyToken.trim(), sources, maxLeads }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        log(`❌ ${err.message || "Request failed"}`);
        setStatus("error"); return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "log") log(event.message);
            else if (event.type === "profile") setTargetProfile(event.data);
            else if (event.type === "lead") setLeads(p => [...p, event.data]);
            else if (event.type === "done") { setStatus("done"); log(`\n🎯 Mining complete! ${event.total} leads found.`); }
            else if (event.type === "error") { log(`❌ ${event.message}`); setStatus("error"); }
          } catch {}
        }
      }

      if (status !== "error") setStatus("done");
    } catch (err: any) {
      if (err.name !== "AbortError") {
        log(`❌ ${err.message}`);
        setStatus("error");
      } else {
        setStatus("done");
      }
    }
  };

  const stopMining = () => {
    abortRef.current?.abort();
    setStatus("done");
    log("⏹ Stopped.");
  };

  const toggleSelect = (u: string) =>
    setSelectedLeads(p => { const n = new Set(p); n.has(u) ? n.delete(u) : n.add(u); return n; });

  const selectAll = () =>
    setSelectedLeads(p => p.size === leads.length ? new Set() : new Set(leads.map(l => l.username)));

  const saveSelected = async () => {
    const toSave = leads.filter(l => selectedLeads.has(l.username));
    if (!toSave.length) return;
    setSaving(true);
    try {
      const res = await fetch("/api/agent/instagram", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: toSave }),
      });
      const data = await res.json();
      if (data.success) {
        setSavedCount(p => p + data.saved);
        log(`✅ Saved ${data.saved} leads to Lead Radar!`);
        setSelectedLeads(new Set());
      } else {
        log(`❌ Save failed: ${data.error}`);
      }
    } catch { log("❌ Failed to save."); }
    finally { setSaving(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-0 md:ml-72 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 via-purple-600 to-indigo-600 flex items-center justify-center shadow-lg">
                <IgIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-heading tracking-tight">Instagram & B2B Lead Mining Agent</h1>
                <p className="text-xs text-muted-foreground">Extract high-intent business leads, active commenters & verified contacts</p>
              </div>
            </div>
            {savedCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" /> {savedCount} saved to Radar
              </div>
            )}
          </div>

          {/* Engine Mode Switcher Tabs */}
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <button
              onClick={() => setEngineMode("apify")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                engineMode === "apify"
                  ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md shadow-pink-500/20"
                  : "bg-secondary text-muted-foreground hover:text-foreground border border-border"
              }`}
            >
              <ApifyIcon className="w-3.5 h-3.5" />
              <span>⚡ Apify Cloud (Live On-Demand)</span>
            </button>
            <button
              onClick={() => setEngineMode("github")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                engineMode === "github"
                  ? "bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md shadow-cyan-500/20"
                  : "bg-secondary text-muted-foreground hover:text-foreground border border-border"
              }`}
            >
              <GithubIcon className="w-3.5 h-3.5" />
              <span>🤖 GitHub Actions (100% Free & Scheduled)</span>
            </button>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {/* TAB 1: APIFY CLOUD MODE (ON-DEMAND)                                  */}
          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {engineMode === "apify" && (
            <div className="space-y-5">
              {/* Why Commenters Banner */}
              <div className="flex items-start gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <span>
                  <strong>⚡ On-Demand Apify Mode:</strong> Runs directly in this browser session. Automatically grades leads with the 5-dimension quality scorer (<strong>Grade A 🟢 Hot / Grade B 🟡 Warm</strong>) and filters out influencers and enterprise chains.
                </span>
              </div>

              {/* Config Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Target + Sources */}
                <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 space-y-4">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-heading">1. Target Account</h2>
                  <div className="relative">
                    <IgIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pink-400" />
                    <input
                      id="ig-target-url" type="url"
                      placeholder="https://instagram.com/peakarchitects"
                      value={targetUrl} onChange={e => setTargetUrl(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && startApifyMining()}
                      className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/50 placeholder:text-muted-foreground"
                    />
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Mine from:</p>
                    <div className="flex gap-2 flex-wrap">
                      <button id="source-comments"
                        onClick={() => setSources(p => ({ ...p, comments: !p.comments }))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${sources.comments ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "border-border text-muted-foreground hover:border-amber-500/30"}`}>
                        <MessageSquare className="w-3.5 h-3.5" /> Active Commenters
                      </button>
                      <button id="source-related"
                        onClick={() => setSources(p => ({ ...p, related: !p.related }))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${sources.related ? "bg-purple-500/20 border-purple-500/40 text-purple-300" : "border-border text-muted-foreground hover:border-purple-500/30"}`}>
                        <Users className="w-3.5 h-3.5" /> Similar Profiles
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Commenters to process</p>
                      <span className="text-xs font-bold text-pink-400">{maxLeads}</span>
                    </div>
                    <input id="max-leads-slider" type="range" min={10} max={150} step={10} value={maxLeads}
                      onChange={e => setMaxLeads(+e.target.value)} className="w-full accent-pink-500" />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                      <span>10 (Fast · ~2 min)</span><span>150 (Thorough · ~8 min)</span>
                    </div>
                  </div>
                </div>

                {/* Apify Token + Run */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ApifyIcon className="w-4 h-4 text-[#FF9012]" />
                      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-heading">2. Apify Token</h2>
                    </div>
                    <button onClick={() => setShowApifyHelp(p => !p)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                      Where? {showApifyHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>

                  <AnimatePresence>
                    {showApifyHelp && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="text-xs space-y-1.5 bg-secondary/50 rounded-lg p-3 border border-border text-muted-foreground">
                          <p>1. Go to <a href="https://console.apify.com/settings/integrations" target="_blank" rel="noreferrer" className="text-[#FF9012] underline">console.apify.com/settings/integrations</a></p>
                          <p>2. Copy your <strong>Personal API token</strong></p>
                          <p>3. Paste it below — saved automatically.</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="relative">
                    <ApifyIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#FF9012]" />
                    <input
                      id="apify-token-input"
                      type={showApifyToken ? "text" : "password"}
                      placeholder="apify_api_..."
                      value={apifyToken}
                      onChange={e => setApifyToken(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 bg-background border border-border rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#FF9012]/40 placeholder:text-muted-foreground"
                    />
                    <button onClick={() => setShowApifyToken(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showApifyToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <button id="run-instagram-agent"
                    onClick={status === "running" ? stopMining : startApifyMining}
                    disabled={!targetUrl.trim() || !apifyToken.trim()}
                    className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${status === "running"
                      ? "bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30"
                      : "bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:opacity-90 disabled:opacity-30"}`}>
                    {status === "running"
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Stop Mining</>
                      : <><Zap className="w-4 h-4" /> Run Live Scraper</>}
                  </button>
                  <p className="text-[10px] text-muted-foreground text-center">Mining takes 2–8 minutes. Keep this tab open.</p>
                </div>
              </div>

              {/* Target Profile Card */}
              <AnimatePresence>
                {targetProfile && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                    {targetProfile.profilePicUrl && (
                      <img src={targetProfile.profilePicUrl} alt="" className="w-12 h-12 rounded-full border-2 border-pink-500/40 object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold">{targetProfile.fullName || targetProfile.username}</p>
                      <p className="text-xs text-muted-foreground truncate">{targetProfile.biography}</p>
                    </div>
                    <div className="flex gap-5 text-center shrink-0">
                      {([["Followers", targetProfile.followersCount], ["Following", targetProfile.followsCount], ["Posts", targetProfile.postsCount]] as [string, number][]).map(([l, v]) => (
                        <div key={l}>
                          <p className="font-bold text-sm">{(v || 0) >= 1000 ? `${((v || 0) / 1000).toFixed(1)}K` : (v || 0)}</p>
                          <p className="text-[10px] text-muted-foreground">{l}</p>
                        </div>
                      ))}
                    </div>
                    <a href={`https://instagram.com/${targetProfile.username}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-pink-400 shrink-0">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Live Feed + Results */}
              {(logs.length > 0 || leads.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  {/* Logs */}
                  <div className="lg:col-span-2 bg-card border border-border rounded-xl flex flex-col max-h-[440px]">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-heading">Live Feed</span>
                      {status === "running" && <span className="flex items-center gap-1 text-xs text-pink-400"><Loader2 className="w-3 h-3 animate-spin" /> Running on Apify</span>}
                      {status === "done" && <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="w-3 h-3" /> Complete</span>}
                      {status === "error" && <span className="text-xs text-red-400">Error</span>}
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] space-y-0.5 text-muted-foreground">
                      {logs.map((l, i) => (
                        <p key={i} className={
                          l.startsWith("❌") ? "text-red-400" :
                          l.startsWith("✅") || l.startsWith("📌") ? "text-emerald-400" :
                          l.startsWith("🎯") ? "text-pink-400 font-bold" :
                          l.startsWith("⚠️") ? "text-amber-400" : ""
                        }>{l}</p>
                      ))}
                      <div ref={logsEndRef} />
                    </div>
                  </div>

                  {/* Results */}
                  <div className="lg:col-span-3 bg-card border border-border rounded-xl flex flex-col max-h-[440px]">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-heading">Business Leads</span>
                        <span className="text-xs bg-pink-500/20 text-pink-400 border border-pink-500/30 px-2 py-0.5 rounded-full font-bold">{leads.length}</span>
                      </div>
                      {selectedLeads.size > 0 && (
                        <button id="save-leads-btn" onClick={saveSelected} disabled={saving}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg font-bold hover:bg-emerald-500/30 disabled:opacity-50 transition-all">
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          Save {selectedLeads.size} to Radar
                        </button>
                      )}
                    </div>

                    {leads.length > 0 && (
                      <div className="px-4 py-2 border-b border-border/50 flex items-center gap-2 shrink-0">
                        <input type="checkbox" id="select-all-ig"
                          checked={selectedLeads.size === leads.length && leads.length > 0}
                          onChange={selectAll} className="accent-pink-500 cursor-pointer" />
                        <label htmlFor="select-all-ig" className="text-xs text-muted-foreground cursor-pointer">Select all {leads.length}</label>
                      </div>
                    )}

                    <div className="flex-1 overflow-y-auto divide-y divide-border/40">
                      {leads.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <IgIcon className="w-10 h-10 mb-3 opacity-20" />
                          <p className="text-sm">{status === "running" ? "Apify is scanning…" : "No leads yet"}</p>
                        </div>
                      )}
                      <AnimatePresence>
                        {leads.map(lead => (
                          <motion.div key={lead.username} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                            className={`flex items-start gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors ${selectedLeads.has(lead.username) ? "bg-pink-500/5" : ""}`}>
                            <input type="checkbox" checked={selectedLeads.has(lead.username)}
                              onChange={() => toggleSelect(lead.username)} className="accent-pink-500 mt-1 shrink-0" />
                            {lead.profilePicUrl && (
                              <img src={lead.profilePicUrl} alt="" className="w-9 h-9 rounded-full object-cover border border-border shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-sm truncate">{lead.fullName || lead.username}</span>
                                <span className="text-xs text-muted-foreground shrink-0">@{lead.username}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold shrink-0 ${lead.gradeColor || "bg-secondary border-border text-muted-foreground"}`}
                                  title={lead.scoreReasons?.join('\n')}>
                                  {lead.gradeLabel || `Grade ${lead.grade}`} · {lead.score}
                                </span>
                              </div>
                              <div className="flex gap-1.5 mt-0.5 flex-wrap">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${SOURCE_BADGES[lead.source]?.color || "bg-secondary border-border text-muted-foreground"}`}>
                                  {SOURCE_BADGES[lead.source]?.label || lead.source}
                                </span>
                                {lead.category && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary border border-border text-muted-foreground">{lead.category}</span>
                                )}
                                {lead.classifiedAs && lead.classifiedAs !== 'unknown' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary border border-border text-muted-foreground capitalize">{lead.classifiedAs.replace('_', ' ')}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px] text-muted-foreground">
                                {lead.email && <span className="flex items-center gap-0.5 text-emerald-400"><Mail className="w-3 h-3" />{lead.email}</span>}
                                {lead.phone && <span className="flex items-center gap-0.5 text-blue-400"><Phone className="w-3 h-3" />{lead.phone}</span>}
                                {lead.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{lead.location}</span>}
                                {lead.followerCount > 0 && (
                                  <span className="flex items-center gap-0.5">
                                    <TrendingUp className="w-3 h-3" />
                                    {lead.followerCount >= 1000 ? `${(lead.followerCount / 1000).toFixed(1)}K` : lead.followerCount}
                                  </span>
                                )}
                              </div>
                            </div>
                            <a href={lead.igUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-pink-400 transition-colors shrink-0 mt-1">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>

                    {status === "done" && leads.length > 0 && (
                      <div className="px-4 py-3 border-t border-border shrink-0 flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          {leads.filter(l => l.email || l.phone).length} with contact info
                        </p>
                        <button onClick={selectAll} className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
                          Select All
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {/* TAB 2: GITHUB ACTIONS ENGINE (100% FREE & AUTOMATED)                 */}
          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {engineMode === "github" && (
            <div className="space-y-5">
              {/* Highlight Banner */}
              <div className="flex items-start justify-between gap-4 p-4 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-background border border-indigo-500/30 rounded-2xl">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 font-heading">
                      100% Free Self-Hosted Pipeline
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    Automated Playwright + Google X-Ray Lead Harvester
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Runs on GitHub&apos;s cloud runners with <strong>2,000 free minutes/month</strong>. Dispatches jobs in background and syncs qualified Grade A/B leads straight into Supabase.
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="flex items-center gap-1.5 text-xs text-indigo-300 bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Cron: Nightly at 02:00 UTC (07:30 AM IST)</span>
                  </div>
                  <a
                    href="https://github.com/Akarsa10022001/akarsa-lead-hq/actions/workflows/instagram-miner.yml"
                    target="_blank" rel="noreferrer"
                    className="text-xs text-muted-foreground hover:text-indigo-400 flex items-center gap-1 underline"
                  >
                    View on GitHub Actions <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* GitHub Dispatch Form */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Left: Input Targets & Keywords */}
                <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-heading">
                      1. Custom Target Accounts & Keywords
                    </h2>
                    <span className="text-xs bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20 font-medium">
                      Multi-Target Batch
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <IgIcon className="w-3.5 h-3.5 text-pink-400" />
                      Target Instagram Competitors / Influencers (comma-separated or handles)
                    </label>
                    <textarea
                      rows={2}
                      value={ghTargets}
                      onChange={e => setGhTargets(e.target.value)}
                      placeholder="peakarchitects, archdaily, designboom, elledecor"
                      className="w-full p-3 bg-background border border-border rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-muted-foreground"
                    />
                    <p className="text-[11px] text-muted-foreground">Playwright will inspect each profile, extract active commenters, and parse contact data.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      Google X-Ray Niche & City Keywords (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={ghKeywords}
                      onChange={e => setGhKeywords(e.target.value)}
                      placeholder="architects UK, luxury interior design, boutique hotels, cafes Indore"
                      className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder:text-muted-foreground"
                    />
                    <p className="text-[11px] text-muted-foreground">Searches Google&apos;s index for verified Instagram bios with emails/WhatsApp in these niches.</p>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Max leads to extract</span>
                      <span className="text-xs font-bold text-indigo-400">{ghMaxLeads} leads</span>
                    </div>
                    <input
                      type="range" min={10} max={100} step={10}
                      value={ghMaxLeads}
                      onChange={e => setGhMaxLeads(+e.target.value)}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>

                {/* Right: GitHub Token & Dispatch */}
                <div className="bg-card border border-border rounded-2xl p-5 space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GithubIcon className="w-4 h-4 text-foreground" />
                        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-heading">
                          2. GitHub Token (PAT)
                        </h2>
                      </div>
                      <button onClick={() => setShowGhHelp(p => !p)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                        How? {showGhHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>

                    <AnimatePresence>
                      {showGhHelp && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="text-xs space-y-1.5 bg-secondary/50 rounded-xl p-3 border border-border text-muted-foreground">
                            <p>1. Open <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="text-indigo-400 underline">github.com/settings/tokens</a></p>
                            <p>2. Generate a token with <code className="bg-background px-1 rounded border border-border text-indigo-400">workflow</code> or <code className="bg-background px-1 rounded border border-border text-indigo-400">repo</code> scope.</p>
                            <p>3. Paste it below to enable 1-click execution.</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="relative">
                      <GithubIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type={showGhToken ? "text" : "password"}
                        placeholder="ghp_..."
                        value={ghToken}
                        onChange={e => setGhToken(e.target.value)}
                        className="w-full pl-10 pr-10 py-2.5 bg-background border border-border rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-muted-foreground"
                      />
                      <button onClick={() => setShowGhToken(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showGhToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {ghToken.startsWith("ghp_") || ghToken.startsWith("github_pat_") ? (
                      <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Token saved in browser</p>
                    ) : (
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-400" /> GitHub PAT enables 1-click dispatch</p>
                    )}
                  </div>

                  <div className="space-y-2 pt-2">
                    {ghMessage && (
                      <div className={`p-3 rounded-xl text-xs border ${
                        ghMessage.type === "success"
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                          : "bg-red-500/10 border-red-500/30 text-red-300"
                      }`}>
                        {ghMessage.text}
                      </div>
                    )}

                    <button
                      onClick={dispatchGithubMiner}
                      disabled={ghDispatching}
                      className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 text-white hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                    >
                      {ghDispatching ? <><Loader2 className="w-4 h-4 animate-spin" /> Dispatching...</> : <><Play className="w-4 h-4 fill-white" /> Dispatch GitHub Miner</>}
                    </button>
                    <p className="text-[10px] text-muted-foreground text-center">
                      Runs in the cloud. You can safely close your browser.
                    </p>
                  </div>
                </div>
              </div>

              {/* Workflow Runs & Status Card */}
              <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-heading">
                      Recent GitHub Action Mining Runs
                    </h3>
                  </div>
                  <button
                    onClick={fetchRecentRuns}
                    disabled={loadingRuns || !ghToken}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 bg-secondary px-2.5 py-1 rounded-lg border border-border disabled:opacity-40"
                  >
                    {loadingRuns ? <Loader2 className="w-3 h-3 animate-spin" /> : "Refresh Status"}
                  </button>
                </div>

                {workflowRuns.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-xs bg-secondary/20 rounded-xl border border-dashed border-border space-y-1">
                    <p>No recent workflow runs loaded.</p>
                    <p className="text-[11px] text-muted-foreground/60">
                      Enter your GitHub token and click Dispatch, or view history directly on GitHub.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {workflowRuns.map(run => (
                      <div key={run.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`flex h-2.5 w-2.5 rounded-full shrink-0 ${
                            run.status === "in_progress" || run.status === "queued" ? "bg-amber-400 animate-ping" :
                            run.conclusion === "success" ? "bg-emerald-400" :
                            run.conclusion === "failure" ? "bg-red-400" : "bg-muted"
                          }`} />
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">{run.name} ({run.event})</p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(run.created_at).toLocaleString()} · Status: <span className="capitalize">{run.conclusion || run.status}</span>
                            </p>
                          </div>
                        </div>
                        <a
                          href={run.html_url}
                          target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 text-xs text-indigo-400 hover:underline shrink-0"
                        >
                          View Logs <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
