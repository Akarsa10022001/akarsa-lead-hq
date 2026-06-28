"use client";

import { motion } from "framer-motion";
import { Zap, Target, Mail, Send, Award, Flame, Users, LayoutDashboard, Activity } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();
  
  // Gamification Data (Hardcoded for UI demo)
  const userXP = 2450;
  const nextLevelXP = 3000;
  const progress = (userXP / nextLevelXP) * 100;
  
  const quests = [
    { title: "Send 10 Cold Emails", current: 7, target: 10, completed: false },
    { title: "Find 5 New Leads", current: 5, target: 5, completed: true },
    { title: "Schedule 1 Meeting", current: 0, target: 1, completed: false },
  ];

  return (
    <aside className="w-72 bg-card border-r border-border h-screen hidden md:flex flex-col fixed left-0 top-0 overflow-y-auto">
      {/* Brand */}
      <div className="p-6 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-[0_0_15px_rgba(147,51,234,0.5)]">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-foreground">Lead HQ</h1>
            <p className="text-xs text-primary font-mono tracking-wider">AKARSA STUDIO</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-2 flex-1">
        <Link href="/">
          <span className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/' ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_10px_rgba(147,51,234,0.2)]' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
            <LayoutDashboard className="w-5 h-5" />
            <span className="font-medium">Command Center</span>
          </span>
        </Link>
        <Link href="/radar">
          <span className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/radar' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
            <Target className="w-5 h-5" />
            <span className="font-medium">Lead Radar</span>
          </span>
        </Link>
        <Link href="/campaigns">
          <span className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/campaigns' ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_10px_rgba(147,51,234,0.2)]' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
            <Send className="w-5 h-5" />
            <span className="font-medium">Outreach Campaigns</span>
          </span>
        </Link>
        <Link href="/inbox">
          <span className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/inbox' ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_10px_rgba(147,51,234,0.2)]' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
            <Mail className="w-5 h-5" />
            <span className="font-medium">Priority Inbox</span>
          </span>
        </Link>
        <Link href="/activity">
          <span className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/activity' ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_10px_rgba(147,51,234,0.2)]' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
            <Activity className="w-5 h-5" />
            <span className="font-medium">Activity Log</span>
          </span>
        </Link>
      </nav>
    </aside>
  );
}
