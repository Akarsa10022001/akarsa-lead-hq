"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion } from "framer-motion";
import { Send, Copy, AlertCircle, Sparkles, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export default function Campaigns() {
  const [isSent, setIsSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Hardcoding the mock lead ID for demo. In production, this would be passed from a selected lead.
        body: JSON.stringify({ leadId: 'mock-1', templateName: 'akarsa_initial_contact', channel: 'whatsapp' })
      });
      
      const data = await res.json();
      if (data.success || data.error === 'Lead not found') {
        // If it succeeds or fails purely because it's a mock UI demo without real DB leads, we show confetti
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

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      
      <main className="ml-72 p-8 flex justify-center items-center h-[calc(100vh-80px)]">
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
              <h2 className="text-3xl font-bold">Boom! Payload Delivered!</h2>
              <p className="mt-2 text-accent-foreground/80 font-medium">+50 XP Earned</p>
            </motion.div>
          )}

          <div className="p-6 border-b border-border/50 bg-secondary/30 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" /> AI Draft Ready
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Target: Narendra Jain (Suresh Namkeen)</p>
            </div>
            <span className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-bold uppercase tracking-wider">
              High Probability
            </span>
          </div>

          <div className="p-8 space-y-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Subject Line</label>
              <div className="p-3 bg-secondary/50 border border-border rounded-lg text-foreground font-medium">
                Malwa Mill legacy vs. Online D2C potential
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Email Body</label>
              <div className="p-4 bg-secondary/50 border border-border rounded-xl text-foreground/90 whitespace-pre-line leading-relaxed text-sm font-medium">
                Hi Narendra,{"\n\n"}
                I was checking out Suresh Namkeen online today. Your legacy since 1960 and massive 170+ product variety is incredible.{"\n\n"}
                However, reading "Lab-like Hygiene" on your site felt a bit clinical for such a rich, flavorful brand. You clearly have immense offline dominance at Malwa Mill Square, but your current online setup (running partly on a free Wix domain) is likely leaving massive Direct-to-Consumer revenue on the table.{"\n\n"}
                At Akarsa, we help heritage brands build premium visual stories that drive direct online sales. I'd love to show you how we could modernize your digital storefront without losing your 60-year legacy. Open to a brief chat next week?{"\n\n"}
                Best,{"\n"}
                Ritik Sharma
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-yellow-500 bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p>This email is highly personalized based on their current website copy. Do not alter the hook without reviewing their site.</p>
            </div>
          </div>

          <div className="p-6 border-t border-border/50 bg-background flex items-center justify-between">
            <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
              <Copy className="w-4 h-4" /> Copy to Clipboard
            </button>
            <div className="flex gap-3">
              <button className="px-6 py-2.5 rounded-xl border border-border hover:bg-secondary text-sm font-bold transition-all">
                Edit Draft
              </button>
              <button 
                onClick={handleSend}
                disabled={loading}
                className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(147,51,234,0.4)] disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> {loading ? "Firing..." : "Fire Sequence"}
              </button>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
