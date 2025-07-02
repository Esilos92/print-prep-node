import { motion } from 'framer-motion';
import { 
  Search, 
  Brain, 
  Target, 
  Download, 
  Shield, 
  Package,
  Clock,
  CheckCircle2,
  Image
} from 'lucide-react';

interface JobStatus {
  id: string;
  celebrity: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentPhase: string;
  progress: number;
  roles?: string[];
  imagesProcessed?: number;
  imagesValidated?: number;
  startTime?: Date;
}

interface ProgressDisplayProps {
  currentJob: JobStatus | null;
}

const phases = [
  { icon: Search, name: 'Filmography Scan', color: 'text-blue-400' },
  { icon: Brain, name: 'Performance Analysis', color: 'text-purple-400' },
  { icon: Target, name: 'Search Protocol', color: 'text-green-400' },
  { icon: Download, name: 'Image Download', color: 'text-yellow-400' },
  { icon: Shield, name: 'AI Validation', color: 'text-orange-400' },
  { icon: Package, name: 'File Compilation', color: 'text-pink-400' }
];

export default function ProgressDisplay({ currentJob }: ProgressDisplayProps) {
  const getPhaseProgress = (phaseIndex: number) => {
    if (!currentJob) return 0;
    const phaseThresholds = [10, 25, 40, 70, 90, 100];
    const currentThreshold = phaseThresholds[phaseIndex];
    const prevThreshold = phaseIndex > 0 ? phaseThresholds[phaseIndex - 1] : 0;
    
    if (currentJob.progress < prevThreshold) return 0;
    if (currentJob.progress >= currentThreshold) return 100;
    
    return ((currentJob.progress - prevThreshold) / (currentThreshold - prevThreshold)) * 100;
  };

  const getCurrentPhaseIndex = () => {
    if (!currentJob) return -1;
    const thresholds = [10, 25, 40, 70, 90, 100];
    return thresholds.findIndex(threshold => currentJob.progress <= threshold);
  };

  const formatDuration = (startTime?: Date) => {
    if (!startTime) return '0s';
    const duration = Math.floor((Date.now() - startTime.getTime()) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  return (
    <div className="cyber-panel p-6 h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-cyber font-bold text-glow-blue">
          MISSION STATUS
        </h3>
        {currentJob && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Clock className="w-4 h-4" />
            {formatDuration(currentJob.startTime)}
          </div>
        )}
      </div>

      {!currentJob ? (
        /* Idle State */
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center h-full text-center"
        >
          <div className="w-32 h-32 bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
            <Search className="w-16 h-16 text-slate-600" />
          </div>
          <h4 className="text-lg font-cyber text-slate-400 mb-2">
            AWAITING MISSION PARAMETERS
          </h4>
          <p className="text-sm text-slate-500 font-ui">
            Enter celebrity name to begin image sourcing protocol
          </p>
        </motion.div>
      ) : (
        /* Active Job */
        <div className="space-y-6">
          {/* Overall Progress */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-cyber text-lg text-glow-pink">
                {currentJob.celebrity}
              </h4>
              <span className="text-2xl font-cyber font-bold text-blue-400">
                {currentJob.progress}%
              </span>
            </div>
            <div className="progress-bar mb-2">
              <motion.div 
                className="progress-fill"
                initial={{ width: 0 }}
                animate={{ width: `${currentJob.progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <p className="text-sm text-slate-400 font-ui">
              {currentJob.currentPhase}
            </p>
          </div>

          {/* Phase Breakdown */}
          <div className="space-y-3">
            <h5 className="font-cyber text-sm text-slate-300 mb-3">
              MISSION PHASES
            </h5>
            {phases.map((phase, index) => {
              const Icon = phase.icon;
              const phaseProgress = getPhaseProgress(index);
              const isActive = getCurrentPhaseIndex() === index;
              const isComplete = currentJob.progress > [10, 25, 40, 70, 90, 100][index];
              
              return (
                <motion.div 
                  key={phase.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`flex items-center gap-3 p-2 rounded ${
                    isActive ? 'bg-blue-900/30 border border-blue-500/30' : ''
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isComplete 
                      ? 'bg-green-500' 
                      : isActive 
                        ? 'bg-blue-500' 
                        : 'bg-slate-700'
                  }`}>
                    {isComplete ? (
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    ) : (
                      <Icon className={`w-5 h-5 ${
                        isActive ? 'text-white' : 'text-slate-400'
                      }`} />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-ui ${
                      isActive ? 'text-blue-300' : 'text-slate-400'
                    }`}>
                      {phase.name}
                    </p>
                    <div className="w-full bg-slate-700 h-1 rounded mt-1">
                      <motion.div 
                        className={`h-full rounded ${
                          isComplete 
                            ? 'bg-green-400' 
                            : 'bg-blue-400'
                        }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${phaseProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Stats */}
          {(currentJob.roles || currentJob.imagesProcessed) && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700">
              {currentJob.roles && (
                <div>
                  <h6 className="text-xs font-cyber text-slate-400 mb-2">
                    ROLES FOUND
                  </h6>
                  <div className="space-y-1">
                    {currentJob.roles.slice(0, 3).map((role, index) => (
                      <motion.div
                        key={role}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.1 }}
                        className="text-xs bg-blue-900/30 text-blue-200 px-2 py-1 rounded"
                      >
                        {role}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
              
              {currentJob.imagesProcessed && (
                <div>
                  <h6 className="text-xs font-cyber text-slate-400 mb-2">
                    IMAGE STATS
                  </h6>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <Image className="w-3 h-3 text-yellow-400" />
                      <span className="text-slate-300">
                        {currentJob.imagesProcessed} downloaded
                      </span>
                    </div>
                    {currentJob.imagesValidated && (
                      <div className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="w-3 h-3 text-green-400" />
                        <span className="text-slate-300">
                          {currentJob.imagesValidated} validated
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
