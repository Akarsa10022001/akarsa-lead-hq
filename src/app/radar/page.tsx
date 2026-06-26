"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, Mail, ChevronDown } from "lucide-react";
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
        // Fallback to initial mock data if table is empty (for UI testing)
        setLeads([
          { id: "mock-1", company_name: "Suresh Namkeen", contact_name: "Narendra Jain", industry: "F&B", status: "New", ai_hook_draft: "Lab-like Hygiene" },
          { id: "mock-2", company_name: "Ratan Sev Bhandar", contact_name: "P. Gelda", industry: "F&B", status: "Contacted", ai_hook_draft: "500+ Varieties" },
          { id: "mock-3", company_name: "Chemox ChemoPharma", contact_name: "Kishorbhai", industry: "Pharma", status: "Won", ai_hook_draft: "IndiaMART Reliance" },
          { id: "mock-4", company_name: "Indore Sweets Hub", contact_name: "Rahul Gupta", industry: "F&B", status: "New", ai_hook_draft: "No Website" },
        ]);
      }
      setLoading(false);
    }
    fetchLeads();
  }, []);

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          lead.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          lead.industry?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter ? lead.status === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

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
                  className="pl-9 pr-4 py-2 bg-secondary border border-border rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-full sm:w-64 transition-all"
                />
              </div>
              <div className="relative">
                <button 
                  onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                  className="flex items-center gap-2 px-4 py-2 bg-secondary border border-border rounded-xl text-sm hover:bg-secondary/80 transition-colors"
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
                      className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden"
                    >
                      <button onClick={() => { setStatusFilter(null); setFilterMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-secondary transition-colors">All Statuses</button>
                      <button onClick={() => { setStatusFilter('New'); setFilterMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-secondary transition-colors text-primary font-medium">New</button>
                      <button onClick={() => { setStatusFilter('Contacted'); setFilterMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-secondary transition-colors text-blue-500 font-medium">Contacted</button>
                      <button onClick={() => { setStatusFilter('Won'); setFilterMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-secondary transition-colors text-accent font-medium">Won</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-x-auto shadow-2xl">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-secondary/50 border-b border-border">
                  <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company</th>
                  <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</th>
                  <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Industry</th>
                  <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Hook</th>
                  <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground">Loading leads...</td>
                  </tr>
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground">No leads found matching your filters.</td>
                  </tr>
                ) : filteredLeads.map((lead, idx) => (
                  <motion.tr 
                    key={lead.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="border-b border-border/50 hover:bg-secondary/30 transition-colors group"
                  >
                    <td className="p-4 font-medium">{lead.company_name}</td>
                    <td className="p-4 text-muted-foreground">{lead.contact_name || 'N/A'}</td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 bg-secondary rounded-md text-xs font-medium border border-border">
                        {lead.industry}
                      </span>
                    </td>
                    <td className="p-4 text-sm max-w-[200px] truncate text-muted-foreground">
                      "{lead.ai_hook_draft || 'Generating...'}"
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                        lead.status === 'New' ? 'bg-primary/10 text-primary border-primary/20' : 
                        lead.status === 'Contacted' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 
                        'bg-accent/10 text-accent border-accent/20'
                      }`}>
                        {lead.status || 'New'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button className="p-2 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-lg transition-all opacity-0 group-hover:opacity-100 cursor-pointer">
                        <Mail className="w-4 h-4" />
                      </button>
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
