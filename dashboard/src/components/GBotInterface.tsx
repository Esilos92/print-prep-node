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
    <div className="cyber-panel relative">
      {/* Rotating Animation Around Entire Container */}
      <motion.div 
        className="absolute inset-0 pointer-events-none"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
      >
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2">
          <Zap className="w-4 h-4 text-yellow-400" />
        </div>
      </motion.div>

      <div style={{ display: 'flex', flexDirection: 'row', height: '100%', padding: '12px' }}>
        
        {/* LEFT SIDE - Exactly 50% */}
        <div style={{ width: '50%', paddingRight: '16px', borderRight: '1px solid rgba(37, 99, 235, 0.3)' }} className="flex flex-col h-full">
          
          {/* Top 75% - Robot + System Status */}
          <div className="flex-grow flex flex-col justify-start space-y-8">
            
            {/* Robot Emoji + GBot.EXE */}
            <div className="bg-slate-900/50 rounded-lg p-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center">
                    <Bot className="w-8 h-8 text-white" />
                  </div>
                  <motion.div 
                    className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-slate-900"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  />
                </div>
                <div>
                  <h3 className="font-cyber text-2xl font-bold text-glow-blue mb-2">GBot.EXE</h3>
                  <p className="text-base text-slate-400">AI Image Sourcing Assistant</p>
                </div>
              </div>
            </div>

            {/* System Status */}
            <div className="bg-slate-900/30 rounded-lg p-6">
              <h4 className="text-base font-cyber text-slate-300 mb-6 tracking-wide">SYSTEM STATUS</h4>
              <div className="p-5 rounded-lg border bg-blue-900/20 text-blue-100 border-blue-500/30">
                <p className="text-base font-ui leading-relaxed">
                  GBot.EXE online! Ready to execute celebrity image sourcing missions.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom 25% - Subject Input */}
          <div className="bg-slate-900/30 rounded-lg p-6 mt-8">
            <h4 className="text-base font-cyber text-slate-300 mb-6 tracking-wide">SUBJECT INPUT</h4>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-3 items-center">
                <input
                  type="text"
                  value={celebrityName}
                  onChange={(e) => setCelebrityName(e.target.value)}
                  placeholder="input celebrity subject name..."
                  className="cyber-input flex-1 text-base py-4 px-4"
                  disabled={currentJob?.status === 'running'}
                />
                <button
                  type="submit"
                  disabled={!celebrityName.trim() || currentJob?.status === 'running'}
                  className={`cyber-button px-8 py-4 text-base whitespace-nowrap ${
                    currentJob?.status === 'running' ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <Send className="w-5 h-5 mr-2" />
                  Execute
                </button>
              </div>
              
              {currentJob?.status === 'running' && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-base text-yellow-400 font-ui mt-4"
                >
                  <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
                  <span>Battle routine executing... Stand by for mission updates</span>
                </motion.div>
              )}
            </form>
          </div>
        </div>

        {/* RIGHT SIDE - Exactly 50% */}
        <div style={{ width: '50%', paddingLeft: '16px' }} className="flex flex-col h-full space-y-8">
          
          {/* Processing Status */}
          {currentJob?.status === 'running' && (
            <div className="bg-slate-800/40 rounded-lg p-6">
              <div className="flex items-center gap-4 mb-4">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  <Zap className="w-6 h-6 text-blue-400" />
                </motion.div>
                <span className="font-cyber text-xl text-glow-blue">PROCESSING</span>
              </div>
              <div className="text-blue-300 font-cyber text-2xl mb-2">{currentJob.celebrity}</div>
            </div>
          )}

          {/* Communication Log - True Embedded Chat */}
          <div className="flex-1 bg-slate-950/80 rounded-lg p-6">
            <h4 className="text-base font-cyber text-slate-300 mb-6 tracking-wide">COMMUNICATION LOG</h4>
            
            {/* Embedded Terminal-Style Chat */}
            <div className="bg-black/80 rounded-lg border-2 border-slate-600 h-full flex flex-col overflow-hidden">
              
              {/* Terminal Header Bar */}
              <div className="bg-slate-700 px-4 py-3 border-b border-slate-600 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm font-mono text-slate-300 ml-3">chat://gbot.exe</span>
              </div>
              
              {/* Chat Messages Area */}
              <div className="flex-1 p-5 overflow-y-auto space-y-6 bg-black/90">
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className={`font-mono px-3 py-1 rounded text-sm ${
                        message.isBot 
                          ? 'bg-blue-800/60 text-blue-200' 
                          : 'bg-pink-800/60 text-pink-200'
                      }`}>
                        [{message.timestamp}]
                      </span>
                    </div>
                    <div className={`p-4 rounded border-l-4 text-base ${
                      message.isBot 
                        ? 'bg-slate-900/80 text-green-300 border-blue-500 font-mono' 
                        : 'bg-slate-900/80 text-cyan-300 border-pink-500 font-mono'
                    }`}>
                      <p className="leading-relaxed">{message.text}</p>
                    </div>
                  </motion.div>
                ))}
                
                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-mono px-3 py-1 rounded text-sm bg-blue-800/60 text-blue-200">
                        [GBot.EXE]
                      </span>
                    </div>
                    <div className="bg-slate-900/80 text-green-300 border-l-4 border-blue-500 p-4 rounded font-mono">
                      <div className="flex items-center gap-3">
                        <span className="text-base">Typing</span>
                        <div className="flex space-x-1">
                          <motion.div 
                            className="w-2 h-2 bg-green-400 rounded-full"
                            animate={{ scale: [1, 1.5, 1] }}
                            transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                          />
                          <motion.div 
                            className="w-2 h-2 bg-green-400 rounded-full"
                            animate={{ scale: [1, 1.5, 1] }}
                            transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                          />
                          <motion.div 
                            className="w-2 h-2 bg-green-400 rounded-full"
                            animate={{ scale: [1, 1.5, 1] }}
                            transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
