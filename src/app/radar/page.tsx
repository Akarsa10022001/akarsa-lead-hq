"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion } from "framer-motion";
import { Search, Filter, Mail } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export default function Radar() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      
      <main className="ml-72 p-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold">Lead Radar</h1>
              <p className="text-muted-foreground mt-1">AI-scouted targets waiting for your engagement.</p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Search targets..." 
                  className="pl-9 pr-4 py-2 bg-secondary border border-border rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-64 transition-all"
                />
              </div>
              <button className="flex items-center gap-2 px-4 py-2 bg-secondary border border-border rounded-xl text-sm hover:bg-secondary/80 transition-colors">
                <Filter className="w-4 h-4" /> Filters
              </button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
            <table className="w-full text-left border-collapse">
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
                ) : leads.map((lead, idx) => (
                  <motion.tr 
                    key={lead.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="border-b border-border/50 hover:bg-secondary/30 transition-colors group"
                  >
                    <td className="p-4 font-medium">{lead.company_name}</td>
                    <td className="p-4 text-muted-foreground">{lead.contact_name}</td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 bg-secondary rounded-md text-xs font-medium border border-border">
                        {lead.industry}
                      </span>
                    </td>
                    <td className="p-4 text-sm max-w-[200px] truncate text-muted-foreground">
                      "{lead.ai_hook_draft}"
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                        lead.status === 'New' ? 'bg-primary/10 text-primary border-primary/20' : 
                        lead.status === 'Contacted' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 
                        'bg-accent/10 text-accent border-accent/20'
                      }`}>
                        {lead.status}
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
