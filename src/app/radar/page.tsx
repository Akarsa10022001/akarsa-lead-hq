"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, Mail, ChevronDown, Edit2, MessageSquare, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export default function Radar() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  useEffect(() => {
    async function fetchLeads() {
      // First try to fetch from Supabase
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching leads:", error);
      } else if (data && data.length > 0) {
        setLeads(data);
      } else {
        // Fallback to empty state if no leads
        setLeads([]);
      }
      setLoading(false);
    }
    fetchLeads();
  }, []);

  const excludedStatuses = ['emailed', 'hot', 'won', 'dead', 'replied', 'contacted'];
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          lead.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          lead.industry?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const leadStatusLower = (lead.status || '').toLowerCase();
    const matchesStatus = statusFilter 
      ? leadStatusLower === statusFilter.toLowerCase() 
      : !excludedStatuses.includes(leadStatusLower);
      
    return matchesSearch && matchesStatus;
  });

  const handleDeleteLead = async (leadId: string, companyName: string) => {
    if (confirm(`Are you sure you want to delete ${companyName}? This action cannot be undone.`)) {
      const { error } = await supabase.from('leads').delete().eq('id', leadId);
      if (!error) {
        setLeads(leads.filter(l => l.id !== leadId));
      } else {
        alert("Failed to delete lead.");
      }
    }
  };

  const handleEditLead = async (lead: any) => {
    const newPhone = window.prompt("Enter new phone number (include country code, e.g., 919876543210):", lead.phone || "");
    if (newPhone !== null && newPhone !== lead.phone) {
      const { error } = await supabase.from('leads').update({ phone: newPhone }).eq('id', lead.id);
      if (!error) {
        setLeads(leads.map(l => l.id === lead.id ? { ...l, phone: newPhone } : l));
      } else {
        alert("Failed to update phone number.");
      }
    }
  };

  const handleMarkReplied = async (lead: any) => {
    if (confirm(`Mark WhatsApp conversation with ${lead.company_name} as Replied? This will log it in your Priority Inbox.`)) {
      // 1. Update Lead Status
      await supabase.from('leads').update({ status: 'Replied' }).eq('id', lead.id);
      
      // 2. Find the sequence
      const { data: sequence } = await supabase
        .from('outreach_sequences')
        .select('id')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sequence) {
        // 3. Insert fake inbound message so it appears in Inbox
        await supabase.from('outreach_messages').insert({
          sequence_id: sequence.id,
          step_number: 1,
          channel: 'whatsapp',
          draft_content: '(Logged Manually from WhatsApp)',
          sent_at: new Date().toISOString(),
          status: 'received'
        });
      }

      setLeads(leads.map(l => l.id === lead.id ? { ...l, status: 'Replied' } : l));
      alert("Successfully logged to Inbox!");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      
      <main className="md:ml-72 p-4 md:p-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold">Lead Radar</h1>
              <p className="text-muted-foreground mt-1">AI-scouted targets waiting for your engagement.</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="relative w-full sm:w-auto">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search targets..." 
                  className="pl-9 pr-4 py-2 bg-background border border-border text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-full sm:w-64 transition-all font-mono"
                />
              </div>
              <div className="relative">
                <button 
                  onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                  className="flex items-center gap-2 px-4 py-2 bg-background border border-border text-sm hover:bg-secondary transition-colors font-mono uppercase tracking-widest"
                >
                  <Filter className="w-4 h-4" /> 
                  {statusFilter || "All Statuses"} 
                  <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
                </button>
                <AnimatePresence>
                  {filterMenuOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 mt-2 w-48 bg-card border border-border shadow-none z-50 overflow-hidden"
                    >
                      <button onClick={() => { setStatusFilter(null); setFilterMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-secondary transition-colors font-mono uppercase tracking-widest">All Statuses</button>
                      <button onClick={() => { setStatusFilter('New'); setFilterMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-secondary transition-colors text-primary font-medium font-mono uppercase tracking-widest">New</button>
                      <button onClick={() => { setStatusFilter('Contacted'); setFilterMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-secondary transition-colors text-blue-500 font-medium font-mono uppercase tracking-widest">Contacted</button>
                      <button onClick={() => { setStatusFilter('Won'); setFilterMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-secondary transition-colors text-accent font-medium font-mono uppercase tracking-widest">Won</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-secondary/50 border-b border-border">
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest font-heading">Company</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest font-heading">Contact</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest font-heading">Phone</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest font-heading">Industry</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest font-heading">AI Hook</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest font-heading">Status</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest font-heading text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground font-mono">Loading leads...</td>
                  </tr>
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground font-mono">No leads found matching your filters.</td>
                  </tr>
                ) : filteredLeads.map((lead, idx) => (
                  <motion.tr 
                    key={lead.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="border-b border-border/50 hover:bg-secondary/30 transition-colors group"
                  >
                    <td className="p-4 font-bold font-heading uppercase tracking-wide">{lead.company_name}</td>
                    <td className="p-4 text-muted-foreground">{lead.contact_name || 'N/A'}</td>
                    <td className="p-4 text-muted-foreground font-mono text-sm">{lead.phone || 'N/A'}</td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 bg-background text-foreground text-[10px] font-medium border border-border uppercase tracking-widest">
                        {lead.industry}
                      </span>
                    </td>
                    <td className="p-4 text-sm max-w-[200px] truncate text-muted-foreground font-mono">
                      "{lead.ai_hook_draft || 'Generating...'}"
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 text-[10px] uppercase tracking-widest font-bold border ${
                        lead.status === 'New' ? 'bg-primary/10 text-primary border-primary/20' : 
                        lead.status === 'Contacted' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 
                        'bg-accent/10 text-accent border-accent/20'
                      }`}>
                        {lead.status || 'New'}
                      </span>
                    </td>
                    <td className="p-4 text-right flex justify-end gap-2">
                      <button 
                        onClick={() => handleDeleteLead(lead.id, lead.company_name)}
                        className="inline-block p-2 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all opacity-0 group-hover:opacity-100 cursor-pointer border border-transparent hover:border-destructive"
                        title="Delete Lead"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {lead.status === 'Contacted' && (
                        <button 
                          onClick={() => handleMarkReplied(lead)}
                          className="inline-block p-2 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all opacity-0 group-hover:opacity-100 cursor-pointer border border-transparent hover:border-[#25D366]"
                          title="Mark WhatsApp Replied"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        onClick={() => handleEditLead(lead)}
                        className="inline-block p-2 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all opacity-0 group-hover:opacity-100 cursor-pointer border border-transparent hover:border-primary"
                        title="Edit Phone"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <Link 
                        href={`/campaigns?leadId=${lead.id}`}
                        className="inline-block p-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-all opacity-0 group-hover:opacity-100 border border-primary"
                        title="Start Campaign"
                      >
                        <Mail className="w-4 h-4" />
                      </Link>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
