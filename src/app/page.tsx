"use client";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { motion } from "framer-motion";
import { Users, Mail, CheckCircle2, TrendingUp } from "lucide-react";

export default function Home() {
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {/* Stat Cards */}
            {[
              { title: "Total Leads", value: "248", icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
              { title: "Emails Sent", value: "1,024", icon: Mail, color: "text-primary", bg: "bg-primary/10" },
              { title: "Meetings Booked", value: "12", icon: CheckCircle2, color: "text-accent", bg: "bg-accent/10" },
              { title: "Conversion Rate", value: "4.8%", icon: TrendingUp, color: "text-orange-500", bg: "bg-orange-500/10" },
            ].map((stat, idx) => (
              <motion.div 
                key={idx}
                whileHover={{ y: -5 }}
                className="p-6 rounded-2xl bg-card border border-border flex items-center gap-4 relative overflow-hidden group"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color}`}>
                  <stat.icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-muted-foreground text-sm font-medium">{stat.title}</p>
                  <h3 className="text-3xl font-bold mt-1 text-foreground">{stat.value}</h3>
                </div>
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-gradient-to-br from-transparent to-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors"></div>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Activity Feed */}
            <div className="lg:col-span-2 p-6 rounded-2xl bg-card border border-border">
              <h3 className="text-lg font-bold mb-4">Recent Activity</h3>
              <div className="space-y-4">
                {[
                  { title: "Email sent to Chemox ChemoPharma", time: "10 mins ago", type: "email" },
                  { title: "Subagent discovered 3 new Namkeen leads", time: "1 hour ago", type: "agent" },
                  { title: "Meeting scheduled with Ratan Sev Bhandar", time: "3 hours ago", type: "meeting" },
                ].map((activity, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-4 rounded-xl bg-secondary/50 border border-border/50">
                    <div className="w-2 h-2 rounded-full bg-primary"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{activity.title}</p>
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/20">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                AI Agent Status
              </h3>
              <div className="p-4 rounded-xl bg-background border border-border mb-4">
                <p className="text-sm text-muted-foreground mb-2">Next Scheduled Run:</p>
                <p className="font-mono font-bold text-lg">Today, 14:00</p>
                <p className="text-xs text-primary mt-1">Hunting: B2B Pharma</p>
              </div>
              <button className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors shadow-[0_0_20px_rgba(147,51,234,0.3)]">
                Launch Manual Scan
              </button>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
