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

export default function ProgressDisplay({ currentJob }: ProgressDisplayProps) {
  // Mission phases in order
  const phases = [
    { id: 'filmography_scan', name: 'Filmography Scan', icon: Target },
    { id: 'performance_analysis', name: 'Performance Analysis', icon: Brain },
    { id: 'search_protocol', name: 'Search Protocol', icon: Search },
    { id: 'image_download', name: 'Image Download', icon: Download },
    { id: 'ai_validation', name: 'AI Validation', icon: Zap },
    { id: 'file_compilation', name: 'File Compilation', icon: Archive }
  ];

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

  // Get phases that should be visible (completed + current)
  const getVisiblePhases = () => {
    if (!currentJob || currentJob.status === 'idle') return [];
    
    const currentPhaseIndex = phases.findIndex(p => p.id === currentJob.currentPhase);
    if (currentPhaseIndex === -1) return [];
    
    // Show all phases up to and including current
    return phases.slice(0, currentPhaseIndex + 1);
  };

  const getPhaseStatus = (phaseId: string) => {
    if (!currentJob) return 'pending';
    
    const currentPhaseIndex = phases.findIndex(p => p.id === currentJob.currentPhase);
    const thisPhaseIndex = phases.findIndex(p => p.id === phaseId);
    
    if (currentJob.status === 'completed') return 'completed';
    if (currentJob.status === 'error') {
      return thisPhaseIndex <= currentPhaseIndex ? 'error' : 'pending';
    }
    if (thisPhaseIndex < currentPhaseIndex) return 'completed';
    if (thisPhaseIndex === currentPhaseIndex) return 'active';
    return 'pending';
  };

  // Calculate cumulative validation progress (doesn't reset)
  const getValidationProgress = () => {
    if (!currentJob || !currentJob.imagesValidated) return 0;
    
    // If we have a target number of images, calculate percentage
    if (currentJob.imagesProcessed && currentJob.imagesProcessed > 0) {
      return Math.min((currentJob.imagesValidated / currentJob.imagesProcessed) * 100, 100);
    }
    
    // Otherwise, show progress based on validation count
    return Math.min(currentJob.imagesValidated * 10, 100); // Assume 10 images = 100%
  };

  const cleanRoles = getCleanRoles(currentJob?.roles, currentJob?.celebrity);
  const visiblePhases = getVisiblePhases();

  return (
    <div className="cyber-panel">
      {/* Matching GBotInterface padding pattern: consistent 12px all around */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', height: '100%' }}>
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Target className="w-6 h-6 text-blue-400" />
          <h3 className="font-cyber text-2xl font-bold text-glow-blue">MISSION CONTROL</h3>
        </div>

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

        {/* Mission Progress */}
        <div className="mb-6">
          <h4 className="text-base font-cyber text-slate-300 mb-3 tracking-wide">MISSION PROGRESS</h4>
          
          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-ui text-slate-300">
                {currentJob?.status === 'running' ? 'Processing...' : 
                 currentJob?.status === 'completed' ? 'Mission Complete' :
                 currentJob?.status === 'error' ? 'Mission Failed' : 'Standby'}
              </span>
              <span className="text-sm font-cyber text-blue-300">
                {currentJob ? `${Math.round(currentJob.progress || 0)}%` : '0%'}
              </span>
            </div>
            
            <div className="w-full bg-slate-800/50 rounded-full h-3 border border-slate-600/50">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                initial={{ width: 0 }}
                animate={{ width: `${currentJob?.progress || 0}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
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

        {/* Mission Phases - Dynamic appearance */}
        {visiblePhases.length > 0 && (
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
