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
  const [messages, setMessages] = useState<any[]>([]);

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
        <div style={{ width: '50%', paddingRight: '16px', borderRight: '1px solid rgba(37, 99, 235, 0.3)' }} className="flex flex-col">
          
          {/* Robot + GBot.EXE + AI Image Sourcing Assistant */}
          <div className="flex items-center gap-3">
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
              <h3 className="font-cyber text-2xl font-bold text-glow-blue">GBot.EXE</h3>
              <p className="text-base text-slate-400">AI Image Sourcing Assistant</p>
            </div>
          </div>

          {/* LINE BREAK */}
          <br />

          {/* System Status */}
          <div>
            <h4 className="text-base font-cyber text-slate-300 mb-4 tracking-wide">SYSTEM STATUS</h4>
            <div className="p-4 rounded-lg border bg-blue-900/20 text-blue-100 border-blue-500/30">
              <p className="text-base font-ui leading-relaxed">
                GBot.EXE online! Ready to execute celebrity image sourcing missions.
              </p>
            </div>
          </div>

          {/* LINE BREAK */}
          <br />

          {/* LINE BREAK */}
          <br />

          {/* LINE BREAK */}
          <br />

          {/* Subject Input - Push to bottom */}
          <div className="mt-auto">
            <h4 className="text-base font-cyber text-slate-300 mb-4 tracking-wide">SUBJECT INPUT</h4>
            <form onSubmit={handleSubmit} className="space-y-3">
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
                  className="flex items-center gap-2 text-base text-yellow-400 font-ui"
                >
                  <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
                  <span>Battle routine executing... Stand by for mission updates</span>
                </motion.div>
              )}
            </form>
          </div>
        </div>

        {/* RIGHT SIDE - Exactly 50% */}
        <div style={{ width: '50%', paddingLeft: '16px' }} className="flex flex-col">
          
          {/* Processing (only when running) */}
          {currentJob?.status === 'running' && (
            <>
              <div>
                <div className="flex items-center gap-4 mb-2">
                  <span className="font-cyber text-xl text-glow-blue">PROCESSING</span>
                </div>
                <div className="text-blue-300 font-cyber text-2xl">{currentJob.celebrity}</div>
              </div>
              
              {/* LINE BREAK */}
              <br />
            </>
          )}

          {/* Communication Log - Takes remaining space */}
          <div className="flex-1">
            <h4 className="text-base font-cyber text-slate-300 mb-4 tracking-wide">COMMUNICATION LOG</h4>
            
            {/* GBot texts with darker background - embedded chat box */}
            <div className="bg-slate-900/80 rounded-lg border border-slate-600 h-full flex flex-col overflow-hidden">
              
              {/* Chat Header */}
              <div className="bg-slate-800/70 px-4 py-3 border-b border-slate-600 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm font-mono text-slate-300 ml-3">chat://gbot.exe</span>
              </div>
              
              {/* Chat Messages Area - Scrollable with darker background */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-950/90">
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-2">
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
                        ? 'bg-slate-800/80 text-green-300 border-blue-500 font-mono' 
                        : 'bg-slate-800/80 text-cyan-300 border-pink-500 font-mono'
                    }`}>
                      <p className="leading-relaxed">{message.text}</p>
                    </div>
                  </motion.div>
                ))}
                
                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono px-3 py-1 rounded text-sm bg-blue-800/60 text-blue-200">
                        [GBot.EXE]
                      </span>
                    </div>
                    <div className="bg-slate-800/80 text-green-300 border-l-4 border-blue-500 p-4 rounded font-mono">
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
