"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Users, Plus, Target, CheckCircle2, AlertTriangle, ShieldCheck, Mail, Send, Trash2 } from "lucide-react";

export default function TargetsManager() {
  const [targets, setTargets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [showForm, setShowForm] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [notes, setNotes] = useState("");
  
  // Validation error
  const [validationError, setValidationError] = useState("");
  const [promoting, setPromoting] = useState(false);

  const handleAutoPromote = async () => {
    setPromoting(true);
    try {
      const res = await fetch("/api/cron/enroll-leads", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        alert(data.message || "Enrollment run complete.");
        fetchTargets();
      } else {
        alert(`Enrollment failed: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      alert(`Error running enrollment: ${err.message}`);
    } finally {
      setPromoting(false);
    }
  };

  const triggerEnrollment = async () => {
    try {
      await fetch("/api/cron/enroll-leads", { method: "POST" });
    } catch (err) {
      console.error("Enrollment trigger failed:", err);
    }
  };

  useEffect(() => {
    fetchTargets();
  }, []);

  const fetchTargets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          target_sequences!inner(*),
          consents(*),
          conversions(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTargets(data || []);
    } catch (err) {
      console.error("Error fetching dream targets:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    // Enforce owner-direct title/name validation
    const titleLower = contactTitle.toLowerCase();
    const isOwnerTitle = titleLower.includes("owner") || 
                         titleLower.includes("founder") || 
                         titleLower.includes("ceo") || 
                         titleLower.includes("director") || 
                         titleLower.includes("president") || 
                         titleLower.includes("partner") || 
                         titleLower.includes("manager") ||
                         titleLower.includes("lead") ||
                         titleLower.includes("head");

    // Check contact name doesn't contain generic words
    const nameLower = contactName.toLowerCase();
    const isGenericContact = nameLower.includes("info") ||
                             nameLower.includes("support") ||
                             nameLower.includes("contact") ||
                             nameLower.includes("sales") ||
                             nameLower.includes("team") ||
                             !contactName.trim();

    if (isGenericContact) {
      setValidationError("A target must have a valid personal contact name, not a generic alias like 'info' or 'team'.");
      return;
    }

    if (!isOwnerTitle && contactTitle.trim()) {
      setValidationError("The sequence is optimized for decision-makers. Title must represent an owner, founder, CEO, director, GM, or head-level role.");
      return;
    }

    try {
      // 1. Insert Target into the raw leads table
      // It must pass the database-level generated columns (email_is_valid, is_generic_email) 
      // to become sequence_ready.
      const { data: newTarget, error: insertError } = await supabase
        .from('leads')
        .insert({
          company_name: companyName,
          contact_name: contactName,
          contact_title: contactTitle || 'Owner',
          email: email || null,
          phone_e164: phone || null,
          email_verified: true, // Manual entries are assumed verified by the user
          social_links: {
            linkedin: linkedinUrl || null,
            instagram: instagramHandle || null
          }
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // 2. Trigger the Enrollment Gate cron to pick up this new lead and stage Touch 1
      await triggerEnrollment();

      // Refresh list
      fetchTargets();
      setShowForm(false);
      
      // Clear form
      setCompanyName("");
      setContactName("");
      setContactTitle("");
      setEmail("");
      setPhone("");
      setLinkedinUrl("");
      setInstagramHandle("");
      setNotes("");

    } catch (err: any) {
      setValidationError(err.message || "Failed to add target.");
    }
  };

  const toggleConsent = async (targetId: string, currentConsent: boolean) => {
    try {
      const { error } = await supabase
        .from('consents')
        .upsert({
          target_id: targetId,
          channel: 'whatsapp',
          opted_in: !currentConsent,
          source: 'operator_toggle'
        }, { onConflict: 'target_id,channel' });

      if (error) throw error;
      fetchTargets();
    } catch (err) {
      console.error("Error toggling consent:", err);
    }
  };

  const handleDeleteTarget = async (id: string) => {
    if (!confirm("Are you sure you want to remove this target from the sequence? They will be marked as Rejected and will not be auto-enrolled again.")) return;
    try {
      // 1. Drop their sequence
      await supabase
        .from('target_sequences')
        .delete()
        .eq('target_id', id);

      // 2. Mark them as rejected so the cron job doesn't pick them back up
      const { error } = await supabase
        .from('leads')
        .update({ status: 'Rejected' })
        .eq('id', id);

      if (error) throw error;
      setTargets(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error("Error deleting target:", err);
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground font-body">
      <Sidebar />
      
      <main className="flex-1 flex flex-col md:pl-72 h-screen overflow-y-auto">
        <Header />

        <div className="p-6 max-w-6xl w-full mx-auto space-y-6">
          {/* Header Card */}
          <div className="flex justify-between items-center bg-card p-6 border border-border rounded-lg shadow-sm">
            <div>
              <h2 className="text-xl font-bold uppercase font-heading tracking-wide flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" /> Active Pipeline
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Manage your high-value owner-direct prospects currently undergoing the outreach sequence.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleAutoPromote}
                disabled={promoting}
                className="px-4 py-2 border border-border bg-background hover:bg-secondary transition-all font-bold text-xs uppercase tracking-widest cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
              >
                <Target className="w-4 h-4 text-primary" /> {promoting ? "Enrolling..." : "Auto-Enroll Top Leads"}
              </button>
              <button
                onClick={() => setShowForm(!showForm)}
                className="px-4 py-2 bg-primary text-primary-foreground font-bold text-xs uppercase tracking-widest hover:bg-primary/95 transition-all cursor-pointer inline-flex items-center gap-2 border border-primary"
              >
                <Plus className="w-4 h-4" /> {showForm ? "Cancel" : "Add Target"}
              </button>
            </div>
          </div>

          {/* Add Target Form */}
          {showForm && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              onSubmit={handleAddTarget}
              className="bg-card border border-border p-6 rounded-lg space-y-4 shadow-sm"
            >
              <h3 className="font-bold text-md uppercase font-heading border-b border-border pb-2">Add New High-Value Target</h3>
              
              {validationError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-mono rounded flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {validationError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Company Name *</label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full p-2.5 bg-background border border-border rounded text-sm focus:outline-none focus:border-primary"
                    placeholder="Acme Corp"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Contact Name * (Owner / Founder)</label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full p-2.5 bg-background border border-border rounded text-sm focus:outline-none focus:border-primary"
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Contact Title *</label>
                  <input
                    type="text"
                    required
                    value={contactTitle}
                    onChange={(e) => setContactTitle(e.target.value)}
                    className="w-full p-2.5 bg-background border border-border rounded text-sm focus:outline-none focus:border-primary"
                    placeholder="Founder / CEO"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-2.5 bg-background border border-border rounded text-sm focus:outline-none focus:border-primary"
                    placeholder="john@acme.com"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Phone (WhatsApp format: e.g. +919876543210)</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full p-2.5 bg-background border border-border rounded text-sm focus:outline-none focus:border-primary"
                    placeholder="+919876543210"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">LinkedIn URL</label>
                  <input
                    type="url"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    className="w-full p-2.5 bg-background border border-border rounded text-sm focus:outline-none focus:border-primary"
                    placeholder="https://linkedin.com/in/johndoe"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Instagram Handle</label>
                  <input
                    type="text"
                    value={instagramHandle}
                    onChange={(e) => setInstagramHandle(e.target.value)}
                    className="w-full p-2.5 bg-background border border-border rounded text-sm focus:outline-none focus:border-primary"
                    placeholder="@acme_studio"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Prospect Context / Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2.5 bg-background border border-border rounded text-sm focus:outline-none focus:border-primary min-h-[80px]"
                  placeholder="Key observations (e.g. Broken links on site, slow load times, no social ads running)"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-primary text-primary-foreground font-bold text-xs uppercase tracking-widest hover:bg-primary/95 transition-all cursor-pointer border border-primary"
              >
                Add & Start Sequence Step 1
              </button>
            </motion.form>
          )}

          {/* List of Targets */}
          {loading ? (
            <div className="text-center py-20 text-muted-foreground font-mono">Loading targets...</div>
          ) : targets.length === 0 ? (
            <div className="border border-dashed border-border p-16 text-center rounded-lg bg-card">
              <Users className="w-12 h-12 text-muted-foreground/35 mx-auto mb-4" />
              <h3 className="font-bold text-lg uppercase font-heading">No Targets Enrolled</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-2">
                Your Dream 25 targeting queue is empty. Create a target manually or promote leads from your Radar feed.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {targets.map((item) => {
                const seq = item.target_sequences?.[0];
                const outcome = item.conversions?.[0]?.outcome || 'No outcome';
                
                // Consent lookup
                const waConsent = item.consents?.find((c: any) => c.channel === 'whatsapp');
                const isConsentOpted = waConsent?.opted_in === true;

                return (
                  <div
                    key={item.id}
                    className="bg-card border border-border p-6 rounded-lg shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-border/80 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-lg font-heading uppercase">{item.company_name}</span>
                        <span className={`px-2 py-0.5 border text-[9px] uppercase tracking-widest font-mono font-bold rounded ${
                          seq?.status === 'active' ? 'bg-primary/10 text-primary border-primary/20' :
                          seq?.status === 'replied' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                          seq?.status === 'paused' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                          'bg-muted text-muted-foreground border-border'
                        }`}>
                          {seq?.status || 'inactive'}
                        </span>
                        
                        {seq?.channel_diversity_status === 'under_diversified' && (
                          <span className="px-2 py-0.5 bg-orange-500/10 text-orange-500 border border-orange-500/20 text-[9px] uppercase tracking-widest font-mono font-bold rounded" title="Missing contact info for some channels. Background enrichment running.">
                            Under-Diversified
                          </span>
                        )}
                        {seq?.channel_diversity_status === 'critical' && (
                          <span className="px-2 py-0.5 bg-red-500/10 text-red-500 border border-red-500/20 text-[9px] uppercase tracking-widest font-mono font-bold rounded" title="Fell below diversity floor. Sequence paused.">
                            Critical Diversity
                          </span>
                        )}
                      </div>
                      
                      <div className="text-sm text-muted-foreground mt-1">
                        Contact: <span className="text-foreground font-medium">{item.contact_name}</span> ({item.contact_title})
                      </div>

                      <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground font-mono">
                        {item.email && <div className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {item.email}</div>}
                        {item.phone_e164 && <div className="flex items-center gap-1"><Send className="w-3.5 h-3.5" /> {item.phone_e164}</div>}
                      </div>
                    </div>

                    <div className="flex flex-wrap md:flex-nowrap items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                      {/* Step Status */}
                      <div className="text-left md:text-right">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Current Progress</div>
                        <div className="font-bold text-sm text-foreground mt-0.5">
                          Touch {seq?.current_step || 0} of 17
                        </div>
                      </div>

                      {/* WhatsApp Consent Option */}
                      {item.phone_e164 && (
                        <div className="flex flex-col items-start md:items-end">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">WA Consent</span>
                          <button
                            onClick={() => toggleConsent(item.id, isConsentOpted)}
                            className={`mt-1 inline-flex items-center gap-1 px-2.5 py-1 text-[10px] uppercase font-bold tracking-widest rounded border transition-all cursor-pointer ${
                              isConsentOpted 
                                ? 'bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20' 
                                : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/20'
                            }`}
                            title={isConsentOpted ? "Consent verified. Programmatic templates allowed." : "No consent. Manual DMs only."}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" /> {isConsentOpted ? "Opted In" : "Gated"}
                          </button>
                        </div>
                      )}

                      {/* Conversion Outcome */}
                      <div className="text-left md:text-right">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Outcome</div>
                        <div className={`font-bold text-xs uppercase tracking-wider mt-1 px-2 py-0.5 rounded border inline-block ${
                          outcome === 'won' ? 'bg-green-500/10 text-green-500 border-green-500/25' :
                          outcome === 'replied' ? 'bg-blue-500/10 text-blue-500 border-blue-500/25' :
                          'bg-secondary text-muted-foreground border-border'
                        }`}>
                          {outcome}
                        </div>
                      </div>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteTarget(item.id)}
                        className="p-2 border border-border bg-background hover:bg-red-500/10 hover:border-red-500/20 text-red-500 transition-all cursor-pointer rounded"
                        title="Remove from Dream 25"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
