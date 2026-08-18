"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, MessageSquare,
  ChevronDown, ChevronUp, Save, ExternalLink, Mail,
  Phone, MapPin, Zap, CheckCircle2, Loader2,
  AlertTriangle, TrendingUp, Eye, EyeOff
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

// ── Types ─────────────────────────────────────────────────────────────────────
interface MiningResult {
  username: string; fullName: string; biography: string;
  category: string | null; externalUrl: string | null;
  email: string | null; phone: string | null; whatsapp: string | null;
  followerCount: number; location: string | null;
  hasMetaPixel: boolean; hasGoogleAnalytics: boolean;
  isBusinessAccount: boolean; profilePicUrl: string | null;
  source: string; classifiedAs: string; isGoodTarget: boolean; igUrl: string;
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
  const [targetUrl, setTargetUrl] = useState("");
  const [apifyToken, setApifyToken] = useState(() => typeof window !== "undefined" ? localStorage.getItem("apify_token") || "" : "");
  const [showToken, setShowToken] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
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

  useEffect(() => { if (apifyToken) localStorage.setItem("apify_token", apifyToken); }, [apifyToken]);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);
  const log = useCallback((msg: string) => setLogs(p => [...p.slice(-400), msg]), []);

  // ── Start mining via Apify ─────────────────────────────────────────────────
  const startMining = async () => {
    if (!targetUrl.trim() || status === "running") return;
    if (!apifyToken.trim()) { setShowHelp(true); log("❌ Paste your Apify API token first."); return; }

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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shadow-lg">
                <IgIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-heading tracking-tight">Instagram Lead Mining Agent</h1>
                <p className="text-xs text-muted-foreground">Powered by Apify · Mines high-intent commenters & similar business accounts</p>
              </div>
            </div>
            {savedCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" /> {savedCount} saved to Radar
              </div>
            )}
          </div>

          {/* Why commenters banner */}
          <div className="flex items-start gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <span>
              <strong>Why commenters?</strong> People who actively comment on Instagram posts are <strong>2–5× more likely</strong> to respond to outreach than silent followers. This agent targets them specifically — they&apos;re already engaged in your niche.
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
                  onKeyDown={e => e.key === "Enter" && startMining()}
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
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  <strong className="text-amber-400">Active Commenters:</strong> People commenting on this account&apos;s posts (highest intent) ·
                  <strong className="text-purple-400"> Similar Profiles:</strong> Instagram-recommended accounts in the same niche
                </p>
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
                <button onClick={() => setShowHelp(p => !p)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  Where? {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              <AnimatePresence>
                {showHelp && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="text-xs space-y-1.5 bg-secondary/50 rounded-lg p-3 border border-border text-muted-foreground">
                      <p>1. Go to <a href="https://console.apify.com/settings/integrations" target="_blank" rel="noreferrer" className="text-[#FF9012] underline">console.apify.com/settings/integrations</a></p>
                      <p>2. Under <strong>Personal API tokens</strong>, copy your <strong>Default token</strong></p>
                      <p>3. Paste it below — it starts with <code className="bg-background px-1 rounded border border-border text-[#FF9012]">apify_api_</code></p>
                      <p className="text-emerald-400 pt-1">✅ Free plan gives $5/month of credits — enough for hundreds of leads.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative">
                <ApifyIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#FF9012]" />
                <input
                  id="apify-token-input"
                  type={showToken ? "text" : "password"}
                  placeholder="apify_api_..."
                  value={apifyToken}
                  onChange={e => setApifyToken(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-background border border-border rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#FF9012]/40 placeholder:text-muted-foreground"
                />
                <button onClick={() => setShowToken(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {apifyToken.startsWith("apify_api_") ? (
                <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Token saved in browser</p>
              ) : (
                <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-400" /> Apify token required to run agent</p>
              )}

              <button id="run-instagram-agent"
                onClick={status === "running" ? stopMining : startMining}
                disabled={!targetUrl.trim() || !apifyToken.trim()}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${status === "running"
                  ? "bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30"
                  : "bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:opacity-90 disabled:opacity-30"}`}>
                {status === "running"
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Stop Mining</>
                  : <><Zap className="w-4 h-4" /> Run Agent</>}
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
                      {status === "running" && <p className="text-xs mt-1 text-muted-foreground/60">Apify may take 2–3 minutes to warm up</p>}
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
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm truncate">{lead.fullName || lead.username}</span>
                            <span className="text-xs text-muted-foreground shrink-0">@{lead.username}</span>
                          </div>
                          <div className="flex gap-1.5 mt-0.5 flex-wrap">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${SOURCE_BADGES[lead.source]?.color || "bg-secondary border-border text-muted-foreground"}`}>
                              {SOURCE_BADGES[lead.source]?.label || lead.source}
                            </span>
                            {lead.category && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary border border-border text-muted-foreground">{lead.category}</span>
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
                      {leads.filter(l => l.email || l.phone).length} with contact info ·{" "}
                      {leads.filter(l => l.externalUrl).length} with websites
                    </p>
                    <button onClick={selectAll} className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
                      Select All
                    </button>
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
