import { motion } from 'framer-motion';
import { 
  Search, 
  Brain, 
  Target, 
  Download, 
  Zap, 
  Archive,
  Clock,
  CheckCircle2,
  Activity
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

  // ANTI-FLICKER: PhaseItem with stable keys and conditional rendering
  const PhaseItem = ({ phase, index }: { phase: any; index: number }) => {
    const Icon = phase.icon;
    const isActive = isPhaseActive(index);
    const isComplete = isPhaseComplete(index);
    const currentPhaseIndex = getCurrentPhaseIndex();
    const isCurrent = currentPhaseIndex === index;

    // ANTI-FLICKER: Always render the container, just control visibility
    return (
      <motion.div
        key={`phase-${index}`} // Stable key prevents re-mounting
        initial={false} // ANTI-FLICKER: Don't re-animate on every render
        animate={{ 
          opacity: isActive ? 1 : 0,
          height: isActive ? 'auto' : 0,
          marginBottom: isActive ? '16px' : '0px'
        }}
        transition={{ 
          duration: 0.3, 
          ease: 'easeInOut',
          opacity: { duration: 0.2 } // Faster opacity transition
        }}
        style={{ 
          display: 'flex', 
          alignItems: 'center',
          overflow: 'hidden' // Prevent layout shift during height animation
        }}
      >
        {/* ANTI-FLICKER: Stable icon rendering with layout preservation */}
        <span style={{ marginRight: '8px', minWidth: '20px', display: 'flex', justifyContent: 'center' }}>
          {isComplete ? (
            <CheckCircle2 className="w-4 h-4 text-white" />
          ) : isCurrent ? (
            <motion.div
              animate={{ 
                color: ['#ffffff', '#60a5fa', '#ffffff'] // white -> blue -> white
              }}
              transition={{ 
                repeat: Infinity, 
                duration: 2, 
                ease: 'easeInOut'
              }}
            >
              <Icon className="w-4 h-4" />
            </motion.div>
          ) : (
            <Icon className="w-4 h-4 text-slate-600" />
          )}
        </span>
        
        <span className={`text-sm font-ui transition-colors duration-200 ${
          isComplete ? 'text-white' : isCurrent ? 'text-blue-300' : 'text-slate-400'
        }`}>
          {phase.name}
        </span>
      </motion.div>
    );
  };

  const cleanRoles = getCleanRoles(currentJob?.roles, currentJob?.celebrity);

  return (
    <div className="cyber-panel">
      <div style={{ padding: '12px' }}>
        
        {/* ROW 1 - Header Section */}
        <div className="mb-6">
          {/* Mission Status Header */}
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-cyber font-bold text-glow-blue">
              MISSION STATUS
            </h3>
          </div>

          {!currentJob ? (
            /* Idle State */
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-3">
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
            <>
              {/* Two Column Layout */}
              <div style={{ display: 'flex', flexDirection: 'row', gap: '32px' }}>
                
                {/* Column 1 - Celebrity Info */}
                <div style={{ flex: 1, paddingRight: '16px', borderRight: '1px solid rgba(37, 99, 235, 0.3)' }}>
                  {/* Celebrity Name */}
                  <h4 className="font-cyber text-xl text-glow-pink mb-4 text-center">
                    {currentJob.celebrity}
                  </h4>

                  {/* Clean roles beneath celebrity name */}
                  {cleanRoles.length > 0 && (
                    <div className="text-center mb-4">
                      <span className="text-sm text-blue-200 font-ui">
                        {cleanRoles.slice(0, 3).join(', ')}
                      </span>
                      {cleanRoles.length > 3 && (
                        <span className="text-xs text-slate-400 font-ui block mt-1">
                          +{cleanRoles.length - 3} more roles
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Column 2 - Image Stats */}
                {(currentJob.imagesProcessed || currentJob.imagesValidated) && (
                  <div style={{ flex: 1, paddingLeft: '16px' }}>
                    <h6 className="font-cyber text-xl text-glow-blue mb-4 tracking-wide">
                      IMAGES
                    </h6>
                    <div className="text-center">
                      <div className="text-2xl font-cyber font-bold text-blue-300">
                        {currentJob.imagesProcessed || 0} Downloaded
                        {currentJob.imagesValidated && (
                          <> / {currentJob.imagesValidated} Validated</>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Line Break between Mission Status row and Progress row */}
              <br />

              {/* FIXED: Progress Bar Row with time and percentage on same line */}
              <div className="mt-4 mb-2">
                {/* FIXED: Time | Percentage on same line */}
                <div className="flex items-center gap-3 mb-2">
                  {currentJob.startTime && (
                    <>
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span className="font-cyber text-base text-slate-400">{formatDuration(currentJob.startTime)}</span>
                      <span className="text-slate-500">|</span>
                    </>
                  )}
                  <span className="text-2xl font-cyber font-bold text-blue-400">
                    {currentJob.progress}%
                  </span>
                </div>
                
                {/* Progress bar */}
                <div className="progress-bar h-4">
                  <motion.div 
                    className="progress-fill"
                    animate={{ width: `${currentJob.progress}%` }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  />
                </div>
                
                <p className="text-xs text-slate-400 font-ui text-center mt-2">
                  {currentJob.currentPhase}
                </p>
              </div>
            </>
          )}

          {/* Line Break between progress bar and mission phases */}
          {currentJob && <br />}
        </div>

        {/* ANTI-FLICKER: Mission Phases with stable rendering */}
        {currentJob && (
          <div className="border-t border-slate-700 pt-4">
            <h5 className="font-cyber text-sm text-slate-300 mb-4 tracking-wide">
              MISSION PHASES
            </h5>
            
            <div style={{ display: 'flex', flexDirection: 'row', height: '100%' }}>
              
              {/* Column 1 - 33.33% */}
              <div style={{ 
                width: '33.33%', 
                paddingRight: '16px', 
                borderRight: '1px solid rgba(37, 99, 235, 0.3)',
                minHeight: '120px' // ANTI-FLICKER: Reserve space to prevent layout shift
              }}>
                <br />
                <PhaseItem phase={phases[0]} index={0} />
                <PhaseItem phase={phases[1]} index={1} />
              </div>

              {/* Column 2 - 33.33% */}
              <div style={{ 
                width: '33.33%', 
                paddingLeft: '16px', 
                paddingRight: '16px', 
                borderRight: '1px solid rgba(37, 99, 235, 0.3)',
                minHeight: '120px' // ANTI-FLICKER: Reserve space
              }}>
                <br />
                <PhaseItem phase={phases[2]} index={2} />
                <PhaseItem phase={phases[3]} index={3} />
              </div>

              {/* Column 3 - 33.33% */}
              <div style={{ 
                width: '33.33%', 
                paddingLeft: '16px',
                minHeight: '120px' // ANTI-FLICKER: Reserve space
              }}>
                <br />
                <PhaseItem phase={phases[4]} index={4} />
                <PhaseItem phase={phases[5]} index={5} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
