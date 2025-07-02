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
      <div className="flex h-full">
        
        {/* Left Section - Header & Overall Progress */}
        <div className="w-72 flex flex-col border-r border-blue-500/30">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-blue-500/30 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-cyber font-bold text-glow-blue">
                MISSION STATUS
              </h3>
            </div>
          </div>

          {!currentJob ? (
            /* Idle State */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-3">
                <Search className="w-8 h-8 text-slate-600" />
              </div>
              <h4 className="text-sm font-cyber text-slate-400 mb-2">
                AWAITING MISSION
              </h4>
              <p className="text-xs text-slate-500 font-ui">
                Enter celebrity name to begin
              </p>
            </div>
          ) : (
            /* Active Job - Overall Progress */
            <div className="flex-1 p-4 flex flex-col justify-center">
              <div className="text-center mb-4">
                <h4 className="font-cyber text-lg text-glow-pink mb-2">
                  {currentJob.celebrity}
                </h4>
                <span className="text-2xl font-cyber font-bold text-blue-400">
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
              <p className="text-xs text-slate-400 font-ui text-center">
                {currentJob.currentPhase}
              </p>
              {currentJob.startTime && (
                <div className="flex items-center justify-center gap-2 text-xs text-slate-400 mt-2">
                  <Clock className="w-3 h-3" />
                  <span className="font-cyber">{formatDuration(currentJob.startTime)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Section - Phase Breakdown & Stats */}
        <div className="flex-1 flex flex-col">
          {currentJob ? (
            <>
              {/* Phase Breakdown */}
              <div className="flex-1 p-4 overflow-y-auto">
                <h5 className="font-cyber text-xs text-slate-300 mb-4 tracking-wide">
                  MISSION PHASES
                </h5>
                <div className="grid grid-cols-6 gap-3">
                  {phases.map((phase, index) => {
                    const Icon = phase.icon;
                    const phaseProgress = getPhaseProgress(index);
                    const isActive = getCurrentPhaseIndex() === index;
                    const isComplete = currentJob.progress > [10, 25, 40, 70, 90, 100][index];
                    
                    return (
                      <motion.div 
                        key={phase.name}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.2 }}
                        className={`flex flex-col items-center gap-2 p-3 rounded-lg border ${
                          isActive 
                            ? 'bg-blue-900/30 border-blue-500' 
                            : isComplete 
                              ? 'bg-green-900/20 border-green-500/50'
                              : 'bg-slate-800/30 border-slate-600'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
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
                        <div className="text-center">
                          <p className={`text-xs font-ui font-medium text-center leading-tight ${
                            isActive ? 'text-blue-300' : isComplete ? 'text-green-300' : 'text-slate-400'
                          }`}>
                            {phase.name}
                          </p>
                          <div className="w-full bg-slate-700 h-1 rounded-full mt-2">
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
              </div>

              {/* Stats Section */}
              {(currentJob.roles || currentJob.imagesProcessed) && (
                <div className="p-4 border-t border-slate-700 flex-shrink-0">
                  <div className="flex gap-6">
                    {/* Roles Found */}
                    {currentJob.roles && (
                      <div className="flex-1">
                        <h6 className="text-xs font-cyber text-slate-400 mb-2 tracking-wide flex items-center gap-1">
                          <Star className="w-3 h-3" />
                          ROLES ({currentJob.roles.length})
                        </h6>
                        <div className="flex flex-wrap gap-1">
                          {currentJob.roles.slice(0, 3).map((role, index) => (
                            <motion.span
                              key={role}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: index * 0.1 }}
                              className="text-xs bg-blue-900/30 text-blue-200 px-2 py-1 rounded border border-blue-500/30 font-ui"
                            >
                              {role}
                            </motion.span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Image Stats */}
                    {currentJob.imagesProcessed && (
                      <div className="flex-1">
                        <h6 className="text-xs font-cyber text-slate-400 mb-2 tracking-wide flex items-center gap-1">
                          <Image className="w-3 h-3" />
                          IMAGES
                        </h6>
                        <div className="flex gap-4">
                          <div className="text-center">
                            <div className="text-yellow-400 font-cyber text-sm font-bold">
                              {currentJob.imagesProcessed}
                            </div>
                            <div className="text-xs text-slate-300 font-ui">Downloaded</div>
                          </div>
                          {currentJob.imagesValidated && (
                            <div className="text-center">
                              <div className="text-green-400 font-cyber text-sm font-bold">
                                {currentJob.imagesValidated}
                              </div>
                              <div className="text-xs text-slate-300 font-ui">Validated</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 font-ui text-sm">
              Mission details will appear here when active
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
