import { useEffect, useState } from 'react';
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
  { icon: Zap, name: 'AI Validation', color: 'text-orange-400' },
  { icon: Archive, name: 'File Compilation', color: 'text-pink-400' }
];

export default function ProgressDisplay({ currentJob }: ProgressDisplayProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'error') return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [currentJob?.status]);

  const getCleanRoles = (roles?: string[], celebrityName?: string) => {
    if (!roles || !celebrityName) return [];
    return roles
      .map(role => {
        const cleanRole = role.replace(new RegExp(`${celebrityName}\\s*\\(([^)]+)\\)`, 'gi'), '$1').trim();
        return cleanRole.replace(new RegExp(`\\(${celebrityName}\\)`, 'gi'), '').trim();
      })
      .filter(role => role.length > 0)
      .slice(0, 5);
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

    return (
      <motion.div
        key={`phase-${index}`}
        initial={false}
        animate={{
          opacity: isActive ? 1 : 0,
          height: isActive ? 'auto' : 0,
          marginBottom: isActive ? '16px' : '0px'
        }}
        transition={{
          duration: 0.3,
          ease: 'easeInOut',
          opacity: { duration: 0.2 }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden'
        }}
      >
        <span style={{ marginRight: '8px', minWidth: '20px', display: 'flex', justifyContent: 'center' }}>
          {isComplete ? (
            <CheckCircle2 className="w-4 h-4 text-white" />
          ) : isCurrent ? (
            <motion.div
              animate={{ color: ['#ffffff', '#60a5fa', '#ffffff'] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
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
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-cyber font-bold text-glow-blue">
              MISSION STATUS
            </h3>
          </div>

          {!currentJob ? (
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
              <div style={{ display: 'flex', flexDirection: 'row', gap: '32px' }}>
                <div style={{ flex: 1, paddingRight: '16px', borderRight: '1px solid rgba(37, 99, 235, 0.3)' }}>
                  <h4 className="font-cyber text-xl text-glow-pink mb-4 text-center">
                    {currentJob.celebrity}
                  </h4>

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

              <br />

              {/* Final fixed timer + percentage row */}
              <div className="mt-4 mb-2 text-sm font-cyber text-slate-400">
                <div className="flex items-center mb-2">
                  {currentJob.startTime && (
                    <div className="flex items-center min-w-[100px] gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{formatDuration(currentJob.startTime)}</span>
                    </div>
                  )}
                  <span className="text-slate-600 px-2">|</span>
                  <div className="text-blue-400 font-bold tabular-nums min-w-[40px] text-right">
                    {currentJob.progress}%
                  </div>
                </div>

                <div className="progress-bar h-4">
                  <motion.div
                    className="progress-fill"
                    animate={{ width: `${currentJob.progress}%` }}
                    transition={{ duration: 0.8, ease: 'easeInOut' }}
                  />
                </div>

                <p className="text-xs text-slate-400 font-ui text-center mt-2">
                  {currentJob.currentPhase}
                </p>
              </div>
            </>
          )}

          {currentJob && <br />}
        </div>

        {currentJob && (
          <div className="border-t border-slate-700 pt-4">
            <h5 className="font-cyber text-sm text-slate-300 mb-4 tracking-wide">
              MISSION PHASES
            </h5>

            <div style={{ display: 'flex', flexDirection: 'row', height: '100%' }}>
              <div style={{
                width: '33.33%',
                paddingRight: '16px',
                borderRight: '1px solid rgba(37, 99, 235, 0.3)',
                minHeight: '120px'
              }}>
                <br />
                <PhaseItem phase={phases[0]} index={0} />
                <PhaseItem phase={phases[1]} index={1} />
              </div>

              <div style={{
                width: '33.33%',
                paddingLeft: '16px',
                paddingRight: '16px',
                borderRight: '1px solid rgba(37, 99, 235, 0.3)',
                minHeight: '120px'
              }}>
                <br />
                <PhaseItem phase={phases[2]} index={2} />
                <PhaseItem phase={phases[3]} index={3} />
              </div>

              <div style={{
                width: '33.33%',
                paddingLeft: '16px',
                minHeight: '120px'
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
