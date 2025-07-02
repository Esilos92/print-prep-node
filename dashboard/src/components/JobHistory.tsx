import { motion } from 'framer-motion';
import { 
  Download, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  User,
  Calendar,
  ExternalLink
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
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      case 'running':
        return <Clock className="w-5 h-5 text-blue-400 animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
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
    <div className="cyber-panel p-6 h-[600px] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-cyber font-bold text-glow-blue">
          MISSION ARCHIVE
        </h3>
        <span className="text-sm text-slate-400 font-ui">
          {jobs.length} total missions
        </span>
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
        <div className="flex-1 overflow-y-auto space-y-3">
          {jobs.map((job, index) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 hover:border-blue-500/50 transition-colors"
            >
              {/* Job Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {getStatusIcon(job.status)}
                  <div>
                    <h4 className="font-cyber text-lg text-blue-300 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      {job.celebrity}
                    </h4>
                    <p className={`text-sm font-ui ${getStatusColor(job.status)}`}>
                      {job.status.toUpperCase()}
                    </p>
                  </div>
                </div>
                
                {job.status === 'completed' && job.downloadLink && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="cyber-button pink text-xs px-3 py-1 flex items-center gap-1"
                    onClick={() => window.open(job.downloadLink, '_blank')}
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </motion.button>
                )}
              </div>

              {/* Job Details */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                {/* Timeline */}
                <div>
                  <h5 className="text-slate-400 mb-1 font-cyber">TIMELINE</h5>
                  {job.startTime && (
                    <p className="text-slate-300 font-ui">
                      Started: {job.startTime.toLocaleTimeString()}
                    </p>
                  )}
                  {job.endTime && (
                    <p className="text-slate-300 font-ui">
                      Duration: {formatDuration(job.startTime, job.endTime)}
                    </p>
                  )}
                </div>

                {/* Stats */}
                <div>
                  <h5 className="text-slate-400 mb-1 font-cyber">RESULTS</h5>
                  {job.roles && (
                    <p className="text-slate-300 font-ui">
                      Roles: {job.roles.length}
                    </p>
                  )}
                  {job.imagesValidated && (
                    <p className="text-slate-300 font-ui">
                      Images: {job.imagesValidated} validated
                    </p>
                  )}
                </div>
              </div>

              {/* Roles Preview */}
              {job.roles && job.roles.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-700">
                  <h5 className="text-slate-400 text-xs mb-2 font-cyber">
                    DISCOVERED ROLES
                  </h5>
                  <div className="flex flex-wrap gap-1">
                    {job.roles.slice(0, 3).map((role) => (
                      <span
                        key={role}
                        className="text-xs bg-blue-900/30 text-blue-200 px-2 py-1 rounded"
                      >
                        {role}
                      </span>
                    ))}
                    {job.roles.length > 3 && (
                      <span className="text-xs text-slate-400 px-2 py-1">
                        +{job.roles.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Progress Bar for Running Jobs */}
              {job.status === 'running' && (
                <div className="mt-3 pt-3 border-t border-slate-700">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-400 font-cyber">
                      {job.currentPhase}
                    </span>
                    <span className="text-xs text-blue-400 font-cyber">
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
