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
      <div className="flex h-full p-2">
        
        {/* Left Section - Header & Summary */}
        <div className="w-80 flex flex-col border-r border-blue-500/30 mr-2">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-blue-500/30 flex-shrink-0 bg-slate-900/30 rounded-lg mb-2">
            <div className="flex items-center gap-2">
              <FileArchive className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-cyber font-bold text-glow-blue">
                MISSION ARCHIVE
              </h3>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="flex-1 flex flex-col justify-center p-4 bg-slate-900/30 rounded-lg mb-2">
            <div className="space-y-4">
              {/* Mission Stats */}
              <div className="text-center">
                <div className="text-2xl font-cyber font-bold text-green-400">
                  {jobs.filter(j => j.status === 'completed').length}
                </div>
                <div className="text-xs text-slate-400 font-ui">Completed</div>
              </div>
              
              {/* Last Processed Celebrity */}
              {jobs.length > 0 && (
                <div className="text-center pt-3 border-t border-slate-700 space-y-3">
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <User className="w-3 h-3 text-blue-300" />
                      <span className="text-xs font-cyber text-slate-300 tracking-wide">LAST SUBJECT</span>
                    </div>
                    <div className="text-sm font-cyber text-blue-300">{jobs[0].celebrity}</div>
                    <div className="text-xs text-slate-400 font-ui">{jobs[0].status.toUpperCase()}</div>
                  </div>
                </div>
              )}
              
              {jobs.length === 0 && (
                <div className="text-center pt-3 border-t border-slate-700">
                  <div className="w-12 h-12 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Calendar className="w-6 h-6 text-slate-600" />
                  </div>
                  <p className="text-xs text-slate-500 font-ui">
                    No battle data logged
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Download Button */}
          {jobs.length > 0 && jobs[0].status === 'completed' && jobs[0].downloadLink && (
            <div className="p-4 bg-slate-900/30 rounded-lg">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="cyber-button pink text-sm px-4 py-2 flex items-center gap-2 w-full justify-center"
                onClick={() => window.open(jobs[0].downloadLink, '_blank')}
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </motion.button>
            </div>
          )}
        </div>

        {/* Right Section - Subject Log */}
        <div className="flex-1 flex flex-col ml-2">
          {jobs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 font-ui text-sm bg-slate-950/80 rounded-lg">
              Completed missions will appear here
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 bg-slate-950/80 rounded-lg">
              <h4 className="text-xs font-cyber text-slate-400 mb-4 tracking-wide">SUBJECT LOG</h4>
              <div className="space-y-4">
                {jobs.map((job, index) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 hover:border-blue-500/50 transition-all duration-300 hover:bg-slate-800/50"
                  >
                    {/* Subject Header */}
                    <div className="flex items-center gap-3 mb-3">
                      {getStatusIcon(job.status)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-blue-300 flex-shrink-0" />
                          <h4 className="font-cyber text-base text-blue-300">
                            {job.celebrity}
                          </h4>
                        </div>
                        <p className={`text-xs font-ui ${getStatusColor(job.status)}`}>
                          {job.status.toUpperCase()}
                        </p>
                      </div>
                    </div>

                    {/* Timeline & Results */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <h5 className="text-slate-400 text-xs font-cyber tracking-wide mb-2">TIMELINE</h5>
                        <div className="space-y-1">
                          {job.startTime && (
                            <div className="flex items-center gap-2 text-xs">
                              <Clock className="w-3 h-3 text-slate-500 flex-shrink-0" />
                              <span className="text-slate-300 font-ui">
                                {job.startTime.toLocaleTimeString()}
                              </span>
                            </div>
                          )}
                          {job.endTime && (
                            <div className="flex items-center gap-2 text-xs">
                              <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                              <span className="text-slate-300 font-ui">
                                Duration: {formatDuration(job.startTime, job.endTime)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <h5 className="text-slate-400 text-xs font-cyber tracking-wide mb-2">RESULTS</h5>
                        <div className="space-y-1">
                          {job.roles && (
                            <div className="flex items-center gap-2 text-xs">
                              <Star className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                              <span className="text-slate-300 font-ui">
                                {job.roles.length} identities found
                              </span>
                            </div>
                          )}
                          {job.imagesValidated && (
                            <div className="flex items-center gap-2 text-xs">
                              <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                              <span className="text-slate-300 font-ui">
                                {job.imagesValidated} data files secured
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
                          IDENTITIES FOUND
                        </h5>
                        <div className="flex flex-wrap gap-2">
                          {job.roles.map((role, roleIndex) => (
                            <motion.span
                              key={role}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: roleIndex * 0.1 }}
                              className="text-xs bg-blue-900/40 text-blue-200 px-3 py-1.5 rounded border border-blue-500/30 font-ui"
                            >
                              {role}
                            </motion.span>
                          ))}
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
