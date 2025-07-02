'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import GBotInterface from '@/components/GBotInterface';
import ProgressDisplay from '@/components/ProgressDisplay';
import JobHistory from '@/components/JobHistory';

interface JobStatus {
  id: string;
  celebrity: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentPhase: string;
  progress: number;
  roles?: string[];
  imagesProcessed?: number;
  imagesValidated?: number;
  downloadLink?: string;
  startTime?: Date;
  endTime?: Date;
}

export default function Dashboard() {
  const [celebrityName, setCelebrityName] = useState('');
  const [currentJob, setCurrentJob] = useState<JobStatus | null>(null);
  const [jobHistory, setJobHistory] = useState<JobStatus[]>([
    // Mock data for now
    {
      id: '1',
      celebrity: 'Ryan Reynolds',
      status: 'completed',
      currentPhase: 'Complete',
      progress: 100,
      roles: ['Deadpool', 'Green Lantern', 'The Proposal'],
      imagesProcessed: 47,
      imagesValidated: 23,
      downloadLink: '#',
      startTime: new Date(Date.now() - 300000),
      endTime: new Date(Date.now() - 60000)
    }
  ]);

  const handleStartJob = async () => {
    if (!celebrityName.trim()) return;

    const newJob: JobStatus = {
      id: Date.now().toString(),
      celebrity: celebrityName,
      status: 'running',
      currentPhase: 'Initializing AI systems...',
      progress: 0,
      startTime: new Date()
    };

    setCurrentJob(newJob);
    setCelebrityName('');

    // Mock progress simulation (will be replaced with real backend calls)
    simulateProgress(newJob);
  };

  const simulateProgress = async (job: JobStatus) => {
    const phases = [
      { phase: 'Scanning filmography database...', progress: 10, delay: 1000 },
      { phase: 'Analyzing most recognizable performances...', progress: 25, delay: 2000 },
      { phase: 'Generating precision search protocols...', progress: 40, delay: 1500 },
      { phase: 'Downloading image candidates...', progress: 70, delay: 3000 },
      { phase: 'AI validation in progress...', progress: 90, delay: 2000 },
      { phase: 'Compiling print-ready files...', progress: 100, delay: 1000 }
    ];

    for (const { phase, progress, delay } of phases) {
      await new Promise(resolve => setTimeout(resolve, delay));
      
      setCurrentJob(prev => prev ? {
        ...prev,
        currentPhase: phase,
        progress,
        roles: progress > 25 ? ['Deadpool', 'Green Lantern', 'The Proposal'] : undefined,
        imagesProcessed: progress > 70 ? Math.floor((progress - 70) * 2) : undefined,
        imagesValidated: progress > 90 ? Math.floor((progress - 90) * 2) : undefined
      } : null);
    }

    // Complete the job
    setTimeout(() => {
      setCurrentJob(prev => prev ? {
        ...prev,
        status: 'completed',
        currentPhase: 'Mission Complete!',
        downloadLink: '#',
        endTime: new Date()
      } : null);

      // Add to history after 2 seconds
      setTimeout(() => {
        if (currentJob) {
          setJobHistory(prev => [{ ...currentJob, status: 'completed', endTime: new Date() }, ...prev]);
          setCurrentJob(null);
        }
      }, 2000);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900/20 to-slate-900 relative">
      {/* Animated background grid */}
      <div className="cyber-grid"></div>
      
      {/* Centered Container */}
      <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
        <div className="w-full">
          {/* Header */}
          <motion.div 
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <h1 className="text-5xl font-cyber font-bold text-glow-blue mb-3">
              CELEBRITY IMAGE SOURCING SYSTEM
            </h1>
            <p className="text-xl text-slate-400 font-ui">
              Powered by GBot.EXE AI Assistant
            </p>
          </motion.div>

          {/* Dashboard Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-[1400px] mx-auto">
            {/* Left Column - GBot Chat Terminal */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="xl:col-span-1"
            >
              <GBotInterface 
                currentJob={currentJob}
                onStartJob={handleStartJob}
                celebrityName={celebrityName}
                setCelebrityName={setCelebrityName}
              />
            </motion.div>

            {/* Middle Column - Mission Status */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="xl:col-span-1"
            >
              <ProgressDisplay currentJob={currentJob} />
            </motion.div>

            {/* Right Column - Mission Archive */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="xl:col-span-1"
            >
              <JobHistory jobs={jobHistory} />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
