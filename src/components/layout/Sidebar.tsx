"use client";

import { motion } from "framer-motion";
import { Zap, Target, Mail, Send, Award, Flame, Users, LayoutDashboard, Activity, Sparkles } from "lucide-react";

const IgIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

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
          <div className="w-10 h-10 bg-primary flex items-center justify-center text-primary-foreground border border-primary">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-foreground uppercase font-heading">Lead HQ</h1>
            <p className="text-xs text-primary font-mono tracking-wider">AKARSA STUDIO</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-2 flex-1">
        <Link href="/">
          <span className={`flex items-center gap-3 px-4 py-3 transition-all ${pathname === '/' ? 'bg-secondary text-primary border border-border' : 'text-muted-foreground border border-transparent hover:border-border hover:bg-secondary hover:text-foreground'}`}>
            <LayoutDashboard className="w-5 h-5" />
            <span className="font-medium">Command Center</span>
          </span>
        </Link>
        <Link href="/radar">
          <span className={`flex items-center gap-3 px-4 py-3 transition-all ${pathname === '/radar' ? 'bg-secondary text-primary border border-border' : 'text-muted-foreground border border-transparent hover:border-border hover:bg-secondary hover:text-foreground'}`}>
            <Target className="w-5 h-5" />
            <span className="font-medium">Lead Radar</span>
          </span>
        </Link>
        <Link href="/campaigns">
          <span className={`flex items-center gap-3 px-4 py-3 transition-all ${pathname === '/campaigns' ? 'bg-secondary text-primary border border-border' : 'text-muted-foreground border border-transparent hover:border-border hover:bg-secondary hover:text-foreground'}`}>
            <Send className="w-5 h-5" />
            <span className="font-medium">Outreach Campaigns</span>
          </span>
        </Link>
        <Link href="/inbox">
          <span className={`flex items-center gap-3 px-4 py-3 transition-all ${pathname === '/inbox' ? 'bg-secondary text-primary border border-border' : 'text-muted-foreground border border-transparent hover:border-border hover:bg-secondary hover:text-foreground'}`}>
            <Mail className="w-5 h-5" />
            <span className="font-medium">Priority Inbox</span>
          </span>
        </Link>
        <Link href="/activity">
          <span className={`flex items-center gap-3 px-4 py-3 transition-all ${pathname === '/activity' ? 'bg-secondary text-primary border border-border' : 'text-muted-foreground border border-transparent hover:border-border hover:bg-secondary hover:text-foreground'}`}>
            <Activity className="w-5 h-5" />
            <span className="font-medium">Activity Log</span>
          </span>
        </Link>
        <div className="pt-4 pb-1">
          <span className="px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest block font-heading">Agents</span>
        </div>
        <Link href="/instagram">
          <span className={`flex items-center gap-3 px-4 py-3 transition-all ${pathname === '/instagram' ? 'bg-pink-950/60 text-pink-300 border border-pink-500/50' : 'text-muted-foreground border border-transparent hover:border-pink-500/40 hover:bg-pink-950/30 hover:text-pink-300'}`}>
            <IgIcon className="w-5 h-5 text-pink-400" />
            <span className="font-semibold text-xs uppercase tracking-wider">Instagram Agent</span>
          </span>
        </Link>
        <div className="pt-4 pb-1">
          <span className="px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest block font-heading">Dream 25 Engine</span>
        </div>
        <Link href="/consensus">
          <span className={`flex items-center gap-3 px-4 py-3 transition-all ${pathname === '/consensus' ? 'bg-purple-950/60 text-purple-300 border border-purple-500/50' : 'text-muted-foreground border border-transparent hover:border-purple-500/40 hover:bg-purple-950/30 hover:text-purple-300'}`}>
            <Sparkles className="w-5 h-5 text-purple-400" />
            <span className="font-semibold text-xs uppercase tracking-wider">Consensus Swarm (8-Agent)</span>
          </span>
        </Link>
        <Link href="/dashboard/targets">
          <span className={`flex items-center gap-3 px-4 py-3 transition-all ${pathname === '/dashboard/targets' ? 'bg-secondary text-primary border border-border' : 'text-muted-foreground border border-transparent hover:border-border hover:bg-secondary hover:text-foreground'}`}>
            <Users className="w-5 h-5" />
            <span className="font-medium">Dream 25 Targets</span>
          </span>
        </Link>
        <Link href="/dashboard/approvals">
          <span className={`flex items-center gap-3 px-4 py-3 transition-all ${pathname === '/dashboard/approvals' ? 'bg-secondary text-primary border border-border' : 'text-muted-foreground border border-transparent hover:border-border hover:bg-secondary hover:text-foreground'}`}>
            <Flame className="w-5 h-5" />
            <span className="font-medium">Approvals Queue</span>
          </span>
        </Link>
        <Link href="/dashboard/insights">
          <span className={`flex items-center gap-3 px-4 py-3 transition-all ${pathname === '/dashboard/insights' ? 'bg-secondary text-primary border border-border' : 'text-muted-foreground border border-transparent hover:border-border hover:bg-secondary hover:text-foreground'}`}>
            <Award className="w-5 h-5" />
            <span className="font-medium">Sequence Insights</span>
          </span>
        </Link>
      </nav>

      {/* Theme Toggle at bottom */}
      <div className="p-4 border-t border-border/50">
        <ThemeToggle />
      </div>
    </aside>
  );
}
