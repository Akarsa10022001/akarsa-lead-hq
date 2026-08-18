"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, MessageSquare, UserCheck,
  Key, ChevronDown, ChevronUp, Save, ExternalLink, Mail,
  Phone, MapPin, Zap, CheckCircle2, XCircle,
  Loader2, AlertTriangle, TrendingUp
} from "lucide-react";

// Custom Instagram SVG (not in this version of lucide-react)
const IgIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

interface MiningResult {
  username: string;
  fullName: string;
  biography: string;
  category: string | null;
  externalUrl: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  followerCount: number;
  location: string | null;
  hasMetaPixel: boolean;
  hasGoogleAnalytics: boolean;
  isBusinessAccount: boolean;
  profilePicUrl: string | null;
  source: "followers" | "following" | "comments";
  classifiedAs: string;
  isGoodTarget: boolean;
  igUrl: string;
}

interface TargetProfile {
  username: string;
  fullName: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  biography: string;
  profilePicUrl: string | null;
}

const SOURCE_BADGES: Record<string, { color: string; label: string }> = {
  followers: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", label: "Follower" },
  following: { color: "bg-purple-500/20 text-purple-400 border-purple-500/30", label: "Following" },
  comments: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "Commenter" },
};

const SIZE_BADGES: Record<string, string> = {
  ideal_local: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  small_business: "bg-green-500/20 text-green-400 border-green-500/30",
  mid_market: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  corporate_chain: "bg-red-500/20 text-red-400 border-red-500/30",
  enterprise: "bg-red-700/20 text-red-500 border-red-700/30",
};

