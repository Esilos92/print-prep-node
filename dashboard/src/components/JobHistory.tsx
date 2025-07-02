import { motion } from 'framer-motion';
import { 
  Download, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  User,
  Calendar,
  FileArchive,
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
  downloadLink?: string;
  startTime?: Date;
  endTime?: Date;
}

interface JobHistoryProps {
  jobs: JobStatus[];
}

export default function JobHistory({ jobs }: JobHistoryProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'running':
        return <Clock className="w-4 h-4 text-blue-400 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      case 'running':
        return 'text-blue-400';
      default:
        return 'text-slate-400';
    }
  };

  const formatDuration = (start?: Date, end?: Date) => {
    if (!start || !end) return 'Unknown';
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  return (
    <div className="cyber-panel p-6 h-[650px] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-blue-500/30">
        <div className="flex items-center gap-3">
          <FileArchive className="w-6 h-6 text-blue-400" />
          <h3 className="text-xl font-cyber font-bold text-glow-blue">
            MISSION ARCHIVE
          </h3>
        </div>
        <div className="text-right">
          <span className="text-sm text-slate-400 font-ui block">
            {jobs.length} total missions
          </span>
          <span className="text-xs text-slate-500 font-ui">
            {jobs.filter(j => j.status === 'completed').length} completed
          </span>
        </div>
      </div>

      {jobs.length === 0 ? (
        /* Empty State */
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center h-full text-center"
        >
          <div className="w-24 h-24 bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
            <Calendar className="w-12 h-12 text-slate-600" />
          </div>
          <h4 className="text-lg font-cyber text-slate-400 mb-2">
            NO MISSIONS LOGGED
          </h4>
          <p className="text-sm text-slate-500 font-ui">
            Completed missions will appear here
          </p>
        </motion.div>
      ) : (
        /* Job List */
        <div className="flex-1 overflow-y-auto space-y-4">
          {jobs.map((job, index) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 hover:border-blue-500/50 transition-all duration-300 hover:bg-slate-800/50"
            >
              {/* Job Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getStatusIcon(job.status)}
                  <div>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-blue-300" />
                      <h4 className="font-cyber text-lg text-blue-300">
                        {job.celebrity}
                      </h4>
                    </div>
                    <p className={`text-sm font-ui ${getStatusColor(job.status)}`}>
                      {job.status.toUpperCase()}
                    </p>
                  </div>
                </div>
                
                {job.status === 'completed' && job.downloadLink && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="cyber-button pink text-sm px-4 py-2 flex items-center gap-2 min-w-fit"
                    onClick={() => window.open(job.downloadLink, '_blank')}
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">Download</span>
                  </motion.button>
                )}
              </div>

              {/* Job Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {/* Timeline */}
                <div className="space-y-2">
                  <h5 className="text-slate-400 text-xs font-cyber tracking-wide">TIMELINE</h5>
                  <div className="space-y-1">
                    {job.startTime && (
                      <div className="flex items-center gap-2 text-xs">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span className="text-slate-300 font-ui">
                          {job.startTime.toLocaleTimeString()}
                        </span>
                      </div>
                    )}
                    {job.endTime && (
                      <div className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                        <span className="text-slate-300 font-ui">
                          {formatDuration(job.startTime, job.endTime)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-2">
                  <h5 className="text-slate-400 text-xs font-cyber tracking-wide">RESULTS</h5>
                  <div className="space-y-1">
                    {job.roles && (
                      <div className="flex items-center gap-2 text-xs">
                        <Star className="w-3 h-3 text-yellow-500" />
                        <span className="text-slate-300 font-ui">
                          {job.roles.length} roles found
                        </span>
                      </div>
                    )}
                    {job.imagesValidated && (
                      <div className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                        <span className="text-slate-300 font-ui">
                          {job.imagesValidated} images validated
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Discovered Roles */}
              {job.roles && job.roles.length > 0 && (
                <div className="pt-3 border-t border-slate-700">
                  <h5 className="text-slate-400 text-xs mb-3 font-cyber tracking-wide">
                    DISCOVERED ROLES
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {job.roles.slice(0, 4).map((role, roleIndex) => (
                      <motion.span
                        key={role}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: roleIndex * 0.1 }}
                        className="text-xs bg-blue-900/40 text-blue-200 px-3 py-1.5 rounded-full border border-blue-500/30 font-ui"
                      >
                        {role}
                      </motion.span>
                    ))}
                    {job.roles.length > 4 && (
                      <span className="text-xs text-slate-400 px-3 py-1.5 font-ui">
                        +{job.roles.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Progress Bar for Running Jobs */}
              {job.status === 'running' && (
                <div className="mt-4 pt-3 border-t border-slate-700">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400 font-cyber">
                      {job.currentPhase}
                    </span>
                    <span className="text-sm text-blue-400 font-cyber font-bold">
                      {job.progress}%
                    </span>
                  </div>
                  <div className="progress-bar h-2">
                    <motion.div 
                      className="progress-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${job.progress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
