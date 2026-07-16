"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { Check, X, Clipboard, Edit2, Play, Flame, AlertCircle, FileText, Send, CheckCircle } from "lucide-react";

export default function ApprovalsQueue() {
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [assistedData, setAssistedData] = useState<{ id: string; url: string; body: string; channel: string } | null>(null);

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/approvals");
      const data = await res.json();
      if (Array.isArray(data)) {
        setQueue(data);
      }
    } catch (err) {
      console.error("Failed to load approvals queue:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    try {
      const res = await fetch("/api/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, draft_body: editBody })
      });
      if (res.ok) {
        setQueue(prev => prev.map(item => item.id === id ? { ...item, draft_body: editBody } : item));
        setEditingId(null);
      }
    } catch (err) {
      console.error("Error saving draft:", err);
    }
  };

  const handleSkip = async (id: string) => {
    setActioningId(id);
    try {
      const res = await fetch("/api/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "skipped" })
      });
      if (res.ok) {
        setQueue(prev => prev.filter(item => item.id !== id));
      }
    } catch (err) {
      console.error("Error skipping step:", err);
    } finally {
      setActioningId(null);
    }
  };

  const handleApproveAndSend = async (item: any) => {
    setActioningId(item.id);
    try {
      // First, update status to approved
      const approveRes = await fetch("/api/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, status: "approved" })
      });
      
      if (!approveRes.ok) throw new Error("Approval failed");

      // Next, call the channel-specific dispatch route
      const dispatchRes = await fetch(`/api/dispatch/${item.channel}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId: item.id })
      });

      const result = await dispatchRes.json();

      if (result.success) {
        // Remove from list if sent successfully
        setQueue(prev => prev.filter(q => q.id !== item.id));
      } else if (result.status === "awaiting_manual_send") {
        // If it requires manual send (LinkedIn, IG, or WA with no consent)
        // Set state to open the manual modal
        setAssistedData({
          id: item.id,
          url: result.linkedinUrl || result.instagramUrl || `https://wa.me/${(item.dream_targets.phone || '').replace(/[\s\-()]/g, '').replace(/^\+/, '')}`,
          body: result.draftBody || item.draft_body,
          channel: item.channel
        });
      } else {
        alert(`Dispatch failed: ${result.error || "Unknown error"}`);
      }
    } catch (err: any) {
      console.error("Error dispatching touchpoint:", err);
      alert(`Error: ${err.message}`);
    } finally {
      setActioningId(null);
    }
  };

  const handleBulkApprove = async () => {
    if (queue.length === 0) return;
    const ids = queue.map(q => q.id);
    setLoading(true);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      });
      if (res.ok) {
        alert(`Bulk approved ${ids.length} items. Automated channels will dispatch on next cycle.`);
        setQueue([]);
      }
    } catch (err) {
      console.error("Bulk approval error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkSent = async (id: string) => {
    try {
      const res = await fetch("/api/dispatch/mark-sent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId: id })
      });
      if (res.ok) {
        setQueue(prev => prev.filter(q => q.id !== id));
        setAssistedData(null);
      }
    } catch (err) {
      console.error("Error marking manual touchpoint sent:", err);
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground font-body">
      <Sidebar />
      
      <main className="flex-1 flex flex-col md:pl-72 h-screen overflow-y-auto">
        <Header />

        <div className="p-6 max-w-6xl w-full mx-auto space-y-6">
          <div className="flex justify-between items-center bg-card p-6 border border-border rounded-lg shadow-sm">
            <div>
              <h2 className="text-xl font-bold uppercase font-heading tracking-wide flex items-center gap-2">
                <Flame className="w-5 h-5 text-primary" /> Outreach Approvals Queue
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Review, edit, and approve outreach steps drafted by your AI copywriter before they go live.
              </p>
            </div>
            {queue.length > 0 && (
              <div className="flex gap-3">
                <button
                  onClick={handleBulkApprove}
                  className="px-4 py-2 border border-border bg-background hover:bg-secondary transition-all font-bold text-xs uppercase tracking-widest cursor-pointer"
                >
                  Bulk Approve ({queue.length})
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="text-center py-20 text-muted-foreground font-mono">Loading pending approvals...</div>
          ) : queue.length === 0 ? (
            <div className="border border-dashed border-border p-16 text-center rounded-lg bg-card">
              <CheckCircle className="w-12 h-12 text-muted-foreground/35 mx-auto mb-4" />
              <h3 className="font-bold text-lg uppercase font-heading">Queue is Clear</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-2">
                All drafted messages have been approved or dispatched. The Touchpoint Engine runs daily at 10 AM.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {queue.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-card border border-border p-6 rounded-lg space-y-4 shadow-sm group hover:border-border/80 transition-colors"
                  >
                    {/* Item Header */}
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg font-heading uppercase">{item.dream_targets.company_name}</span>
                          <span className="text-xs text-muted-foreground">({item.dream_targets.contact_name})</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="px-2 py-0.5 bg-background border border-border text-[9px] uppercase tracking-widest font-mono font-bold text-muted-foreground">
                            Step {item.step_number} of 17
                          </span>
                          <span className={`px-2 py-0.5 border text-[9px] uppercase tracking-widest font-mono font-bold rounded ${
                            item.channel === 'email' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                            item.channel === 'whatsapp' ? 'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/20' :
                            item.channel === 'linkedin' ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' :
                            'bg-pink-500/10 text-pink-500 border-pink-500/20'
                          }`}>
                            {item.channel} — {item.touch_type}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingId(item.id);
                            setEditBody(item.draft_body);
                          }}
                          className="p-2 border border-border bg-background hover:bg-secondary text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                          title="Edit draft body"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleSkip(item.id)}
                          disabled={actioningId === item.id}
                          className="p-2 border border-border bg-background hover:bg-red-500/10 text-red-500 hover:text-red-600 transition-all cursor-pointer disabled:opacity-50"
                          title="Skip this step"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleApproveAndSend(item)}
                          disabled={actioningId === item.id}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground font-bold text-xs uppercase tracking-widest hover:bg-primary/95 transition-all cursor-pointer disabled:opacity-50 border border-primary"
                        >
                          <Send className="w-3.5 h-3.5" /> Approve & Send
                        </button>
                      </div>
                    </div>

                    {/* Draft Body Content */}
                    {editingId === item.id ? (
                      <div className="space-y-3 pt-2">
                        <textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          className="w-full min-h-[140px] p-4 bg-background border border-border rounded font-mono text-sm focus:outline-none focus:border-primary"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 border border-border text-xs uppercase font-bold tracking-widest hover:bg-secondary"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit(item.id)}
                            className="px-3 py-1.5 bg-primary text-primary-foreground text-xs uppercase font-bold tracking-widest hover:bg-primary/90 border border-primary"
                          >
                            Save Change
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-secondary/30 border border-border/50 rounded font-mono text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">
                        {item.draft_body}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      {/* Assisted Send Manual Modal */}
      {assistedData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border p-6 max-w-xl w-full rounded-lg space-y-4 shadow-2xl relative">
            <h3 className="text-lg font-bold uppercase tracking-wider font-heading flex items-center gap-2 border-b border-border pb-3">
              <AlertCircle className="text-primary w-5 h-5" /> Manual Action Required
            </h3>
            
            <p className="text-sm text-muted-foreground leading-relaxed">
              Legality rules prevent Lead HQ from sending DMs automatically on personal {assistedData.channel} channels. 
              Please click below to go to the contact's profile, paste the copied draft, and send it.
            </p>

            <div className="space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">Draft Content</label>
              <div className="p-4 bg-secondary/50 border border-border rounded font-mono text-sm text-muted-foreground relative group max-h-48 overflow-y-auto">
                {assistedData.body}
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-3">
              <button
                onClick={() => setAssistedData(null)}
                className="px-4 py-2 border border-border text-xs uppercase font-bold tracking-widest hover:bg-secondary"
              >
                Close Window
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(assistedData.body);
                  window.open(assistedData.url, "_blank");
                }}
                className="px-4 py-2 bg-secondary text-foreground hover:bg-secondary/80 border border-border text-xs uppercase font-bold tracking-widest inline-flex items-center gap-1.5"
              >
                <Clipboard className="w-3.5 h-3.5" /> Copy & Open Link
              </button>
              <button
                onClick={() => handleMarkSent(assistedData.id)}
                className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 border border-primary text-xs uppercase font-bold tracking-widest inline-flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" /> Mark Sent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
