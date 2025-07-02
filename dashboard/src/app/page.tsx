'use client';

import { useState, useEffect } from 'react';
import GBotInterface from '@/components/GBotInterface';
import ProgressDisplay from '@/components/ProgressDisplay';
import JobHistory from '@/components/JobHistory';

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-blue-400 font-cyber text-xl animate-pulse">
          INITIALIZING GBOT.EXE...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Centered Container Wrapper */}
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-[1400px]">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-cyber bg-gradient-to-r from-blue-400 to-pink-400 bg-clip-text text-transparent mb-2">
              CELEBRITY IMAGE SOURCING DASHBOARD
            </h1>
            <p className="text-blue-300 font-ui text-lg">
              GBot.EXE • Mission Control • Archive System
            </p>
          </div>

          {/* Main Dashboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 auto-rows-fr">
            {/* Left Panel - GBot Interface */}
            <div className="cyber-panel h-[650px] overflow-hidden">
              <GBotInterface />
            </div>

            {/* Middle Panel - Progress Display */}
            <div className="cyber-panel h-[650px] overflow-hidden">
              <ProgressDisplay />
            </div>

            {/* Right Panel - Job History */}
            <div className="cyber-panel h-[650px] overflow-hidden">
              <JobHistory />
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-8 text-sm text-blue-400 font-ui">
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span>SYSTEM ONLINE</span>
              <span className="mx-2">•</span>
              <span>Phase 1.5 Complete</span>
              <span className="mx-2">•</span>
              <span>Ready for Backend Integration</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
