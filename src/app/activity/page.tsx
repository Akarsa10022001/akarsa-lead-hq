"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion } from "framer-motion";
import { Activity, Mail, MessageCircle, Clock, CheckCircle2, AlertCircle, Send, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export default function ActivityLog() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchActivity() {
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

  useEffect(() => {
    fetchActivity();
    
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
      case 'pending': case 'Ready_to_send': return <Clock className="w-4 h-4 text-yellow-500" />;
      default: return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'sent': return 'text-green-500';
      case 'failed': return 'text-red-500';
      case 'pending': case 'Ready_to_send': return 'text-yellow-500';
      default: return 'text-muted-foreground';
    }
  };

  const handleSendWhatsApp = async (msg: any) => {
    const phone = msg.outreach_sequences?.leads?.phone;
    if (!phone) return;

    // Clean phone number: remove spaces, dashes, keep + and digits
    const cleanPhone = phone.replace(/[\s\-()]/g, '').replace(/^\+/, '');
    const message = msg.draft_content || '';
    
    // Open wa.me link
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');

    // Mark as sent in database
    await supabase
      .from('outreach_messages')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', msg.id);

    // Also update the lead status to Contacted
    const leadId = msg.outreach_sequences?.lead_id;
    if (leadId) {
      await supabase.from('leads').update({ status: 'Contacted' }).eq('id', leadId);
    }

    // Refresh the list
    fetchActivity();
  };

  const handleSendEmail = async (msg: any) => {
    const email = msg.outreach_sequences?.leads?.email;
    if (!email) return;

    const message = msg.draft_content || '';
    const subject = 'Quick question about your business';
    
    // Open mailto link
    window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`, '_blank');

    // Mark as sent
    await supabase
      .from('outreach_messages')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', msg.id);

    const leadId = msg.outreach_sequences?.lead_id;
    if (leadId) {
      await supabase.from('leads').update({ status: 'Contacted' }).eq('id', leadId);
    }

    fetchActivity();
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
            <div className="p-3 bg-primary/10 rounded-xl">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Activity Log</h1>
              <p className="text-muted-foreground mt-1">Click <strong>Send</strong> to open WhatsApp/Email with the message pre-filled.</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timestamp</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Channel</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Message Snippet</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-muted-foreground">Fetching server logs...</td>
                    </tr>
                  ) : messages.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-16 text-center text-muted-foreground">
                        <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                        No outbound activity yet. Launch a campaign!
                      </td>
                    </tr>
                  ) : (
                    messages.map((msg, idx) => {
                      const isReady = msg.status === 'Ready_to_send' || msg.status === 'pending';
                      const isSent = msg.status === 'sent';
                      const phone = msg.outreach_sequences?.leads?.phone;
                      const email = msg.outreach_sequences?.leads?.email;
                      const canSend = isReady && (msg.channel === 'whatsapp' ? !!phone : !!email);

                      return (
                        <motion.tr 
                          key={msg.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.03 }}
                          className={`transition-colors group ${isReady ? 'hover:bg-primary/5 cursor-pointer' : 'hover:bg-secondary/20'}`}
                        >
                          <td className="p-4 text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(msg.sent_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' })}
                          </td>
                          <td className="p-4">
                            <div className="font-bold">{msg.outreach_sequences.leads.company_name}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              {msg.channel === 'whatsapp' ? phone : email || 'Unknown'}
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${msg.channel === 'whatsapp' ? 'bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                              {msg.channel === 'whatsapp' ? <MessageCircle className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                              {msg.channel}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`flex items-center gap-1.5 text-sm font-medium ${getStatusColor(msg.status)}`}>
                              {getStatusIcon(msg.status)} {msg.status === 'Ready_to_send' ? 'Ready' : msg.status}
                            </span>
                          </td>
                          <td className="p-4 text-sm text-muted-foreground truncate max-w-xs hidden md:table-cell">
                            {msg.draft_content.substring(0, 60)}...
                          </td>
                          <td className="p-4">
                            {canSend ? (
                              <button
                                onClick={() => msg.channel === 'whatsapp' ? handleSendWhatsApp(msg) : handleSendEmail(msg)}
                                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                                  msg.channel === 'whatsapp' 
                                    ? 'bg-[#25D366] text-white hover:bg-[#20bd5a] hover:shadow-lg hover:shadow-[#25D366]/30' 
                                    : 'bg-blue-500 text-white hover:bg-blue-600 hover:shadow-lg hover:shadow-blue-500/30'
                                }`}
                              >
                                <Send className="w-3.5 h-3.5" />
                                Send
                              </button>
                            ) : isSent ? (
                              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-green-500/10 text-green-500 border border-green-500/20">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Sent
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">No contact</span>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })
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
