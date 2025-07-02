import { motion } from 'framer-motion';
import { Bot, Send, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';

interface JobStatus {
  id: string;
  celebrity: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentPhase: string;
  progress: number;
}

interface GBotInterfaceProps {
  currentJob: JobStatus | null;
  onStartJob: () => void;
  celebrityName: string;
  setCelebrityName: (name: string) => void;
}

export default function GBotInterface({ 
  currentJob, 
  onStartJob, 
  celebrityName, 
  setCelebrityName 
}: GBotInterfaceProps) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "GBot.EXE online! Ready to execute celebrity image sourcing missions.",
      isBot: true,
      timestamp: 'System Status'
    }
  ]);

  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (currentJob?.status === 'running') {
      addBotMessage(`Roger! Initiating mission for ${currentJob.celebrity}. All systems operational!`);
    } else if (currentJob?.status === 'completed') {
      addBotMessage(`Mission accomplished! ${currentJob.celebrity} image package is ready for download.`);
    }
  }, [currentJob?.status]);

  const addBotMessage = (text: string) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now(),
        text,
        isBot: true,
        timestamp: 'GBot.EXE'
      }]);
      setIsTyping(false);
    }, 1000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!celebrityName.trim() || currentJob?.status === 'running') return;

    // Add user message
    setMessages(prev => [...prev, {
      id: Date.now(),
      text: `Process images for: ${celebrityName}`,
      isBot: false,
      timestamp: 'USER'
    }]);

    onStartJob();
  };

  return (
    <div className="cyber-panel">
      <div style={{ display: 'flex', flexDirection: 'row', height: '100%', padding: '12px' }}>
        
        {/* LEFT SIDE - Exactly 50% */}
        <div style={{ width: '50%', paddingRight: '16px', borderRight: '1px solid rgba(37, 99, 235, 0.3)' }} className="flex flex-col space-y-6">
          
          {/* Robot Emoji + GBot.EXE */}
          <div className="bg-slate-900/50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <motion.div 
                  className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-slate-900"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                />
              </div>
              <div>
                <h3 className="font-cyber text-lg font-bold text-glow-blue">GBot.EXE</h3>
                <p className="text-xs text-slate-400 mt-1">AI Image Sourcing Assistant</p>
              </div>
            </div>
          </div>

          {/* System Status */}
          <div className="bg-slate-900/30 rounded-lg p-4">
            <h4 className="text-xs font-cyber text-slate-300 mb-3 tracking-wide">SYSTEM STATUS</h4>
            <div className="p-3 rounded-lg border bg-blue-900/20 text-blue-100 border-blue-500/30">
              <p className="text-xs font-ui leading-relaxed">
                GBot.EXE online! Ready to execute celebrity image sourcing missions.
              </p>
            </div>
          </div>

          {/* Subject Input */}
          <div className="bg-slate-900/30 rounded-lg p-4">
            <h4 className="text-xs font-cyber text-slate-300 mb-3 tracking-wide">SUBJECT INPUT</h4>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={celebrityName}
                  onChange={(e) => setCelebrityName(e.target.value)}
                  placeholder="input celebrity subject name..."
                  className="cyber-input flex-1 text-sm py-2 px-3"
                  disabled={currentJob?.status === 'running'}
                />
                <button
                  type="submit"
                  disabled={!celebrityName.trim() || currentJob?.status === 'running'}
                  className={`cyber-button px-4 py-2 text-sm ${
                    currentJob?.status === 'running' ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <Send className="w-4 h-4 mr-1" />
                  Execute
                </button>
              </div>
              
              {currentJob?.status === 'running' && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-xs text-yellow-400 font-ui mt-2"
                >
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                  <span>Battle routine executing... Stand by for mission updates</span>
                </motion.div>
              )}
            </form>
          </div>
        </div>

        {/* RIGHT SIDE - Exactly 50% */}
        <div style={{ width: '50%', paddingLeft: '16px' }} className="flex flex-col space-y-6">
          
          {/* Processing Status */}
          {currentJob?.status === 'running' && (
            <div className="bg-slate-800/40 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  <Zap className="w-4 h-4 text-blue-400" />
                </motion.div>
                <span className="font-cyber text-sm text-glow-blue">PROCESSING</span>
              </div>
              <div className="text-blue-300 font-cyber text-lg">{currentJob.celebrity}</div>
            </div>
          )}

          {/* Communication Log - Embedded Chat Style */}
          <div className="flex-1 bg-slate-950/80 rounded-lg p-4">
            <h4 className="text-xs font-cyber text-slate-300 mb-4 tracking-wide">COMMUNICATION LOG</h4>
            
            {/* Chat Messages with Darker Background */}
            <div className="bg-slate-900/80 rounded-lg border border-slate-700 p-3 h-full overflow-y-auto space-y-4">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`font-cyber px-2 py-1 rounded text-xs ${
                      message.isBot 
                        ? 'bg-blue-900/50 text-blue-300' 
                        : 'bg-pink-900/50 text-pink-300'
                    }`}>
                      {message.timestamp}
                    </span>
                  </div>
                  <div className={`p-3 rounded border text-xs ${
                    message.isBot 
                      ? 'bg-slate-800/80 text-blue-100 border-blue-500/30' 
                      : 'bg-slate-800/80 text-pink-100 border-pink-500/30'
                  }`}>
                    <p className="font-ui leading-relaxed">{message.text}</p>
                  </div>
                </motion.div>
              ))}
              
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-cyber px-2 py-1 rounded text-xs bg-blue-900/50 text-blue-300">
                      GBot.EXE
                    </span>
                  </div>
                  <div className="bg-slate-800/80 text-blue-100 border border-blue-500/30 p-3 rounded">
                    <div className="flex space-x-1">
                      <motion.div 
                        className="w-2 h-2 bg-blue-400 rounded-full"
                        animate={{ scale: [1, 1.5, 1] }}
                        transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                      />
                      <motion.div 
                        className="w-2 h-2 bg-blue-400 rounded-full"
                        animate={{ scale: [1, 1.5, 1] }}
                        transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                      />
                      <motion.div 
                        className="w-2 h-2 bg-blue-400 rounded-full"
                        animate={{ scale: [1, 1.5, 1] }}
                        transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
