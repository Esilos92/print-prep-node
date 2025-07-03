import { motion } from 'framer-motion';
import { Bot, Send, Zap } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface JobStatus {
  id: string;
  celebrity: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentPhase: string;
  progress: number;
  gBotPhaseChange?: string;
  currentPhaseForGBot?: string;
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
  const [lastAnnouncedPhase, setLastAnnouncedPhase] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    if (currentJob?.status === 'running') {
      if (!lastAnnouncedPhase) {
        addBotMessage(`Roger! Initiating mission for ${currentJob.celebrity}. All systems operational!`);
        setLastAnnouncedPhase('started');
      }
      
      if (currentJob.gBotPhaseChange && currentJob.gBotPhaseChange !== lastAnnouncedPhase) {
        const phaseMessages = {
          'filmography_scan': `Beginning filmography analysis for ${currentJob.celebrity}. Scanning career database...`,
          'performance_analysis': `Now analyzing performance history. Cross-referencing roles and characters...`,
          'search_protocol': `Activating smart search protocols. Optimizing image discovery strategies...`,
          'image_download': `Commencing image acquisition sequence. Deploying AI-powered search algorithms...`,
          'ai_validation': `Engaging AI validation systems. Intelligence algorithms analyzing image quality...`,
          'file_compilation': `Initiating final compilation sequence. Preparing mission package for delivery...`
        };
        
        const message = phaseMessages[currentJob.gBotPhaseChange as keyof typeof phaseMessages];
        if (message) {
          addBotMessage(message);
          setLastAnnouncedPhase(currentJob.gBotPhaseChange);
        }
      }
    } else if (currentJob?.status === 'completed') {
      if (lastAnnouncedPhase !== 'completed') {
        addBotMessage(`Mission accomplished! ${currentJob.celebrity} image package is ready for download.`);
        setLastAnnouncedPhase('completed');
      }
    } else if (currentJob?.status === 'error') {
      if (lastAnnouncedPhase !== 'error') {
        addBotMessage(`Mission encountered an error. Systems standing by for new orders.`);
        setLastAnnouncedPhase('error');
      }
    }
    
    if (!currentJob) {
      setLastAnnouncedPhase(null);
    }
  }, [currentJob?.status, currentJob?.gBotPhaseChange, currentJob?.celebrity, lastAnnouncedPhase]);

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
      {/* Matching ProgressDisplay padding pattern: consistent 12px all around */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'row', height: '100%', position: 'relative' }}>
        
        {/* Vertical divider positioned relative to the padded container */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: '1px',
          backgroundColor: 'rgba(37, 99, 235, 0.3)',
          transform: 'translateX(-8px)' // Offset to account for padding between columns
        }}></div>
        
        {/* LEFT SIDE - Exactly 50% */}
        <div style={{ width: '50%', paddingRight: '16px' }} className="flex flex-col">
          
          {/* Robot + GBot.EXE + AI Image Sourcing Assistant */}
          <div className="flex items-center gap-3 mb-4" style={{ padding: '12px 0' }}>
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
            
            {/* Reserved Space Container - Always same height */}
            <div style={{ minHeight: '96px' }}>
              <div className="flex gap-3 items-center">
                <input
                  type="text"
                  value={celebrityName}
                  onChange={(e) => setCelebrityName(e.target.value)}
                  placeholder="input celebrity subject name..."
                  className="cyber-input flex-1 text-base"
                  style={{ padding: '12px 16px', height: '48px', boxSizing: 'border-box' }}
                  disabled={currentJob?.status === 'running'}
                />
                <button
                  type="submit"
                  onClick={handleSubmit}
                  disabled={!celebrityName.trim() || currentJob?.status === 'running'}
                  className={`cyber-button px-8 py-4 text-base whitespace-nowrap ${
                    currentJob?.status === 'running' ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  style={{ height: '48px', boxSizing: 'border-box', minHeight: 'unset' }}
                >
                  <Send className="w-5 h-5 mr-2" />
                  Execute
                </button>
              </div>
              
              {/* Reserved space for status message */}
              <div style={{ minHeight: '36px', marginTop: '12px' }}>
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
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE - Exactly 50% */}
        <div style={{ 
          width: '50%', 
          paddingLeft: '16px'
        }}>
          
          {/* Communication Header */}
          <div style={{ padding: '12px 0' }}>
            <Zap className="w-6 h-6 text-blue-400 mb-2" style={{ opacity: 0 }} />
            <h3 className="font-cyber text-2xl font-bold text-glow-blue">COMMUNICATION LOG</h3>
          </div>
              
          {/* Chat Container - FIX: Proper height calculation within padded area */}
          <div className="bg-slate-900/80 rounded-lg border border-slate-600 flex flex-col overflow-hidden" style={{ height: 'calc(300px - 24px)' }}>
            
            {/* Chat Header */}
            <div className="bg-slate-800/70 px-4 py-3 border-b border-slate-600 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm font-mono text-slate-300 ml-3">chat://gbot.exe</span>
            </div>
            
            {/* Line break after header */}
            <div style={{ height: '12px', backgroundColor: 'rgba(2, 6, 23, 0.9)' }}></div>
            
            {/* Chat Messages Area - Fixed height with scroll and proper min-height */}
            <div 
              className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-950/90"
              style={{ 
                scrollBehavior: 'smooth',
                overscrollBehavior: 'contain',
                minHeight: 0  // KEY FIX: Prevents flexbox overflow
              }}
            >
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
              
              {/* Auto-scroll anchor */}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
      </div> 
    </div>
  );
}
