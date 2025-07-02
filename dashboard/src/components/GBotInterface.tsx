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
    <div className="cyber-panel">
      <div className="flex h-full">
        
        {/* Left Section - Header & Summary */}
        <div className="w-72 flex flex-col border-r border-blue-500/30">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-blue-500/30 flex-shrink-0">
            <div className="flex items-center gap-2">
              <FileArchive className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-cyber font-bold text-glow-blue">
                MISSION ARCHIVE
              </h3>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="flex-1 flex flex-col justify-center p-4">
            <div className="text-center space-y-3">
              <div>
                <div className="text-2xl font-cyber font-bold text-blue-400">
                  {jobs.length}
                </div>
                <div className="text-xs text-slate-400 font-ui">Total Missions</div>
              </div>
              <div>
                <div className="text-xl font-cyber font-bold text-green-400">
                  {jobs.filter(j => j.status === 'completed').length}
                </div>
                <div className="text-xs text-slate-400 font-ui">Completed</div>
              </div>
              {jobs.length === 0 && (
                <div className="mt-4">
                  <div className="w-12 h-12 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Calendar className="w-6 h-6 text-slate-600" />
                  </div>
                  <p className="text-xs text-slate-500 font-ui">
                    No missions logged
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Section - Job List */}
        <div className="flex-1 flex flex-col">
          {jobs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 font-ui text-sm">
              Completed missions will appear here
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {jobs.map((job, index) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-slate-800/30 border border-slate-700 rounded-lg p-3 hover:border-blue-500/50 transition-all duration-300 hover:bg-slate-800/50"
                  >
                    {/* Job Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {getStatusIcon(job.status)}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <User className="w-3 h-3 text-blue-300 flex-shrink-0" />
                            <h4 className="font-cyber text-sm text-blue-300 truncate">
                              {job.celebrity}
                            </h4>
                          </div>
                          <p className={`text-xs font-ui ${getStatusColor(job.status)}`}>
                            {job.status.toUpperCase()}
                          </p>
                        </div>
                      </div>
                      
                      {job.status === 'completed' && job.downloadLink && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="cyber-button pink text-xs px-3 py-1 flex items-center gap-1 flex-shrink-0"
                          onClick={() => window.open(job.downloadLink, '_blank')}
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </motion.button>
                      )}
                    </div>

                    {/* Job Details */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {/* Timeline */}
                      <div>
                        <h5 className="text-slate-400 text-xs font-cyber tracking-wide mb-1">TIMELINE</h5>
                        <div className="space-y-1">
                          {job.startTime && (
                            <div className="flex items-center gap-1 text-xs">
                              <Clock className="w-2 h-2 text-slate-500 flex-shrink-0" />
                              <span className="text-slate-300 font-ui text-xs">
                                {job.startTime.toLocaleTimeString()}
                              </span>
                            </div>
                          )}
                          {job.endTime && (
                            <div className="flex items-center gap-1 text-xs">
                              <CheckCircle2 className="w-2 h-2 text-green-500 flex-shrink-0" />
                              <span className="text-slate-300 font-ui text-xs">
                                {formatDuration(job.startTime, job.endTime)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Stats */}
                      <div>
                        <h5 className="text-slate-400 text-xs font-cyber tracking-wide mb-1">RESULTS</h5>
                        <div className="space-y-1">
                          {job.roles && (
                            <div className="flex items-center gap-1 text-xs">
                              <Star className="w-2 h-2 text-yellow-500 flex-shrink-0" />
                              <span className="text-slate-300 font-ui text-xs">
                                {job.roles.length} roles found
                              </span>
                            </div>
                          )}
                          {job.imagesValidated && (
                            <div className="flex items-center gap-1 text-xs">
                              <CheckCircle2 className="w-2 h-2 text-green-500 flex-shrink-0" />
                              <span className="text-slate-300 font-ui text-xs">
                                {job.imagesValidated} images validated
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Discovered Roles */}
                    {job.roles && job.roles.length > 0 && (
                      <div className="pt-2 border-t border-slate-700">
                        <h5 className="text-slate-400 text-xs mb-2 font-cyber tracking-wide">
                          DISCOVERED ROLES
                        </h5>
                        <div className="flex flex-wrap gap-1">
                          {job.roles.slice(0, 3).map((role, roleIndex) => (
                            <motion.span
                              key={role}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: roleIndex * 0.1 }}
                              className="text-xs bg-blue-900/40 text-blue-200 px-2 py-1 rounded border border-blue-500/30 font-ui"
                            >
                              {role}
                            </motion.span>
                          ))}
                          {job.roles.length > 3 && (
                            <span className="text-xs text-slate-400 px-2 py-1 font-ui">
                              +{job.roles.length - 3}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Progress Bar for Running Jobs */}
                    {job.status === 'running' && (
                      <div className="mt-3 pt-2 border-t border-slate-700">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs text-slate-400 font-cyber">
                            {job.currentPhase}
                          </span>
                          <span className="text-xs text-blue-400 font-cyber font-bold">
                            {job.progress}%
                          </span>
                        </div>
                        <div className="progress-bar h-1">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
