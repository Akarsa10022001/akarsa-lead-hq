"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, MessageSquare, UserCheck, Key,
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

interface MiningResult {
  username: string; fullName: string; biography: string;
  category: string | null; externalUrl: string | null;
  email: string | null; phone: string | null; whatsapp: string | null;
  followerCount: number; location: string | null;
  hasMetaPixel: boolean; hasGoogleAnalytics: boolean;
  isBusinessAccount: boolean; profilePicUrl: string | null;
  source: "followers" | "following" | "comments";
  classifiedAs: string; isGoodTarget: boolean; igUrl: string;
}

const SOURCE_BADGES: Record<string, { color: string; label: string }> = {
  followers: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", label: "Follower" },
  following: { color: "bg-purple-500/20 text-purple-400 border-purple-500/30", label: "Following" },
  comments: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "Commenter" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function extractUsername(urlOrHandle: string): string {
  const m = urlOrHandle.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) return m[1].replace(/\/$/, "");
  return urlOrHandle.replace(/^@/, "").replace(/\/$/, "").trim();
}

function extractContacts(bio: string) {
  const email = bio.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] || null;
  const rawPhone = bio.match(/(?:\+|00)?[\d\s\-().]{9,18}(?=\s|$|[\n,|📞☎️📱])/)?.[0] || null;
  const phone = rawPhone ? rawPhone.replace(/[\s\-().]/g, "").trim() : null;
  const wa = bio.match(/(?:wa\.me\/|whatsapp[:\s]+)[\+\d]{7,15}/i)?.[0] || null;
  return { email, phone, whatsapp: wa ? wa.replace(/(?:wa\.me\/|whatsapp[:\s]+)/i, "+") : null };
}

function isBusinessLike(u: any): boolean {
  if (u.is_business_account || u.is_business) return true;
  if (u.external_url || u.business_email || u.public_email) return true;
  if (u.category_name || u.category) return true;
  const bio = u.biography || u.bio || "";
  if (/@[\w.]+\.[a-z]{2,}/i.test(bio) || /\+[\d\s]{9,}/i.test(bio)) return true;
  return false;
}

