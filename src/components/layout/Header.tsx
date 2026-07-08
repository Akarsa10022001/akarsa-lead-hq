"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Flame, Bell, Settings, User, Menu, X, Target, Send, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const handleNotificationClick = () => alert("No new notifications!");
  const handleSettingsClick = () => alert("Settings panel would open here!");

  return (
    <>
      <header className="h-20 bg-background/80 backdrop-blur-md border-b border-border flex items-center justify-between px-4 md:px-8 sticky top-0 z-50 md:ml-72">
        <div className="flex items-center gap-3">
          <button 
            className="md:hidden w-10 h-10 bg-secondary flex items-center justify-center border border-border"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-foreground font-heading uppercase tracking-wide">Welcome back, Ritik</h2>
            <p className="text-muted-foreground text-xs md:text-sm hidden sm:block font-mono">Let's close some deals today.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-6">
          {/* Gamification Module: Streak Counter */}
          <div className="hidden sm:flex items-center gap-2 bg-background px-4 py-2 border border-border">
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                rotate: [0, 10, -10, 0] 
              }}
              transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
            >
              <Flame className="w-5 h-5 text-orange-500 fill-orange-500/20" />
            </motion.div>
            <span className="font-bold text-foreground text-sm uppercase tracking-widest font-heading">12 Day Streak</span>
          </div>

          <div className="flex items-center gap-1 md:gap-3 sm:border-l border-border sm:pl-6">
            <button 
              onClick={handleNotificationClick}
              className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors relative border border-transparent hover:border-border"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-none animate-pulse"></span>
            </button>
            <button 
              onClick={handleSettingsClick}
              className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors border border-transparent hover:border-border"
            >
              <Settings className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 bg-primary flex items-center justify-center text-primary-foreground ml-1 md:ml-2 border border-primary">
              <User className="w-5 h-5" />
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/95 backdrop-blur-md z-[100] md:hidden flex flex-col"
          >
            <div className="p-6 flex justify-end border-b border-border">
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="w-10 h-10 rounded-none bg-secondary flex items-center justify-center"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <nav className="flex-1 p-8 flex flex-col gap-6 text-xl font-bold">
              <Link href="/" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-4 p-4 rounded-none ${pathname === '/' ? 'bg-primary/20 text-primary' : 'text-foreground'}`}>
                <LayoutDashboard /> Command Center
              </Link>
              <Link href="/radar" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-4 p-4 rounded-none ${pathname === '/radar' ? 'bg-primary/20 text-primary' : 'text-foreground'}`}>
                <Target /> Lead Radar
              </Link>
              <Link href="/campaigns" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-4 p-4 rounded-none ${pathname === '/campaigns' ? 'bg-primary/20 text-primary' : 'text-foreground'}`}>
                <Send /> Outreach Campaigns
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
