import { motion } from 'framer-motion';
import { 
  Target, 
  Search, 
  Download, 
  Brain, 
  Archive, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Zap,
  Star
} from 'lucide-react';

interface JobStatus {
  id: string;
  celebrity: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentPhase: string;
  progress: number;
  roles?: string[]; // Clean role names from backend
  imagesProcessed?: number;
  imagesValidated?: number;
  startTime?: Date;
  endTime?: Date;
}

interface ProgressDisplayProps {
  currentJob: JobStatus | null;
}

const phases = [
  { icon: Search, name: 'Filmography Scan', color: 'text-blue-400' },
  { icon: Brain, name: 'Performance Analysis', color: 'text-purple-400' },
  { icon: Target, name: 'Search Protocol', color: 'text-green-400' },
  { icon: Download, name: 'Image Download', color: 'text-yellow-400' },
  { icon: Zap, name: 'AI Validation', color: 'text-orange-400' },
  { icon: Archive, name: 'File Compilation', color: 'text-pink-400' }
];

export default function ProgressDisplay({ currentJob }: ProgressDisplayProps) {
  // Clean roles - remove celebrity name from role descriptions
  const getCleanRoles = (roles?: string[], celebrityName?: string) => {
    if (!roles || !celebrityName) return [];
    
    return roles
      .map(role => {
        // Remove celebrity name from role (case insensitive)
        const cleanRole = role.replace(new RegExp(`${celebrityName}\\s*\\(([^)]+)\\)`, 'gi'), '$1').trim();
        // Remove any remaining parentheses with celebrity name
        return cleanRole.replace(new RegExp(`\\(${celebrityName}\\)`, 'gi'), '').trim();
      })
      .filter(role => role.length > 0)
      .slice(0, 5); // Limit to maximum 5 roles
  };

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

  const isPhaseActive = (phaseIndex: number) => {
    if (!currentJob) return false;
    const currentPhaseIndex = getCurrentPhaseIndex();
    return phaseIndex <= currentPhaseIndex;
  };

  const isPhaseComplete = (phaseIndex: number) => {
    if (!currentJob) return false;
    const thresholds = [10, 25, 40, 70, 90, 100];
    return currentJob.progress > thresholds[phaseIndex];
  };

  const formatDuration = (startTime?: Date) => {
    if (!startTime) return '0s';
    const duration = Math.floor((Date.now() - startTime.getTime()) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  // Smart phase item with selective animation
  const PhaseItem = ({ phase, index }: { phase: any; index: number }) => {
    const Icon = phase.icon;
    const isActive = isPhaseActive(index);
    const isComplete = isPhaseComplete(index);
    const currentPhaseIndex = getCurrentPhaseIndex();
    const isCurrent = currentPhaseIndex === index;

    if (!isActive) return null; // Only show phases that are active

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.2 }}
        style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}
      >
        {/* Conditional animation - only current phase pulses */}
        {isComplete ? (
          // Completed phases: static checkmark, no animation
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, type: "spring" }}
            style={{ marginRight: '8px' }}
          >
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          </motion.span>
        ) : isCurrent ? (
          // Current phase: pulsing animation
          <motion.span
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            style={{ marginRight: '8px' }}
          >
            <Icon className="w-4 h-4 text-blue-400" />
          </motion.span>
        ) : (
          // Future phases: static icon
          <span style={{ marginRight: '8px' }}>
            <Icon className="w-4 h-4 text-slate-600" />
          </span>
        )}
        
        <span className={`text-sm font-ui ${
          isComplete ? 'text-green-300' : isCurrent ? 'text-blue-300' : 'text-slate-400'
        }`}>
          {phase.name}
        </span>
      </motion.div>
    );
  };

  const cleanRoles = getCleanRoles(currentJob?.roles, currentJob?.celebrity);

  return (
    <div className="cyber-panel">
      {/* Matching GBotInterface padding pattern: consistent 12px all around */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', height: '100%' }}>
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Target className="w-6 h-6 text-blue-400" />
          <h3 className="font-cyber text-2xl font-bold text-glow-blue">PROGRESS DISPLAY</h3>
        </div>

        <br />

        {/* Current Subject */}
        <div className="mb-6">
          <h4 className="text-base font-cyber text-slate-300 mb-3 tracking-wide">CURRENT SUBJECT</h4>
          <div className="font-cyber text-xl text-glow-pink">
            {currentJob ? currentJob.celebrity : 'No Active Mission'}
          </div>
          
          {/* Clean Roles Display - Limited to 5 */}
          {cleanRoles.length > 0 && (
            <div className="mt-2">
              <span className="text-sm text-slate-400">Roles: </span>
              <span className="text-sm text-blue-300">
                {cleanRoles.join(', ')}
              </span>
            </div>
          )}
        </div>

        {/* Mission Progress - Only show when there's an active job */}
        {currentJob && (
          <div className="mb-6">
            <h4 className="text-base font-cyber text-slate-300 mb-3 tracking-wide">MISSION STATUS</h4>
            
            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-ui text-slate-300">
                  {currentJob?.status === 'running' ? 'Processing...' : 
                   currentJob?.status === 'completed' ? 'Mission Complete' :
                   currentJob?.status === 'error' ? 'Mission Failed' : 'Standby'}
                </span>
                <span className="text-sm font-cyber text-blue-300">
                  {currentJob ? `${Math.round(currentJob.progress || 0)}%` : '0% '}
                </span>
              </div>
              
              <div className="w-full bg-slate-800/50 rounded-full h-3 border border-slate-600/50 relative">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${currentJob?.progress || 0}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
                {/* Progress percentage positioned above the end of the bar */}
                {currentJob?.status === 'running' && (
                  <div 
                    className="absolute -top-6 text-xs font-cyber text-blue-300"
                    style={{ left: `${Math.max(currentJob.progress || 0, 10)}%`, transform: 'translateX(-50%)' }}
                  >
                    {Math.round(currentJob.progress || 0)}%
                  </div>
                )}
              </div>
            </div>

            {/* Validation Progress - Cumulative */}
            {currentJob?.currentPhase === 'ai_validation' && currentJob.imagesValidated && (
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-ui text-slate-300">AI Validation Progress</span>
                  <span className="text-sm font-cyber text-green-300">
                    {currentJob.imagesValidated} validated
                  </span>
                </div>
                
                <div className="w-full bg-slate-800/50 rounded-full h-2 border border-slate-600/50">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${getValidationProgress()}%` }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mission Phases - Dynamic appearance - Only show when there's an active job */}
        {currentJob && (
          <div>
            <h4 className="text-base font-cyber text-slate-300 mb-3 tracking-wide">MISSION PHASES</h4>
            
            <div className="space-y-3">
              {visiblePhases.map((phase, index) => {
                const status = getPhaseStatus(phase.id);
                const IconComponent = phase.icon;
                
                return (
                  <motion.div
                    key={phase.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className={`p-4 rounded-lg border transition-all duration-300 ${
                      status === 'completed' 
                        ? 'text-green-300 border-green-500/50 bg-green-900/20'
                        : status === 'active'
                        ? 'text-blue-300 border-blue-500/50 bg-blue-900/20'
                        : status === 'error'
                        ? 'text-red-300 border-red-500/50 bg-red-900/20'
                        : 'text-slate-400 border-slate-600/50 bg-slate-800/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        {status === 'completed' ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : status === 'error' ? (
                          <AlertCircle className="w-5 h-5" />
                        ) : (
                          <IconComponent className="w-5 h-5" />
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <div className="font-cyber text-base">{phase.name}</div>
                        {status === 'active' && (
                          <motion.div 
                            className="text-sm mt-1"
                            animate={{ 
                              color: ['#ffffff', '#3b82f6', '#ffffff'] 
                            }}
                            transition={{ 
                              repeat: Infinity, 
                              duration: 1.5,
                              ease: "easeInOut"
                            }}
                          >
                            In Progress...
                          </motion.div>
                        )}
                        {status === 'completed' && (
                          <div className="text-sm text-green-400 mt-1">
                            Complete
                          </div>
                        )}
                        {status === 'error' && (
                          <div className="text-sm text-red-400 mt-1">
                            Failed
                          </div>
                        )}
                      </div>
                      
                      {/* Phase number */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                        ${status === 'completed' ? 'bg-green-500 text-white' :
                          status === 'active' ? 'bg-blue-500 text-white' :
                          status === 'error' ? 'bg-red-500 text-white' :
                          'bg-slate-600 text-slate-300'}`}>
                        {index + 1}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
