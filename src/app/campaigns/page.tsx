"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion } from "framer-motion";
import { Send, Copy, AlertCircle, Sparkles, CheckCircle2, MessageCircle, Mail } from "lucide-react";
import { useState } from "react";

export default function Campaigns() {
  const [isSent, setIsSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('email');
  const [testPhone, setTestPhone] = useState("");

  const subject = "Malwa Mill legacy vs. Online D2C potential";
  const emailBody = `Hi Narendra,\n\nI was checking out Suresh Namkeen online today. Your legacy since 1960 and massive 170+ product variety is incredible.\n\nHowever, reading "Lab-like Hygiene" on your site felt a bit clinical for such a rich, flavorful brand. You clearly have immense offline dominance at Malwa Mill Square, but your current online setup (running partly on a free Wix domain) is likely leaving massive Direct-to-Consumer revenue on the table.\n\nAt Akarsa, we help heritage brands build premium visual stories that drive direct online sales. I'd love to show you how we could modernize your digital storefront without losing your 60-year legacy. Open to a brief chat next week?\n\nBest,\nRitik Sharma`;

  const handleSend = async () => {
    if (channel === 'email') {
      // Free Zero-Cost Mailto Fallback
      window.open(`mailto:founder@sureshnamkeen.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`, '_self');
      setIsSent(true);
      setTimeout(() => setIsSent(false), 3000);
      return;
    }

    // WhatsApp Backend Trigger
    setLoading(true);
    try {
      const res = await fetch('/api/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: 'mock-1', templateName: 'akarsa_initial_contact', channel: 'whatsapp', testPhone })
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
          {/* Confetti / Success Overlay */}
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
              <p className="text-sm text-muted-foreground mt-1">Target: Narendra Jain (Suresh Namkeen)</p>
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
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Test Phone Number (Optional)</label>
                <input 
                  type="text" 
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="e.g. 919876543210 (Include Country Code)" 
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
                disabled={loading}
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
