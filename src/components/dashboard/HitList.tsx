"use client";

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Mail, Phone, ExternalLink, Loader2, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, BrainCircuit } from 'lucide-react';
import pLimit from 'p-limit';

export default function HitList({ leads: initialLeads, onUpdate }: { leads: any[], onUpdate: () => void }) {
  const [leads, setLeads] = useState(initialLeads);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<Record<string, 'pending' | 'generating' | 'done' | 'retry' | 'failed'>>({});

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === leads.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(leads.map(l => l.id)));
  };

  const getBadgeColor = (score: number) => {
    if (score >= 70) return 'bg-green-500/10 text-green-500 border-green-500/20';
    if (score >= 40) return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
  };

  const getTopFactors = (factors: any) => {
    if (!factors) return [];
    return Object.entries(factors)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 2)
      .map(([k]) => k.replace(/_/g, ' '));
  };

  const updateStatus = async (id: string, status: string) => {
    setLeads(leads.filter(l => l.id !== id));
    await supabase.from('leads').update({ status }).eq('id', id);
    onUpdate();
  };

  const generateForSelected = async () => {
    setIsGenerating(true);
    const limit = pLimit(4);
    
    // Initialize statuses
    const newStatus = { ...generationStatus };
    selectedIds.forEach(id => newStatus[id] = 'pending');
    setGenerationStatus(newStatus);

    await Promise.allSettled(Array.from(selectedIds).map(id => limit(async () => {
      setGenerationStatus(prev => ({ ...prev, [id]: 'generating' }));
      
      let attempt = 0;
      let success = false;
      
      while (attempt < 2 && !success) {
        attempt++;
        try {
          const res = await fetch('/api/bulk-generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leadId: id })
          });
          
          if (res.ok) {
            const data = await res.json();
            success = true;
            setLeads(prev => prev.map(l => l.id === id ? { ...l, ai_hook_draft: data.message } : l));
            setGenerationStatus(prev => ({ ...prev, [id]: 'done' }));
          } else if (res.status === 429) {
            if (attempt === 1) await new Promise(r => setTimeout(r, 2000)); // backoff
            else setGenerationStatus(prev => ({ ...prev, [id]: 'retry' }));
          } else {
            setGenerationStatus(prev => ({ ...prev, [id]: 'failed' }));
          }
        } catch (e) {
          if (attempt === 1) await new Promise(r => setTimeout(r, 2000));
          else setGenerationStatus(prev => ({ ...prev, [id]: 'failed' }));
        }
      }
    })));

    setIsGenerating(false);
  };

  const markSelectedContacted = async () => {
    const ids = Array.from(selectedIds);
    setLeads(leads.filter(l => !ids.includes(l.id)));
    setSelectedIds(new Set());
    await supabase.from('leads').update({ status: 'Contacted' }).in('id', ids);
    onUpdate();
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/50">
        <h3 className="text-xl font-bold font-heading uppercase tracking-wide flex items-center gap-2">
          <span className="w-2 h-2 rounded-none bg-accent animate-pulse"></span>
          Today's Hit List
        </h3>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 bg-background border border-border px-4 py-2">
            <span className="text-sm font-medium mr-2 font-mono uppercase tracking-widest">{selectedIds.size} selected</span>
            <button 
              onClick={generateForSelected}
              disabled={isGenerating}
              className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1 border border-primary"
            >
              {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <BrainCircuit className="w-3 h-3" />}
              Generate Messages
            </button>
            <button 
              onClick={markSelectedContacted}
              disabled={isGenerating}
              className="px-3 py-1.5 bg-background hover:bg-secondary text-foreground text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1 border border-border"
            >
              <CheckCircle2 className="w-3 h-3" />
              Mark Contacted
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {leads.length === 0 ? (
          <div className="p-8 text-center bg-card border border-border text-muted-foreground font-mono">
            No fresh leads available. Run a scan!
          </div>
        ) : (
          leads.map(lead => (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={lead.id} 
              className={`p-4 bg-card border transition-all ${selectedIds.has(lead.id) ? 'border-primary shadow-[4px_4px_0px_0px_rgba(147,51,234,1)]' : 'border-border hover:border-primary/50'}`}
            >
              <div className="flex items-start gap-4">
                <input 
                  type="checkbox" 
                  checked={selectedIds.has(lead.id)}
                  onChange={() => toggleSelect(lead.id)}
                  className="mt-1.5 w-4 h-4 border-border text-primary focus:ring-primary bg-background rounded-none"
                />
                
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h4 className="font-bold text-lg font-heading tracking-wide uppercase truncate">{lead.company_name}</h4>
                    <span className={`px-3 py-0.5 rounded-none text-[10px] font-bold border uppercase tracking-widest ${getBadgeColor(lead.quality_score || 0)}`}>
                      Score {lead.quality_score || 0}
                    </span>
                    {getTopFactors(lead.score_factors).map(factor => (
                      <span key={factor} className="px-3 py-0.5 rounded-none bg-secondary text-foreground text-[10px] capitalize font-medium border border-border">
                        {factor}
                      </span>
                    ))}
                  </div>
                  
                  <div className="text-xs text-muted-foreground mb-3 flex items-center gap-3 truncate">
                    {lead.domain && <a href={`https://${lead.domain}`} target="_blank" className="hover:text-primary flex items-center gap-1"><ExternalLink className="w-3 h-3"/> {lead.domain}</a>}
                    {lead.industry && <span>• {lead.industry}</span>}
                    {lead.location && <span>• {lead.location}</span>}
                  </div>

                  {generationStatus[lead.id] && (
                    <div className="mb-3 text-xs flex items-center gap-2">
                      {generationStatus[lead.id] === 'generating' && <span className="text-blue-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Generating message...</span>}
                      {generationStatus[lead.id] === 'done' && <span className="text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Ready for review</span>}
                      {generationStatus[lead.id] === 'retry' && <span className="text-amber-500 flex items-center gap-1"><RefreshCw className="w-3 h-3"/> Rate limited, retry</span>}
                      {generationStatus[lead.id] === 'failed' && <span className="text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Generation failed</span>}
                    </div>
                  )}

                  {lead.ai_hook_draft && generationStatus[lead.id] !== 'generating' && (
                    <div className="p-3 bg-secondary/30 text-sm text-foreground/80 mb-3 border border-border/50 font-mono">
                      {lead.ai_hook_draft}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {/* WhatsApp */}
                    <a 
                      href={lead.phone_e164 ? `https://wa.me/${lead.phone_e164.replace('+','')}?text=${encodeURIComponent(lead.ai_hook_draft || 'Hello')}` : '#'}
                      target="_blank"
                      className={`px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest transition-colors border ${lead.phone_e164 ? 'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/20' : 'bg-secondary text-muted-foreground border-transparent opacity-50 cursor-not-allowed'}`}
                      title={lead.phone_e164 ? 'Message on WhatsApp' : 'No valid phone number'}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      WhatsApp
                    </a>

                    {/* Email */}
                    <a 
                      href={lead.email && lead.email_verified ? `mailto:${lead.email}?subject=${encodeURIComponent('Quick question')}&body=${encodeURIComponent(lead.ai_hook_draft || '')}` : '#'}
                      className={`px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest transition-colors border ${lead.email_verified ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20' : 'bg-secondary text-muted-foreground border-transparent opacity-50 cursor-not-allowed'}`}
                      title={lead.email_verified ? 'Send Email' : 'No verified email - use WhatsApp'}
                    >
                      {lead.email_verified ? <ShieldCheck className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                      Email
                    </a>

                    {/* Call */}
                    <a 
                      href={lead.phone_e164 ? `tel:${lead.phone_e164}` : '#'}
                      className={`px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest transition-colors border ${lead.phone_e164 ? 'bg-blue-500/10 text-blue-500 border-blue-500/30 hover:bg-blue-500/20' : 'bg-secondary text-muted-foreground border-transparent opacity-50 cursor-not-allowed'}`}
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Call
                    </a>

                    <div className="flex-1"></div>

                    {/* Status Dropdown */}
                    <select 
                      value={lead.status}
                      onChange={(e) => updateStatus(lead.id, e.target.value)}
                      className="px-2 py-1.5 text-xs font-mono uppercase tracking-widest bg-background border border-border text-muted-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="New">New</option>
                      <option value="Contacted">Contacted</option>
                      <option value="Replied">Replied</option>
                      <option value="Hot">Hot</option>
                      <option value="Won">Won</option>
                      <option value="Dead">Dead</option>
                    </select>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
