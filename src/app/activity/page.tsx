"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion } from "framer-motion";
import { Activity, Mail, MessageCircle, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export default function ActivityLog() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchActivity() {
      // Fetch sent/failed messages and join with sequences to get lead data
      const { data, error } = await supabase
        .from('outreach_messages')
        .select(`
          id,
          draft_content,
          sent_at,
          status,
          channel,
          outreach_sequences!inner (
            lead_id,
            leads!inner (
              company_name,
              contact_name,
              phone,
              email
            )
          )
        `)
        .neq('status', 'received')
        .order('sent_at', { ascending: false });

      if (!error && data) {
        setMessages(data);
      } else {
        console.error("Failed to fetch activity log:", error);
      }
      setLoading(false);
    }

    fetchActivity();
    
    // Set up real-time subscription for outgoing messages
    const subscription = supabase
      .channel('public:activity_log')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'outreach_messages'
      }, (payload) => {
        if (payload.new.status !== 'received') {
          fetchActivity();
        }
      })
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'outreach_messages'
      }, (payload) => {
        if (payload.new.status !== 'received') {
          fetchActivity();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'sent': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      default: return <CheckCircle2 className="w-4 h-4 text-green-500" />;
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
          className="max-w-6xl mx-auto"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-primary/10 rounded-none">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Activity Log</h1>
              <p className="text-muted-foreground mt-1">Real-time status of all your outbound campaigns.</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-none overflow-hidden shadow-none">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timestamp</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Channel</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Message Snippet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-muted-foreground">Fetching server logs...</td>
                    </tr>
                  ) : messages.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-16 text-center text-muted-foreground">
                        <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                        No outbound activity yet. Launch a campaign!
                      </td>
                    </tr>
                  ) : (
                    messages.map((msg, idx) => (
                      <motion.tr 
                        key={msg.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        className="hover:bg-secondary/20 transition-colors group"
                      >
                        <td className="p-4 text-sm text-muted-foreground whitespace-nowrap">
                          {new Date(msg.sent_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' })}
                        </td>
                        <td className="p-4">
                          <div className="font-bold">{msg.outreach_sequences.leads.company_name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            {msg.channel === 'whatsapp' ? msg.outreach_sequences.leads.phone : msg.outreach_sequences.leads.email || 'Unknown'}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${msg.channel === 'whatsapp' ? 'bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                            {msg.channel === 'whatsapp' ? <MessageCircle className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                            {msg.channel}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="flex items-center gap-1.5 text-sm font-medium capitalize">
                            {getStatusIcon(msg.status)} {msg.status}
                          </span>
                        </td>
                        <td className="p-4 text-sm text-muted-foreground truncate max-w-xs hidden md:table-cell">
                          {msg.draft_content.substring(0, 60)}...
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
