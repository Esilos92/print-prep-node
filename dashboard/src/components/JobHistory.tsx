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
        return 'text-green-300';
      case 'error':
        return 'text-red-400';
      case 'running':
        return 'text-yellow-300';
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

  const completedCount = jobs.filter(j => j.status === 'completed').length;
  const lastJob = jobs.length > 0 ? jobs[0] : null;

  return (
    <div className="cyber-panel">
      <div style={{ display: 'flex', flexDirection: 'row', height: '100%', padding: '12px' }}>
        
        {/* LEFT COLUMN - 35% */}
        <div style={{ width: '35%', paddingRight: '16px', borderRight: '1px solid rgba(37, 99, 235, 0.3)' }}>
          
          {/* Mission Archive Header + Completed Count on same line */}
          <div className="flex items-center justify-between">
            <span className="font-cyber text-xl text-glow-blue">MISSION ARCHIVE</span>
            <span className="font-cyber text-2xl text-blue-300">{completedCount}</span>
          </div>
          
          <br />
          
          {/* Last Subject Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-blue-300" />
              <span className="text-sm font-ui text-slate-400">LAST SUBJECT</span>
            </div>
            <div className="font-cyber text-lg text-glow-pink">
              {lastJob ? lastJob.celebrity : 'None'}
            </div>
            <div className={`text-sm font-ui ${getStatusColor(lastJob?.status || 'idle')}`}>
              {lastJob ? lastJob.status.toUpperCase() : 'IDLE'}
            </div>
          </div>
          
          <br />
          <br />
          
          {/* Download Button */}
          {lastJob && lastJob.status === 'completed' && lastJob.downloadLink && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="cyber-button w-full flex items-center justify-center gap-2"
              onClick={() => window.open(lastJob.downloadLink, '_blank')}
            >
              <Download className="w-4 h-4" />
              <span>Download Latest</span>
            </motion.button>
          )}
        </div>

        {/* RIGHT COLUMN - 65% */}
        <div style={{ width: '65%', paddingLeft: '16px' }}>
          
          <h3 className="font-cyber text-xl text-glow-blue mb-4">SUBJECT LOG</h3>
          
          {/* Scrollable Job Cards - Fixed height for scrolling */}
          <div style={{ height: 'calc(100% - 60px)', overflowY: 'auto' }} className="space-y-4">
            {jobs.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-500 font-ui">
                No missions logged
              </div>
            ) : (
              jobs.map((job, index) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-slate-800/30 border border-slate-700 rounded-lg p-4"
                >
                  {/* Celebrity Name + Status Icon on same line */}
                  <div className="flex items-center gap-3 mb-3">
                    {getStatusIcon(job.status)}
                    <h4 className="font-cyber text-lg text-blue-300">{job.celebrity}</h4>
                  </div>
                  
                  {/* Job Details */}
                  <div className="space-y-2">
                    {job.roles && (
                      <div className="text-sm font-ui text-slate-300">
                        <span className="text-slate-400">Roles:</span> {job.roles.join(', ')}
                      </div>
                    )}
                    
                    {(job.imagesProcessed || job.imagesValidated) && (
                      <div className="text-sm font-ui text-slate-300">
                        <span className="text-slate-400">Images:</span> {job.imagesValidated || 0} Validated / {job.imagesProcessed || 0} Downloaded
                      </div>
                    )}
                    
                    {job.startTime && job.endTime && (
                      <div className="text-sm font-ui text-slate-300">
                        <span className="text-slate-400">Duration:</span> {formatDuration(job.startTime, job.endTime)}
                      </div>
                    )}
                    
                    {job.startTime && (
                      <div className="text-sm font-ui text-slate-300">
                        <span className="text-slate-400">Completed:</span> {job.startTime.toLocaleString()}
                      </div>
                    )}
                  </div>
                  
                  {/* Download Button for individual job */}
                  {job.status === 'completed' && job.downloadLink && (
                    <div className="mt-3 pt-3 border-t border-slate-700">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="cyber-button text-sm px-4 py-2 flex items-center gap-2"
                        onClick={() => window.open(job.downloadLink, '_blank')}
                      >
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </motion.button>
                    </div>
                  )}
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
