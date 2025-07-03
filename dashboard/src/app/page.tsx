'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import GBotInterface from '@/components/GBotInterface';
import ProgressDisplay from '@/components/ProgressDisplay';
import JobHistory from '@/components/JobHistory';
import { celebrityAPI, JobStatus } from '@/services/api';

export default function Dashboard() {
  const [celebrityName, setCelebrityName] = useState('');
  const [currentJob, setCurrentJob] = useState<JobStatus | null>(null);
  const [jobHistory, setJobHistory] = useState<JobStatus[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Load job history on component mount
  useEffect(() => {
    loadJobHistory();
    return () => {
      // Cleanup polling on unmount
      celebrityAPI.cleanup();
    };
  }, []);

  // Load job history from API
  const loadJobHistory = async () => {
    try {
      const jobs = await celebrityAPI.getAllJobs();
      setJobHistory(jobs);
    } catch (error) {
      console.error('Failed to load job history:', error);
    }
  };

  // Start new celebrity job
  const handleStartJob = async () => {
    if (!celebrityName.trim()) return;

    try {
      // Start job via API
      const jobId = await celebrityAPI.startJob(celebrityName.trim());
      setCurrentJobId(jobId);
      setCelebrityName('');

      // Start polling for updates
      celebrityAPI.startPolling(jobId, (job) => {
        if (job) {
          setCurrentJob(job);
          
          // When job completes, move to history and clear current
          if (job.status === 'completed') {
            setTimeout(() => {
              setCurrentJob(null);
              setCurrentJobId(null);
              loadJobHistory(); // Refresh history
            }, 3000); // Show completed state for 3 seconds
          }
        }
      });

    } catch (error) {
      console.error('Failed to start job:', error);
      alert(`Failed to start job: ${error.message}`);
    }
  };

  // Cancel current job
  const handleCancelJob = async () => {
    if (currentJobId) {
      try {
        await celebrityAPI.cancelJob(currentJobId);
        celebrityAPI.stopPolling(currentJobId);
        setCurrentJob(null);
        setCurrentJobId(null);
        loadJobHistory();
      } catch (error) {
        console.error('Failed to cancel job:', error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900/20 to-slate-900 relative">
      {/* Animated background grid */}
      <div className="cyber-grid"></div>
      
      {/* Main Container - Structured Layout */}
      <div className="min-h-screen flex flex-col justify-center px-8 py-8 relative z-10">
        
        {/* Header Section */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-cyber font-bold text-glow-blue mb-3">
            CELEBRITY IMAGE SOURCING SYSTEM
          </h1>
          <p className="text-lg text-slate-400 font-ui">
            Powered by GBot.EXE AI Assistant
          </p>
        </motion.div>

        {/* Three Horizontal Panels with Better Spacing */}
        <div className="max-w-7xl mx-auto w-full space-y-16">
          
          {/* Panel 1 - GBot Terminal */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="w-full"
          >
            <GBotInterface 
              currentJob={currentJob}
              onStartJob={handleStartJob}
              celebrityName={celebrityName}
              setCelebrityName={setCelebrityName}
            />
          </motion.div>

          {/* Panel 2 - Mission Status */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="w-full"
          >
            <ProgressDisplay currentJob={currentJob} />
          </motion.div>

          {/* Panel 3 - Mission Archive */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="w-full"
          >
            <JobHistory jobs={jobHistory} />
          </motion.div>

        </div>
      </div>
    </div>
  );
}
