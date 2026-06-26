"use client";

import { motion } from "framer-motion";
import { Flame, Bell, Settings, User } from "lucide-react";

export default function Header() {
  return (
    <header className="h-20 bg-background/80 backdrop-blur-md border-b border-border flex items-center justify-between px-8 sticky top-0 z-50 ml-72">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Welcome back, Ritik</h2>
        <p className="text-muted-foreground text-sm">Let's close some deals today.</p>
      </div>

      <div className="flex items-center gap-6">
        {/* Gamification Module: Streak Counter */}
        <div className="flex items-center gap-2 bg-secondary/50 px-4 py-2 rounded-full border border-border">
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              rotate: [0, 10, -10, 0] 
            }}
            transition={{ 
              duration: 2,
              repeat: Infinity,
              repeatType: "reverse" 
            }}
          >
            <Flame className="w-5 h-5 text-orange-500 fill-orange-500/20" />
          </motion.div>
          <span className="font-bold text-foreground">12 Day Streak</span>
        </div>

        <div className="flex items-center gap-3 border-l border-border pl-6">
          <button className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full animate-pulse"></span>
          </button>
          <button className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
            <Settings className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center text-primary ml-2">
            <User className="w-5 h-5" />
          </div>
        </div>
      </div>
    </header>
  );
}
