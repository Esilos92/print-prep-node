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
  Image,
  Activity,
  Star
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
    <div className="cyber-panel">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4 border-b border-blue-500/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-blue-400" />
          <h3 className="text-xl font-cyber font-bold text-glow-blue">
            MISSION STATUS
          </h3>
        </div>
        {currentJob && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Clock className="w-4 h-4" />
            <span className="font-cyber">{formatDuration(currentJob.startTime)}</span>
          </div>
        )}
      </div>

      {!currentJob ? (
        /* Idle State */
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-full"
          >
            <div className="w-32 h-32 bg-slate-800/50 rounded-full flex items-center justify-center mb-6">
              <Search className="w-16 h-16 text-slate-600" />
            </div>
            <h4 className="text-xl font-cyber text-slate-400 mb-3">
              AWAITING MISSION PARAMETERS
            </h4>
            <p className="text-sm text-slate-500 font-ui max-w-xs">
              Enter celebrity name in the terminal to begin image sourcing protocol
            </p>
          </motion.div>
        </div>
      ) : (
        /* Active Job */
        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
          {/* Overall Progress */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-cyber text-xl text-glow-pink">
                {currentJob.celebrity}
              </h4>
              <span className="text-3xl font-cyber font-bold text-blue-400">
                {currentJob.progress}%
              </span>
            </div>
            <div className="progress-bar mb-3 h-3">
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
            <h5 className="font-cyber text-sm text-slate-300 mb-4 tracking-wide">
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
                  className={`flex items-center gap-4 p-3 rounded-lg ${
                    isActive ? 'bg-blue-900/30 border border-blue-500/30' : ''
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 flex-shrink-0 ${
                    isComplete 
                      ? 'bg-green-500 border-green-400' 
                      : isActive 
                        ? 'bg-blue-500 border-blue-400' 
                        : 'bg-slate-700 border-slate-600'
                  }`}>
                    {isComplete ? (
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    ) : (
                      <Icon className={`w-5 h-5 ${
                        isActive ? 'text-white' : 'text-slate-400'
                      }`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-ui font-medium ${
                      isActive ? 'text-blue-300' : 'text-slate-400'
                    }`}>
                      {phase.name}
                    </p>
                    <div className="w-full bg-slate-700 h-2 rounded-full mt-2">
                      <motion.div 
                        className={`h-full rounded-full ${
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

          {/* Stats Section */}
          {(currentJob.roles || currentJob.imagesProcessed) && (
            <div className="grid grid-cols-1 gap-4 pt-4 border-t border-slate-700">
              {/* Roles Found */}
              {currentJob.roles && (
                <div>
                  <h6 className="text-xs font-cyber text-slate-400 mb-3 tracking-wide flex items-center gap-2">
                    <Star className="w-3 h-3" />
                    ROLES DISCOVERED
                  </h6>
                  <div className="space-y-2">
                    {currentJob.roles.slice(0, 3).map((role, index) => (
                      <motion.div
                        key={role}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center gap-3 bg-blue-900/30 text-blue-200 px-3 py-2 rounded-lg border border-blue-500/30"
                      >
                        <div className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0"></div>
                        <span className="text-sm font-ui">{role}</span>
                      </motion.div>
                    ))}
                    {currentJob.roles.length > 3 && (
                      <div className="text-xs text-slate-400 px-3 py-2 text-center">
                        +{currentJob.roles.length - 3} additional roles found
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Image Stats */}
              {currentJob.imagesProcessed && (
                <div>
                  <h6 className="text-xs font-cyber text-slate-400 mb-3 tracking-wide flex items-center gap-2">
                    <Image className="w-3 h-3" />
                    IMAGE PROCESSING
                  </h6>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-slate-800/50 px-3 py-2 rounded-lg">
                      <span className="text-sm text-slate-300 font-ui">Downloaded</span>
                      <span className="text-yellow-400 font-cyber text-sm font-bold">
                        {currentJob.imagesProcessed}
                      </span>
                    </div>
                    {currentJob.imagesValidated && (
                      <div className="flex items-center justify-between bg-slate-800/50 px-3 py-2 rounded-lg">
                        <span className="text-sm text-slate-300 font-ui">Validated</span>
                        <span className="text-green-400 font-cyber text-sm font-bold">
                          {currentJob.imagesValidated}
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
