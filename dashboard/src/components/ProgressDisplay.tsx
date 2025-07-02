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
        {/* Checkmark to the left of phase name */}
        {isComplete && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, type: "spring" }}
            style={{ marginRight: '8px' }}
          >
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          </motion.span>
        )}
        
        <span className={`text-sm font-ui ${
          isComplete ? 'text-green-300' : isCurrent ? 'text-blue-300' : 'text-slate-400'
        }`}>
          {phase.name}
        </span>
      </motion.div>
    );
  };

  return (
    <div className="cyber-panel">
      <div className="p-6">
        
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

                  {/* Roles beneath celebrity name */}
                  {currentJob.roles && (
                    <div className="text-center mb-4">
                      <span className="text-sm text-blue-200 font-ui">
                        {currentJob.roles.slice(0, 3).join(', ')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Column 2 - Image Stats */}
                {currentJob.imagesProcessed && (
                  <div style={{ flex: 1, paddingLeft: '16px' }}>
                    <h6 className="text-sm font-cyber text-slate-400 mb-4 tracking-wide flex items-center gap-1">
                      <Image className="w-4 h-4" />
                      IMAGES
                    </h6>
                    <br />
                    <div className="flex gap-8">
                      <div className="text-center">
                        <div className="text-yellow-400 font-cyber text-2xl font-bold">
                          {currentJob.imagesProcessed}
                        </div>
                        <div className="text-sm text-slate-300 font-ui">Downloaded</div>
                      </div>
                      {currentJob.imagesValidated && (
                        <div className="text-center">
                          <div className="text-green-400 font-cyber text-2xl font-bold">
                            {currentJob.imagesValidated}
                          </div>
                          <div className="text-sm text-slate-300 font-ui">Validated</div>
                        </div>
                      )}
                    </div>
                    <br />
                  </div>
                )}
              </div>

              {/* Progress Bar Row - Full Width */}
              <div className="mt-6 mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-2xl font-cyber font-bold text-blue-400">
                    {currentJob.progress}%
                  </span>
                  {currentJob.startTime && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span className="font-cyber">{formatDuration(currentJob.startTime)}</span>
                    </div>
                  )}
                </div>
                <div className="progress-bar h-4">
                  <motion.div 
                    className="progress-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${currentJob.progress}%` }}
                    transition={{ duration: 0.5 }}
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

        {/* BENEATH THE ROW - Mission Phases in 3 Columns */}
        {currentJob && (
          <div className="border-t border-slate-700 pt-6">
            <h5 className="font-cyber text-sm text-slate-300 mb-6 tracking-wide">
              MISSION PHASES
            </h5>
            
            <div style={{ display: 'flex', flexDirection: 'row', height: '100%' }}>
              
              {/* Column 1 - 33.33% */}
              <div style={{ width: '33.33%', paddingRight: '16px', borderRight: '1px solid rgba(37, 99, 235, 0.3)' }}>
                <PhaseItem phase={phases[0]} index={0} />
                <PhaseItem phase={phases[1]} index={1} />
              </div>

              {/* Column 2 - 33.33% */}
              <div style={{ width: '33.33%', paddingLeft: '16px', paddingRight: '16px', borderRight: '1px solid rgba(37, 99, 235, 0.3)' }}>
                <PhaseItem phase={phases[2]} index={2} />
                <PhaseItem phase={phases[3]} index={3} />
              </div>

              {/* Column 3 - 33.33% */}
              <div style={{ width: '33.33%', paddingLeft: '16px' }}>
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
