"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion } from "framer-motion";
import { Inbox as InboxIcon, MessageCircle, Reply, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export default function Inbox() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInbox() {
      // Fetch received messages and join with sequences to get lead data
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
              phone
            )
          )
        `)
        .eq('status', 'received')
        .order('sent_at', { ascending: false });

      if (!error && data) {
        setMessages(data);
      } else {
        console.error("Failed to fetch inbox:", error);
      }
      setLoading(false);
    }

    fetchInbox();
    
    // Set up real-time subscription for new messages
    const subscription = supabase
      .channel('public:outreach_messages')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'outreach_messages',
        filter: "status=eq.'received'"
      }, (payload) => {
        console.log('New message received!', payload);
        fetchInbox(); // Re-fetch to get the full joined data
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      
      <main className="md:ml-72 p-4 md:p-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-5xl mx-auto"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-primary/10 rounded-xl">
              <InboxIcon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Priority Inbox</h1>
              <p className="text-muted-foreground mt-1">Incoming replies and engaged leads.</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
            {loading ? (
              <div className="p-12 text-center text-muted-foreground">Syncing with Meta...</div>
            ) : messages.length === 0 ? (
              <div className="p-16 text-center flex flex-col items-center">
                <MessageCircle className="w-16 h-16 text-muted-foreground/30 mb-4" />
                <h3 className="text-xl font-bold">Inbox Zero</h3>
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">No incoming replies yet. Keep launching campaigns on the Lead Radar to drum up inbound interest!</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {messages.map((msg, idx) => (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="p-6 hover:bg-secondary/30 transition-colors flex flex-col md:flex-row gap-6 md:items-start group"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 bg-green-500/10 text-green-500 border border-green-500/20 rounded-md text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3" /> Engaged
                        </span>
                        <h3 className="text-lg font-bold">
                          {msg.outreach_sequences.leads.contact_name || 'Founder'} <span className="text-muted-foreground font-normal">at</span> {msg.outreach_sequences.leads.company_name}
                        </h3>
                        <span className="text-sm text-muted-foreground ml-auto">
                          {new Date(msg.sent_at).toLocaleDateString()} at {new Date(msg.sent_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      
                      <div className="p-4 bg-secondary/50 rounded-xl border border-border text-foreground/90 font-medium">
                        "{msg.draft_content}"
                      </div>
                    </div>
                    
                    <div className="flex flex-row md:flex-col gap-2 pt-2 md:pt-0">
                      <a 
                        href={`https://wa.me/${msg.outreach_sequences.leads.phone.replace(/\\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#25D366] text-white rounded-lg text-sm font-bold shadow-sm hover:bg-[#20b858] transition-colors"
                      >
                        <Reply className="w-4 h-4" /> Reply
                      </a>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