function parseUser(u: any, source: "followers" | "following" | "comments"): MiningResult {
  const bio = u.biography || u.bio || "";
  const contacts = extractContacts(bio);
  const username = u.username || "";
  return {
    username, fullName: u.full_name || username, biography: bio,
    category: u.category_name || u.category || null,
    externalUrl: u.external_url || null,
    email: u.business_email || u.public_email || contacts.email,
    phone: u.business_phone_number || contacts.phone,
    whatsapp: contacts.whatsapp,
    followerCount: u.edge_followed_by?.count || u.follower_count || 0,
    location: null, hasMetaPixel: false, hasGoogleAnalytics: false,
    isBusinessAccount: !!(u.is_business_account || u.is_business),
    profilePicUrl: u.profile_pic_url_hd || u.profile_pic_url || null,
    source, classifiedAs: "small_business", isGoodTarget: true,
    igUrl: `https://instagram.com/${username}`,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function InstagramAgent() {
  const [targetUrl, setTargetUrl] = useState("");
  const [sessionid, setSessionid] = useState(() => typeof window !== "undefined" ? localStorage.getItem("ig_sessionid") || "" : "");
  const [showPass, setShowPass] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [sources, setSources] = useState({ followers: true, following: true, comments: true });
  const [maxLeads, setMaxLeads] = useState(50);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [leads, setLeads] = useState<MiningResult[]>([]);
  const [targetProfile, setTargetProfile] = useState<any | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef(false);

  useEffect(() => { if (sessionid) localStorage.setItem("ig_sessionid", sessionid); }, [sessionid]);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const log = useCallback((msg: string) => setLogs(p => [...p.slice(-400), msg]), []);
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  // ── Proxy call through our server ──────────────────────────────────────────
  const igProxy = async (endpoint: string): Promise<any | null> => {
    try {
      const res = await fetch("/api/agent/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, sessionid: sessionid.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        log(`⚠️ API error (${res.status}): ${err.error || res.statusText}`);
        return null;
      }
      return res.json();
    } catch (e: any) {
      log(`⚠️ Network error: ${e.message}`);
      return null;
    }
  };

  // ── Main Mining ────────────────────────────────────────────────────────────
  const startMining = async () => {
    if (!targetUrl.trim() || status === "running") return;
    if (!sessionid.trim()) { setShowHelp(true); log("❌ Please paste your Instagram sessionid cookie first."); return; }

    stopRef.current = false;
    setStatus("running"); setLeads([]); setLogs([]); setTargetProfile(null);
    setSavedCount(0); setSelectedLeads(new Set());

    const username = extractUsername(targetUrl);
    log(`🎯 Targeting @${username}...`);

    // Fetch target profile
    const profileJson = await igProxy(`/api/v1/users/web_profile_info/?username=${username}`);
    const targetUser = profileJson?.data?.user;
    if (!targetUser) {
      log(`❌ Could not fetch @${username}.`);
      log(`📋 Check: Is the account public? Is your sessionid correct?`);
      setStatus("error"); return;
    }

    setTargetProfile(targetUser);
    const followers = targetUser.edge_followed_by?.count || 0;
    log(`✅ Found @${username} — ${followers.toLocaleString()} followers (${targetUser.full_name})`);

    const userId: string = targetUser.id || "";
    if (!userId) { log("❌ Could not get user ID."); setStatus("error"); return; }

    const discovered: MiningResult[] = [];
    const seen = new Set<string>();

    const addLead = (u: any, source: "followers" | "following" | "comments") => {
      if (seen.has(u.username) || !isBusinessLike(u)) return;
      seen.add(u.username);
      const r = parseUser(u, source);
      discovered.push(r);
      setLeads(p => [...p, r]);
      log(`📌 [${source}] @${u.username} — ${u.full_name || ""} ${u.category_name ? `(${u.category_name})` : ""}`);
    };

    // ── Followers ────────────────────────────────────────────────────────────
    if (sources.followers && !stopRef.current) {
      log(`\n👥 Mining followers (up to ${maxLeads})...`);
      let cursor: string | null = null;
      let fetched = 0;
      while (fetched < maxLeads && !stopRef.current) {
        const url = `/api/v1/friendships/${userId}/followers/?count=50${cursor ? `&max_id=${cursor}` : ""}`;
        const json = await igProxy(url);
        const users: any[] = json?.users || [];
        if (!users.length) break;
        users.forEach(u => { if (fetched < maxLeads) { addLead(u, "followers"); fetched++; } });
        cursor = json?.next_max_id || null;
        if (!cursor) break;
        await sleep(1200 + Math.random() * 600);
      }
      log(`✅ Followers: found ${discovered.filter(d => d.source === "followers").length} business accounts`);
    }

    // ── Following ────────────────────────────────────────────────────────────
    if (sources.following && !stopRef.current) {
      log(`\n👣 Mining following (up to ${maxLeads})...`);
      let cursor: string | null = null;
      let fetched = 0;
      while (fetched < maxLeads && !stopRef.current) {
        const url = `/api/v1/friendships/${userId}/following/?count=50${cursor ? `&max_id=${cursor}` : ""}`;
        const json = await igProxy(url);
        const users: any[] = json?.users || [];
        if (!users.length) break;
        users.forEach(u => { if (fetched < maxLeads) { addLead(u, "following"); fetched++; } });
        cursor = json?.next_max_id || null;
        if (!cursor) break;
        await sleep(1000 + Math.random() * 500);
      }
      log(`✅ Following: found ${discovered.filter(d => d.source === "following").length} business accounts`);
    }

    // ── Comments ─────────────────────────────────────────────────────────────
    if (sources.comments && !stopRef.current) {
      log(`\n💬 Mining post comments...`);
      const feedJson = await igProxy(`/api/v1/feed/user/${userId}/?count=12`);
      const posts: any[] = feedJson?.items || [];
      log(`📸 ${posts.length} posts found. Scanning comments...`);
      for (let i = 0; i < Math.min(posts.length, 12) && !stopRef.current; i++) {
        const mediaId = posts[i]?.id || posts[i]?.pk;
        if (!mediaId) continue;
        const cJson = await igProxy(`/api/v1/media/${mediaId}/comments/?can_support_threading=true`);
        const comments: any[] = cJson?.comments || [];
        comments.forEach(c => c.user && addLead(c.user, "comments"));
        log(`💬 Post ${i + 1}/${posts.length}: ${comments.length} comments, ${comments.filter(c => c.user && isBusinessLike(c.user)).length} business`);
        await sleep(700 + Math.random() * 300);
      }
    }

    log(`\n🎯 COMPLETE! Found ${discovered.length} business leads from @${username}.`);
    setStatus("done");
  };

  const stopMining = () => { stopRef.current = true; setStatus("done"); log("⏹ Stopped."); };

  const toggleSelect = (u: string) => setSelectedLeads(p => { const n = new Set(p); n.has(u) ? n.delete(u) : n.add(u); return n; });
  const selectAll = () => setSelectedLeads(p => p.size === leads.length ? new Set() : new Set(leads.map(l => l.username)));

  const saveSelected = async () => {
    const toSave = leads.filter(l => selectedLeads.has(l.username));
    if (!toSave.length) return;
    setSaving(true);
    try {
      const res = await fetch("/api/agent/instagram", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leads: toSave }) });
      const data = await res.json();
      if (data.success) { setSavedCount(p => p + data.saved); log(`✅ Saved ${data.saved} leads to Lead Radar!`); setSelectedLeads(new Set()); }
    } catch { log("❌ Failed to save."); } finally { setSaving(false); }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
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
                <p className="text-xs text-muted-foreground">Mines followers, following & comments for business leads</p>
              </div>
            </div>
            {savedCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" /> {savedCount} saved to Radar
              </div>
            )}
          </div>

          {/* Config */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: Target + Sources */}
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-heading">1. Target Account</h2>
              <div className="relative">
                <IgIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pink-400" />
                <input id="ig-target-url" type="url" placeholder="https://instagram.com/peakarchitects"
                  value={targetUrl} onChange={e => setTargetUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && startMining()}
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/50 placeholder:text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Mine from:</p>
                <div className="flex gap-2 flex-wrap">
                  {([["followers", Users, "Followers"], ["following", UserCheck, "Following"], ["comments", MessageSquare, "Comments"]] as const).map(([key, Icon, label]) => (
                    <button key={key} id={`source-${key}`}
                      onClick={() => setSources(p => ({ ...p, [key]: !p[key] }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${sources[key] ? "bg-pink-500/20 border-pink-500/40 text-pink-300" : "border-border text-muted-foreground hover:border-pink-500/30"}`}>
                      <Icon className="w-3.5 h-3.5" />{label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Max accounts to scan</p>
                  <span className="text-xs font-bold text-pink-400">{maxLeads}</span>
                </div>
                <input id="max-leads-slider" type="range" min={10} max={200} step={10} value={maxLeads}
                  onChange={e => setMaxLeads(+e.target.value)} className="w-full accent-pink-500" />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>10 (Fast)</span><span>200 (Thorough)</span>
                </div>
              </div>
            </div>

            {/* Right: Session Cookie + Run */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-heading">2. Session Cookie</h2>
                <button onClick={() => setShowHelp(p => !p)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  How? {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              <AnimatePresence>
                {showHelp && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="text-xs space-y-1.5 bg-secondary/50 rounded-lg p-3 border border-border text-muted-foreground">
                      <p className="font-semibold text-foreground">Get your sessionid in 30 seconds:</p>
                      <p>1. Click the <strong>Instagram tab</strong> in your browser</p>
                      <p>2. Press <kbd className="bg-background px-1 rounded border border-border text-foreground">Cmd ⌘ + Option ⌥ + J</kbd></p>
                      <p>3. Click <strong>Application</strong> tab in DevTools</p>
                      <p>4. Cookies → instagram.com → find <code className="text-pink-400 bg-background px-1 rounded border border-border">sessionid</code></p>
                      <p>5. Click the row → copy the long value at bottom</p>
                      <p className="text-amber-400 pt-1">⚠️ Stored only in your browser, never shared.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input id="ig-session-cookie" type={showPass ? "text" : "password"}
                  placeholder="Paste your sessionid value..."
                  value={sessionid} onChange={e => setSessionid(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-background border border-border rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-pink-500/50 placeholder:text-muted-foreground" />
                <button onClick={() => setShowPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {sessionid.trim().length > 10 ? (
                <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Cookie saved in browser</p>
              ) : (
                <p className="text-xs text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Session cookie required to access followers</p>
              )}

              <button id="run-instagram-agent" onClick={status === "running" ? stopMining : startMining}
                disabled={!targetUrl.trim()}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${status === "running" ? "bg-red-500/20 border border-red-500/40 text-red-400" : "bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:opacity-90 disabled:opacity-40"}`}>
                {status === "running" ? <><Loader2 className="w-4 h-4 animate-spin" /> Stop Mining</> : <><Zap className="w-4 h-4" /> Run Agent</>}
              </button>
              <p className="text-[10px] text-muted-foreground text-center">Don't close this tab while mining</p>
            </div>
          </div>

          {/* Target Profile Card */}
          <AnimatePresence>
            {targetProfile && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                {targetProfile.profile_pic_url && (
                  <img src={targetProfile.profile_pic_url} alt="" className="w-12 h-12 rounded-full border-2 border-pink-500/40 object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold">{targetProfile.full_name || targetProfile.username}</p>
                  <p className="text-xs text-muted-foreground truncate">{targetProfile.biography}</p>
                </div>
                <div className="flex gap-5 text-center shrink-0">
                  {[["Followers", targetProfile.edge_followed_by?.count || 0], ["Following", targetProfile.edge_follow?.count || 0], ["Posts", targetProfile.edge_owner_to_timeline_media?.count || 0]].map(([l, v]) => (
                    <div key={l as string}><p className="font-bold text-sm">{(v as number) >= 1000 ? `${((v as number)/1000).toFixed(1)}K` : v}</p><p className="text-[10px] text-muted-foreground">{l}</p></div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Live Feed + Results */}
          {(logs.length > 0 || leads.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-2 bg-card border border-border rounded-xl flex flex-col max-h-[420px]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-heading">Live Feed</span>
                  {status === "running" && <span className="flex items-center gap-1 text-xs text-pink-400"><Loader2 className="w-3 h-3 animate-spin" /> Mining</span>}
                  {status === "done" && <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="w-3 h-3" /> Done</span>}
                  {status === "error" && <span className="text-xs text-red-400">Error</span>}
                </div>
                <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] space-y-0.5 text-muted-foreground">
                  {logs.map((l, i) => (
                    <p key={i} className={l.startsWith("❌") ? "text-red-400" : l.startsWith("✅") || l.startsWith("📌") ? "text-emerald-400" : l.startsWith("🎯") ? "text-pink-400 font-bold" : ""}>{l}</p>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>

              <div className="lg:col-span-3 bg-card border border-border rounded-xl flex flex-col max-h-[420px]">
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
                    <input type="checkbox" id="select-all-ig" checked={selectedLeads.size === leads.length && leads.length > 0} onChange={selectAll} className="accent-pink-500 cursor-pointer" />
                    <label htmlFor="select-all-ig" className="text-xs text-muted-foreground cursor-pointer">Select all {leads.length}</label>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto divide-y divide-border/40">
                  {leads.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <IgIcon className="w-10 h-10 mb-3 opacity-20" />
                      <p className="text-sm">{status === "running" ? "Scanning..." : "No leads yet"}</p>
                    </div>
                  )}
                  <AnimatePresence>
                    {leads.map(lead => (
                      <motion.div key={lead.username} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                        className={`flex items-start gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors ${selectedLeads.has(lead.username) ? "bg-pink-500/5" : ""}`}>
                        <input type="checkbox" checked={selectedLeads.has(lead.username)} onChange={() => toggleSelect(lead.username)} className="accent-pink-500 mt-1 shrink-0" />
                        {lead.profilePicUrl && <img src={lead.profilePicUrl} alt="" className="w-9 h-9 rounded-full object-cover border border-border shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm truncate">{lead.fullName || lead.username}</span>
                            <span className="text-xs text-muted-foreground shrink-0">@{lead.username}</span>
                          </div>
                          <div className="flex gap-1.5 mt-0.5 flex-wrap">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${SOURCE_BADGES[lead.source]?.color}`}>{SOURCE_BADGES[lead.source]?.label}</span>
                            {lead.category && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary border border-border text-muted-foreground">{lead.category}</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px] text-muted-foreground">
                            {lead.email && <span className="flex items-center gap-0.5 text-emerald-400"><Mail className="w-3 h-3" />{lead.email}</span>}
                            {lead.phone && <span className="flex items-center gap-0.5 text-blue-400"><Phone className="w-3 h-3" />{lead.phone}</span>}
                            {lead.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{lead.location}</span>}
                            {lead.followerCount > 0 && <span className="flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />{lead.followerCount >= 1000 ? `${(lead.followerCount/1000).toFixed(1)}K` : lead.followerCount}</span>}
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
                    <p className="text-xs text-muted-foreground">{leads.filter(l => l.email || l.phone).length} have contact info</p>
                    <button onClick={selectAll} className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-secondary text-muted-foreground transition-colors">Select All</button>
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
