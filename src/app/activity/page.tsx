"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion } from "framer-motion";
import { Activity, Mail, MessageCircle, Clock, CheckCircle2, AlertCircle, Phone, Briefcase } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export default function ActivityLog() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchActivity() {
    const { data, error } = await supabase
      .from('touches')
      .select(`
        *,
        leads!inner (
          company_name,
          contact_name,
          phone_e164,
          email
        )
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setMessages(data);
    } else {
      console.error("Failed to fetch activity log:", error);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchActivity();
  }, []);

  const getStatusIcon = (status: string) => {
    const s = (status || '').toLowerCase();
    switch(s) {
      case 'sent': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'skipped': return <Clock className="w-4 h-4 text-yellow-500" />;
      default: return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    const s = (status || '').toLowerCase();
    switch(s) {
      case 'sent': return 'text-green-500';
      case 'failed': return 'text-red-500';
      case 'skipped': return 'text-yellow-500';
      default: return 'text-muted-foreground';
    }
  };

  const getChannelIcon = (channel: string) => {
    switch(channel.toLowerCase()) {
      case 'whatsapp': return <MessageCircle className="w-3 h-3" />;
      case 'email': return <Mail className="w-3 h-3" />;
      case 'phone': return <Phone className="w-3 h-3" />;
      case 'linkedin': return <Briefcase className="w-3 h-3" />;
      default: return <Activity className="w-3 h-3" />;
    }
  };

  const getChannelStyle = (channel: string) => {
    switch(channel.toLowerCase()) {
      case 'whatsapp': return 'bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20';
      case 'email': return 'bg-blue-500/10 text-blue-500 border border-blue-500/20';
      case 'phone': return 'bg-orange-500/10 text-orange-500 border border-orange-500/20';
      case 'linkedin': return 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20';
      default: return 'bg-secondary text-foreground border border-border';
    }
  }

  return (
    <div className="flex h-screen bg-background text-foreground font-body">
      <Sidebar />
      <main className="flex-1 flex flex-col md:pl-72 h-screen overflow-y-auto">
        <Header />
        
        <div className="p-6 max-w-6xl w-full mx-auto space-y-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold font-heading uppercase tracking-wider">Activity Log</h1>
              <p className="text-muted-foreground mt-1">A historical audit trail of every touchpoint successfully dispatched or failed.</p>
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
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Direction</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes / Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-muted-foreground font-mono">Fetching server logs...</td>
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
                      return (
                        <motion.tr 
                          key={msg.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.03 }}
                          className="transition-colors hover:bg-secondary/20"
                        >
                          <td className="p-4 text-sm text-muted-foreground whitespace-nowrap font-mono text-xs">
                            {new Date(msg.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' })}
                          </td>
                          <td className="p-4">
                            <div className="font-bold uppercase font-heading">{msg.leads?.company_name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {msg.leads?.contact_name}
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${getChannelStyle(msg.channel)}`}>
                              {getChannelIcon(msg.channel)}
                              {msg.channel}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="text-xs uppercase font-bold tracking-widest text-muted-foreground">
                              {msg.direction}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest ${getStatusColor(msg.send_status)}`}>
                              {getStatusIcon(msg.send_status)} {msg.send_status || 'Sent'}
                            </span>
                          </td>
                          <td className="p-4 text-xs text-muted-foreground max-w-sm truncate font-mono">
                            {msg.notes}
                          </td>
                        </motion.tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
