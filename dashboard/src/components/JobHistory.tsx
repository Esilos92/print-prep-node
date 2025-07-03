import { motion } from 'framer-motion';
import { 
  Download, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  User,
  Calendar,
  FileArchive,
  Star,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

interface JobStatus {
  id: string;
  celebrity: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentPhase: string;
  progress: number;
  roles?: string[]; // 🎯 Real role names from backend
  imagesProcessed?: number;
  imagesValidated?: number;
  downloadLink?: string; // 🎯 Google Drive link
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
        return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />;
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

  // 🎯 FIX: Better job filtering - only show completed jobs in count
  const completedCount = jobs.filter(j => j.status === 'completed').length;
  const lastJob = jobs.length > 0 ? jobs[0] : null;

  // 🎯 NEW: Handle Google Drive download
  const handleDownload = (downloadLink: string) => {
    if (downloadLink?.includes('drive.google.com')) {
      // Open Google Drive link in new tab
      window.open(downloadLink, '_blank');
    } else {
      // Fallback for other links
      window.open(downloadLink, '_blank');
    }
  };

  return (
    <div className="cyber-panel">
      {/* Headers Row - Mission Archive and Subject Log on same line */}
      <div style={{ display: 'flex', flexDirection: 'row', padding: '12px 12px 0px 12px' }}>
        <div style={{ width: '35%', paddingRight: '16px' }}>
          <div>
            <FileArchive className="w-6 h-6 text-blue-400 mb-2" />
            <h3 className="font-cyber text-xl text-glow-blue">MISSION ARCHIVE</h3>
            <div className="font-cyber text-lg text-blue-300">Completed - {completedCount}</div>
          </div>
        </div>
        <div style={{ width: '65%', paddingLeft: '16px', borderLeft: '1px solid rgba(37, 99, 235, 0.3)' }}>
          <div>
            <FileArchive className="w-6 h-6 text-blue-400 mb-2" style={{ opacity: 0 }} />
            <h3 className="font-cyber text-xl text-glow-blue">SUBJECT LOG</h3>
          </div>
        </div>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'row', height: 'calc(100% - 60px)', padding: '0px 12px 12px 12px' }}>
        
        {/* LEFT COLUMN - 35% */}
        <div style={{ width: '35%', paddingRight: '16px', borderRight: '1px solid rgba(37, 99, 235, 0.3)' }}>
          
          <br />
          
          {/* Last Subject Section - matching System Status style */}
          <div>
            <h4 className="text-base font-cyber text-slate-300 mb-4 tracking-wide">LAST SUBJECT</h4>
            <div className="font-cyber text-xl text-glow-pink">
              {lastJob ? lastJob.celebrity : 'None'}
            </div>
            <div className={`text-sm font-ui mt-1 ${getStatusColor(lastJob?.status || 'idle')}`}>
              {lastJob ? lastJob.status.toUpperCase() : 'IDLE'}
            </div>
            
            {/* 🎯 Real roles and images for last subject */}
            {lastJob && (
              <div className="mt-3 space-y-2">
                {lastJob.roles && lastJob.roles.length > 0 && (
                  <div className="text-sm font-ui text-slate-300">
                    <span className="text-slate-400">Roles:</span> {lastJob.roles.slice(0, 2).join(', ')}
                    {lastJob.roles.length > 2 && <span className="text-slate-500"> +{lastJob.roles.length - 2} more</span>}
                  </div>
                )}
                {(lastJob.imagesProcessed || lastJob.imagesValidated) && (
                  <div className="text-sm font-ui text-slate-300">
                    <span className="text-slate-400">Images:</span> {lastJob.imagesProcessed || 0} Downloaded / {lastJob.imagesValidated || 0} Validated
                  </div>
                )}
              </div>
            )}
          </div>
          
          <br />
          <br />
          
          {/* 🎯 Enhanced Download Button with Google Drive support */}
          {lastJob && lastJob.status === 'completed' && lastJob.downloadLink && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="cyber-button w-full flex items-center justify-center gap-2"
              onClick={() => handleDownload(lastJob.downloadLink!)}
            >
              <ExternalLink className="w-4 h-4" />
              <span>Download Latest</span>
            </motion.button>
          )}
          
          {/* Show status if job completed but no download link */}
          {lastJob && lastJob.status === 'completed' && !lastJob.downloadLink && (
            <div className="w-full p-3 rounded-lg border border-yellow-500/30 bg-yellow-900/20 text-yellow-300 text-center text-sm">
              <AlertCircle className="w-4 h-4 mx-auto mb-1" />
              <span>Completed - Download link unavailable</span>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN - 65% with HORIZONTAL SCROLL */}
        <div style={{ width: '65%', paddingLeft: '16px' }}>
          
          {/* 🎯 NEW: Horizontal scrolling job cards */}
          <div style={{ height: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
            {jobs.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-500 font-ui">
                No missions logged
              </div>
            ) : (
              <div 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'row', 
                  gap: '16px',
                  paddingBottom: '16px',
                  minHeight: '100%'
                }}
              >
                {jobs.map((job, index) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 flex-shrink-0"
                    style={{ 
                      width: '280px',
                      height: 'fit-content',
                      maxHeight: 'calc(100% - 32px)',
                      overflowY: 'auto'
                    }}
                  >
                    {/* Header: Status Icon + Celebrity Name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      {getStatusIcon(job.status)}
                      <h4 className="font-cyber text-lg text-blue-300 truncate">{job.celebrity}</h4>
                    </div>
                    
                    {/* Job Details */}
                    <div className="space-y-2">
                      {/* 🎯 Real roles display - truncated for horizontal cards */}
                      {job.roles && job.roles.length > 0 && (
                        <div className="text-sm font-ui text-slate-300">
                          <span className="text-slate-400">Roles:</span> 
                          <div className="mt-1">
                            {job.roles.slice(0, 2).map((role, i) => (
                              <div key={i} className="truncate" title={role}>
                                {role}
                              </div>
                            ))}
                            {job.roles.length > 2 && (
                              <div className="text-xs text-slate-500">
                                +{job.roles.length - 2} more roles
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* 🎯 Accurate image counts */}
                      {(job.imagesProcessed || job.imagesValidated) && (
                        <div className="text-sm font-ui text-slate-300">
                          <span className="text-slate-400">Images:</span>
                          <div className="text-blue-300 font-cyber">
                            {job.imagesProcessed || 0} / {job.imagesValidated || 0}
                          </div>
                          <div className="text-xs text-slate-500">Downloaded / Validated</div>
                        </div>
                      )}
                      
                      {job.startTime && job.endTime && (
                        <div className="text-sm font-ui text-slate-300">
                          <span className="text-slate-400">Duration:</span> {formatDuration(job.startTime, job.endTime)}
                        </div>
                      )}
                      
                      {job.startTime && (
                        <div className="text-sm font-ui text-slate-300">
                          <span className="text-slate-400">Date:</span> 
                          <div className="text-xs">{job.startTime.toLocaleDateString()}</div>
                        </div>
                      )}
                      
                      {/* Show error details for failed jobs */}
                      {job.status === 'error' && (
                        <div className="text-sm font-ui text-red-400">
                          <span className="text-red-300">Error:</span> 
                          <div className="text-xs mt-1 break-words">{job.currentPhase}</div>
                        </div>
                      )}
                    </div>
                    
                    {/* 🎯 Enhanced Download Button for individual jobs */}
                    {job.status === 'completed' && job.downloadLink && (
                      <div className="mt-4 pt-3 border-t border-slate-700">
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="cyber-button text-sm px-3 py-2 w-full flex items-center justify-center gap-2"
                          onClick={() => handleDownload(job.downloadLink!)}
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Download</span>
                        </motion.button>
                      </div>
                    )}
                    
                    {/* Show completed but no download link available */}
                    {job.status === 'completed' && !job.downloadLink && (
                      <div className="mt-4 pt-3 border-t border-slate-700">
                        <div className="text-xs text-yellow-400 flex items-center justify-center gap-2">
                          <AlertCircle className="w-3 h-3" />
                          <span>Download unavailable</span>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
