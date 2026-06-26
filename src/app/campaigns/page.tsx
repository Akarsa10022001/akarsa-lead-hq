"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion } from "framer-motion";
import { Send, Copy, AlertCircle, Sparkles, CheckCircle2, MessageCircle, Mail } from "lucide-react";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

function CampaignsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const leadId = searchParams.get('leadId');

  const [isSent, setIsSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [testPhone, setTestPhone] = useState("");
  const [lead, setLead] = useState<any>(null);

  useEffect(() => {
    async function fetchLead() {
      if (!leadId) {
        setFetching(false);
        return;
      }
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();
      
      if (!error && data) {
        setLead(data);
      }
      setFetching(false);
    }
    fetchLead();
  }, [leadId]);

  if (fetching) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar />
        <Header />
        <main className="md:ml-72 p-4 md:p-8 flex justify-center items-center md:h-[calc(100vh-80px)] py-12">
          <p className="text-muted-foreground">Loading target profile...</p>
        </main>
      </div>
    );
  }

  if (!lead && !fetching) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar />
        <Header />
        <main className="md:ml-72 p-4 md:p-8 flex justify-center items-center md:h-[calc(100vh-80px)] py-12">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-bold">No Lead Selected</h2>
            <p className="text-muted-foreground mt-2 mb-6">Select a lead from the Radar to launch a campaign.</p>
            <button onClick={() => router.push('/radar')} className="px-6 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90">
              Go to Radar
            </button>
          </div>
        </main>
      </div>
    );
  }

  const subject = `${lead.company_name} legacy vs. Online D2C potential`;
  
  // Construct dynamic email body based on DB hook
  const hookText = lead.ai_hook_draft || "your strong local presence";
  const contactName = lead.contact_name || "Founder";
  
  const emailBody = `Hi ${contactName},\n\nI was checking out ${lead.company_name} online today. Your local reputation and product variety is incredible.\n\nHowever, reading "${hookText}" on your site felt a bit clinical for such a rich, flavorful brand. You clearly have immense offline dominance, but your current online setup is likely leaving massive Direct-to-Consumer revenue on the table.\n\nAt Akarsa, we help heritage brands build premium visual stories that drive direct online sales. I'd love to show you how we could modernize your digital storefront without losing your legacy. Open to a brief chat next week?\n\nBest,\nRitik Sharma`;

  const handleSend = async () => {
    setLoading(true);
    try {
      const payload = { 
        leadId: lead.id, 
        templateName: 'akarsa_initial_contact', 
        channel, 
        testPhone,
        emailSubject: subject,
        emailBody: emailBody,
        targetEmail: lead.email || 'hello@example.com'
      };

      const res = await fetch('/api/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (data.success || data.error === 'Lead not found') {
        setIsSent(true);
        setTimeout(() => setIsSent(false), 3000);
      } else {
        alert("Failed to send sequence: " + data.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error triggering sequence.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(`${subject}\n\n${emailBody}`);
    alert("Draft copied to clipboard!");
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      
      <main className="md:ml-72 p-4 md:p-8 flex justify-center items-center md:h-[calc(100vh-80px)] py-12">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden relative"
        >
          {isSent && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-accent/90 z-50 flex flex-col items-center justify-center text-accent-foreground backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1, rotate: 360 }}
                transition={{ type: "spring", bounce: 0.5 }}
              >
                <CheckCircle2 className="w-24 h-24 mb-4" />
              </motion.div>
              <h2 className="text-3xl font-bold text-center px-4">Boom! Payload Delivered!</h2>
              <p className="mt-2 text-accent-foreground/80 font-medium">+50 XP Earned</p>
            </motion.div>
          )}

          <div className="p-4 md:p-6 border-b border-border/50 bg-secondary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" /> AI Draft Ready
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Target: {contactName} ({lead.company_name})</p>
            </div>
            
            <div className="flex items-center gap-2 bg-background border border-border p-1 rounded-xl">
              <button 
                onClick={() => setChannel('email')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${channel === 'email' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary'}`}
              >
                <Mail className="w-4 h-4" /> Email
              </button>
              <button 
                onClick={() => setChannel('whatsapp')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${channel === 'whatsapp' ? 'bg-[#25D366] text-white shadow-sm' : 'text-muted-foreground hover:bg-secondary'}`}
              >
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </button>
            </div>
          </div>

          <div className="p-4 md:p-8 space-y-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Subject Line</label>
              <div className="p-3 bg-secondary/50 border border-border rounded-lg text-foreground font-medium text-sm md:text-base">
                {subject}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Message Body</label>
              <div className="p-4 bg-secondary/50 border border-border rounded-xl text-foreground/90 whitespace-pre-line leading-relaxed text-sm md:text-base font-medium max-h-[40vh] overflow-y-auto">
                {emailBody}
              </div>
            </div>

            {channel === 'whatsapp' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Test Phone Number (Optional Override)</label>
                <input 
                  type="text" 
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder={`e.g. 919876543210 (Target default: ${lead.phone || 'None'})`} 
                  className="w-full p-3 bg-secondary/50 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary text-sm"
                />
              </div>
            )}

            <div className="flex items-start gap-3 text-sm text-yellow-500 bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>This message is highly personalized based on their current website copy. Do not alter the hook without reviewing their site.</p>
            </div>
          </div>

          <div className="p-4 md:p-6 border-t border-border/50 bg-background flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-4">
            <button onClick={copyToClipboard} className="flex items-center justify-center sm:justify-start gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium w-full sm:w-auto p-2 sm:p-0">
              <Copy className="w-4 h-4" /> Copy to Clipboard
            </button>
            <div className="flex gap-3 w-full sm:w-auto">
              <button className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl border border-border hover:bg-secondary text-sm font-bold transition-all">
                Edit
              </button>
              <button 
                onClick={handleSend}
                disabled={loading || (channel === 'whatsapp' && !lead.phone && !testPhone)}
                className="flex-2 sm:flex-none px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(147,51,234,0.4)] disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> {loading ? "Firing..." : `Send via ${channel === 'email' ? 'Email' : 'WhatsApp'}`}
              </button>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

export default function Campaigns() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center">Loading campaign data...</div>}>
      <CampaignsContent />
    </Suspense>
  );
}