export default function InstagramAgent() {
  const [targetUrl, setTargetUrl] = useState("");
  const [sessionCookie, setSessionCookie] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("ig_session") || "" : ""
  );
  const [showCookieHelp, setShowCookieHelp] = useState(false);
  const [showSessionInput, setShowSessionInput] = useState(false);
  const [sources, setSources] = useState({
    followers: true,
    following: true,
    comments: true,
  });
  const [maxLeads, setMaxLeads] = useState(100);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [leads, setLeads] = useState<MiningResult[]>([]);
  const [targetProfile, setTargetProfile] = useState<TargetProfile | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [filterGoodOnly, setFilterGoodOnly] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // suppress unused import warnings
  void CheckCircle2; void XCircle;

  useEffect(() => {
    if (typeof window !== "undefined" && sessionCookie) {
      localStorage.setItem("ig_session", sessionCookie);
    }
  }, [sessionCookie]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-200), msg]);
  }, []);

  const startMining = async () => {
    if (!targetUrl.trim()) return;
    if (!sessionCookie.trim()) {
      setShowSessionInput(true);
      return;
    }

    setStatus("running");
    setLeads([]);
    setLogs([]);
    setTargetProfile(null);
    setSavedCount(0);
    setSelectedLeads(new Set());

    abortRef.current = new AbortController();

    const activeSources = Object.entries(sources)
      .filter(([, v]) => v)
      .map(([k]) => k);

    try {
      const res = await fetch("/api/agent/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: targetUrl.trim(),
          sessionCookie: sessionCookie.trim(),
          sources: activeSources,
          maxLeads,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        setStatus("error");
        addLog("❌ Server returned an error. Check your session cookie.");
        return;
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
            if (event.type === "progress") addLog(event.message);
            if (event.type === "error") { addLog(`❌ ${event.message}`); setStatus("error"); }
            if (event.type === "profile") setTargetProfile(event.data);
            if (event.type === "lead") {
              setLeads(prev => [...prev, event.data]);
            }
            if (event.type === "complete") {
              addLog(`\n🎯 MINING COMPLETE! Found ${event.data.totalFound} business leads from ${event.data.totalScanned} accounts scanned.`);
              setStatus("done");
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setStatus("error");
        addLog(`❌ Connection error: ${err.message}`);
      }
    }
  };

  const stopMining = () => {
    abortRef.current?.abort();
    setStatus("done");
    addLog("⏹ Mining stopped by user.");
  };

  const toggleSelect = (username: string) => {
    setSelectedLeads(prev => {
      const next = new Set(prev);
      next.has(username) ? next.delete(username) : next.add(username);
      return next;
    });
  };

  const selectAll = () => {
    const visible = filteredLeads.map(l => l.username);
    setSelectedLeads(prev => visible.length === prev.size ? new Set() : new Set(visible));
  };

  const saveSelected = async () => {
    const toSave = leads.filter(l => selectedLeads.has(l.username));
    if (toSave.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/agent/instagram", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: toSave }),
      });
      const data = await res.json();
      if (data.success) {
        setSavedCount(prev => prev + data.saved);
        addLog(`✅ Saved ${data.saved} leads to Lead Radar!`);
        setSelectedLeads(new Set());
      }
    } catch {
      addLog("❌ Failed to save leads.");
    } finally {
      setSaving(false);
    }
  };

  const filteredLeads = leads.filter(l => filterGoodOnly ? l.isGoodTarget : true);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-0 md:ml-72 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                <IgIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-heading text-foreground tracking-tight">Instagram Lead Mining Agent</h1>
                <p className="text-sm text-muted-foreground">Paste any public account URL to extract business leads from followers, following & comments</p>
              </div>
            </div>
            {savedCount > 0 && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                {savedCount} leads saved to Radar
              </motion.div>
            )}
          </div>

          {/* Config Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Target URL */}
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-widest font-heading">1. Target Account</h2>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <IgIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pink-400" />
                  <input
                    id="ig-target-url"
                    type="url"
                    placeholder="https://instagram.com/target_account"
                    value={targetUrl}
                    onChange={e => setTargetUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && startMining()}
                    className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/50 text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              {/* Sources */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider">Mine from:</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { key: "followers", icon: Users, label: "Followers" },
                    { key: "following", icon: UserCheck, label: "Following" },
                    { key: "comments", icon: MessageSquare, label: "Post Comments" },
                  ].map(({ key, icon: Icon, label }) => (
                    <button key={key} id={`source-${key}`}
                      onClick={() => setSources(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                        sources[key as keyof typeof sources]
                          ? "bg-pink-500/20 border-pink-500/40 text-pink-300"
                          : "bg-background border-border text-muted-foreground"
                      }`}>
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Leads Slider */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Max accounts to scan</p>
                  <span className="text-xs font-bold text-pink-400">{maxLeads}</span>
                </div>
                <input id="max-leads-slider" type="range" min={10} max={500} step={10}
                  value={maxLeads} onChange={e => setMaxLeads(Number(e.target.value))}
                  className="w-full accent-pink-500" />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>10 (Fast)</span><span>100</span><span>500 (Slow)</span>
                </div>
              </div>
            </div>

            {/* Session Cookie */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground uppercase tracking-widest font-heading">2. Session Cookie</h2>
                <button onClick={() => setShowCookieHelp(p => !p)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  How? {showCookieHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              <AnimatePresence>
                {showCookieHelp && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden">
                    <div className="text-xs text-muted-foreground space-y-1.5 bg-secondary/50 rounded-lg p-3 border border-border">
                      <p className="font-semibold text-foreground">Get your session cookie:</p>
                      <p>1. Open <strong>instagram.com</strong> in Chrome</p>
                      <p>2. Press <kbd className="bg-background px-1 rounded text-foreground border border-border">F12</kbd> → Application tab</p>
                      <p>3. Cookies → instagram.com</p>
                      <p>4. Find <code className="bg-background px-1 rounded text-pink-400 border border-border">sessionid</code> → copy its value</p>
                      <p className="text-amber-400 flex gap-1 items-start pt-1"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> Stored only in your browser. Never sent anywhere else.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="ig-session-cookie"
                  type="password"
                  placeholder="Paste sessionid value here..."
                  value={sessionCookie}
                  onChange={e => setSessionCookie(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/50 text-foreground placeholder:text-muted-foreground font-mono"
                />
              </div>
              {sessionCookie && (
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Cookie saved in browser
                </p>
              )}

              {/* Run Button */}
              <button
                id="run-instagram-agent"
                onClick={status === "running" ? stopMining : startMining}
                disabled={!targetUrl.trim()}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                  status === "running"
                    ? "bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30"
                    : "bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                }`}>
                {status === "running" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Stop Mining</>
                ) : (
                  <><Zap className="w-4 h-4" /> Run Agent</>
                )}
              </button>
            </div>
          </div>

          {/* Target Profile Card */}
          <AnimatePresence>
            {targetProfile && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                {targetProfile.profilePicUrl && (
                  <img src={targetProfile.profilePicUrl} alt={targetProfile.username}
                    className="w-14 h-14 rounded-full border-2 border-pink-500/50 object-cover" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-foreground">{targetProfile.fullName}</p>
                    <span className="text-xs text-muted-foreground">@{targetProfile.username}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{targetProfile.biography}</p>
                </div>
                <div className="flex gap-4 text-center shrink-0">
                  {[
                    { label: "Followers", val: targetProfile.followerCount },
                    { label: "Following", val: targetProfile.followingCount },
                    { label: "Posts", val: targetProfile.postCount },
                  ].map(({ label, val }) => (
                    <div key={label}>
                      <p className="font-bold text-foreground text-sm">{val >= 1000 ? `${(val / 1000).toFixed(1)}K` : val}</p>
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Live Logs + Results Panel */}
          {(logs.length > 0 || leads.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

              {/* Live Log */}
              <div className="lg:col-span-2 bg-card border border-border rounded-xl flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-heading">Live Feed</span>
                  {status === "running" && <span className="flex items-center gap-1.5 text-xs text-pink-400"><Loader2 className="w-3 h-3 animate-spin" /> Mining...</span>}
                  {status === "done" && <span className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 className="w-3 h-3" /> Complete</span>}
                  {status === "error" && <span className="flex items-center gap-1.5 text-xs text-red-400"><XCircle className="w-3 h-3" /> Error</span>}
                </div>
                <div className="flex-1 overflow-y-auto p-3 font-mono text-xs text-muted-foreground space-y-0.5 max-h-80 min-h-40">
                  {logs.map((log, i) => (
                    <p key={i} className={`leading-relaxed ${log.startsWith('❌') ? 'text-red-400' : log.startsWith('✅') ? 'text-emerald-400' : log.startsWith('🎯') ? 'text-pink-400 font-bold' : ''}`}>{log}</p>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>

              {/* Leads Table */}
              <div className="lg:col-span-3 bg-card border border-border rounded-xl flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-heading">Discovered Leads</span>
                    <span className="text-xs bg-pink-500/20 text-pink-400 border border-pink-500/30 px-2 py-0.5 rounded-full font-bold">{filteredLeads.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setFilterGoodOnly(p => !p)}
                      className={`text-xs px-2 py-1 rounded border transition-all ${filterGoodOnly ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'border-border text-muted-foreground'}`}>
                      {filterGoodOnly ? "✓ Good targets only" : "All accounts"}
                    </button>
                    {selectedLeads.size > 0 && (
                      <button id="save-leads-btn" onClick={saveSelected} disabled={saving}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg font-bold hover:bg-emerald-500/30 disabled:opacity-50 transition-all">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Save {selectedLeads.size} to Radar
                      </button>
                    )}
                  </div>
                </div>

                {/* Select All Bar */}
                {filteredLeads.length > 0 && (
                  <div className="px-4 py-2 border-b border-border/50 flex items-center gap-2">
                    <input type="checkbox" id="select-all-leads"
                      checked={selectedLeads.size === filteredLeads.length && filteredLeads.length > 0}
                      onChange={selectAll}
                      className="accent-pink-500 cursor-pointer" />
                    <label htmlFor="select-all-leads" className="text-xs text-muted-foreground cursor-pointer">
                      Select all {filteredLeads.length}
                    </label>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto divide-y divide-border/50 max-h-[420px]">
                  {filteredLeads.length === 0 && status !== "running" && (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <IgIcon className="w-10 h-10 mb-3 opacity-20" />
                      <p className="text-sm">No business leads found yet</p>
                    </div>
                  )}
                  <AnimatePresence>
                    {filteredLeads.map((lead) => (
                      <motion.div key={lead.username}
                        initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                        className={`flex items-start gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors ${selectedLeads.has(lead.username) ? 'bg-pink-500/5' : ''}`}>

                        <input type="checkbox" checked={selectedLeads.has(lead.username)}
                          onChange={() => toggleSelect(lead.username)}
                          className="accent-pink-500 cursor-pointer mt-1 shrink-0" />

                        {lead.profilePicUrl && (
                          <img src={lead.profilePicUrl} alt={lead.username}
                            className="w-9 h-9 rounded-full object-cover border border-border shrink-0" />
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-sm text-foreground truncate">{lead.fullName || lead.username}</span>
                            <span className="text-xs text-muted-foreground">@{lead.username}</span>
                          </div>

                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {/* Source badge */}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${SOURCE_BADGES[lead.source]?.color}`}>
                              {SOURCE_BADGES[lead.source]?.label}
                            </span>
                            {/* Size badge */}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${SIZE_BADGES[lead.classifiedAs] || SIZE_BADGES.small_business}`}>
                              {lead.classifiedAs.replace('_', ' ')}
                            </span>
                            {lead.hasMetaPixel && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-blue-400 font-semibold">📊 Meta Pixel</span>}
                          </div>

                          <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px] text-muted-foreground">
                            {lead.email && <span className="flex items-center gap-0.5 text-emerald-400"><Mail className="w-3 h-3" />{lead.email}</span>}
                            {lead.phone && <span className="flex items-center gap-0.5 text-blue-400"><Phone className="w-3 h-3" />{lead.phone}</span>}
                            {lead.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{lead.location}</span>}
                            {lead.followerCount > 0 && <span className="flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />{lead.followerCount >= 1000 ? `${(lead.followerCount / 1000).toFixed(1)}K` : lead.followerCount} followers</span>}
                          </div>
                        </div>

                        <a href={lead.igUrl} target="_blank" rel="noreferrer"
                          className="text-muted-foreground hover:text-pink-400 transition-colors shrink-0 mt-1">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Bottom Save Bar */}
                {filteredLeads.length > 0 && status === "done" && (
                  <div className="px-4 py-3 border-t border-border flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {leads.filter(l => l.email || l.phone).length} have contact info
                    </p>
                    <button id="save-all-leads-btn"
                      onClick={() => { setSelectedLeads(new Set(filteredLeads.map(l => l.username))); }}
                      className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                      Select All {filteredLeads.length}
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
