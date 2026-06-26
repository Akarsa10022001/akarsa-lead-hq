"use client";

import { motion } from "framer-motion";
import { Zap, Target, Mail, Send, Award, Flame, Users, LayoutDashboard } from "lucide-react";
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
          <span className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/campaigns' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
            <Send className="w-5 h-5" />
            <span className="font-medium">Outreach Campaigns</span>
          </span>
        </Link>
      </nav>

      {/* Gamification Module: XP & Level */}
      <div className="p-6 border-t border-border/50 bg-secondary/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
        
        <div className="flex justify-between items-end mb-2 relative z-10">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Current Rank</p>
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Award className="w-4 h-4 text-primary" /> Novice Prospector
            </h3>
          </div>
          <span className="text-xs font-mono text-primary font-bold">Lvl 4</span>
        </div>
        
        {/* XP Bar */}
        <div className="h-2 w-full bg-background rounded-full mt-3 overflow-hidden relative z-10 border border-border">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="h-full bg-primary relative"
          >
            <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
          </motion.div>
        </div>
        <div className="flex justify-between mt-2 text-xs font-mono text-muted-foreground relative z-10">
          <span>{userXP} XP</span>
          <span>{nextLevelXP} XP</span>
        </div>
      </div>

      {/* Gamification Module: Daily Quests */}
      <div className="p-6 border-t border-border/50 bg-background">
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
          <Target className="w-4 h-4" /> Daily Quests
        </h4>
        <div className="space-y-4">
          {quests.map((quest, idx) => (
            <div key={idx} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className={`${quest.completed ? 'text-accent line-through opacity-70' : 'text-foreground'}`}>
                  {quest.title}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {quest.current}/{quest.target}
                </span>
              </div>
              <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(quest.current / quest.target) * 100}%` }}
                  transition={{ duration: 1, delay: 0.2 * idx }}
                  className={`h-full ${quest.completed ? 'bg-accent' : 'bg-primary'}`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
