import { motion } from 'framer-motion';
import { Bot, Send, Zap } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';

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
  const [awaitingNewMission, setAwaitingNewMission] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const synthRef = useRef<Tone.Synth | null>(null);

  // Initialize Tone.js synth
  useEffect(() => {
    const initAudio = async () => {
      try {
        // Create synth instance with reduced volume (70% quieter)
        synthRef.current = new Tone.Synth({
          oscillator: { type: 'square' }, // Retro square wave
          envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.1 },
          volume: -18 // Reduce volume by 70% (much quieter)
        }).toDestination();
        
        console.log('🎵 Tone.js synth initialized successfully');
      } catch (error) {
        console.warn('⚠️ Tone.js initialization failed:', error);
      }
    };

    initAudio();

    // Cleanup on unmount
    return () => {
      if (synthRef.current) {
        synthRef.current.dispose();
      }
    };
  }, []);

  // Enhanced cyber sound effects with better error handling and reduced volume
  const playCyberBeep = async (type: 'start' | 'phase' | 'complete' | 'error') => {
    try {
      // Ensure Tone.js context is started (required for web audio)
      if (Tone.context.state !== 'running') {
        await Tone.start();
        setAudioEnabled(true);
        console.log('🎵 Audio context started');
      }

      // Use existing synth or create new one if needed with reduced volume (70% quieter)
      const synth = synthRef.current || new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.1 },
        volume: -18 // 70% quieter than original
      }).toDestination();

      switch (type) {
        case 'start':
          // Quick ascending beep for mission start: C4 → E4
          synth.triggerAttackRelease('C4', '0.1');
          setTimeout(() => synth.triggerAttackRelease('E4', '0.1'), 100);
          console.log('🔊 Mission start beep played');
          break;
          
        case 'phase':
          // Single mid-tone beep for phase changes
          synth.triggerAttackRelease('G4', '0.15');
          console.log('🔊 Phase change beep played');
          break;
          
        case 'complete':
          // Triumphant ascending sequence: C4→E4→G4→C5
          synth.triggerAttackRelease('C4', '0.2');
          setTimeout(() => synth.triggerAttackRelease('E4', '0.2'), 200);
          setTimeout(() => synth.triggerAttackRelease('G4', '0.2'), 400);
          setTimeout(() => synth.triggerAttackRelease('C5', '0.4'), 600);
          console.log('🔊 Mission complete sequence played');
          break;
          
        case 'error':
          // Low descending beep for errors: C4→G3
          synth.triggerAttackRelease('C4', '0.3');
          setTimeout(() => synth.triggerAttackRelease('G3', '0.3'), 300);
          console.log('🔊 Error beep played');
          break;
      }
    } catch (error) {
      console.warn('⚠️ Audio playback failed:', error);
      // Add visual feedback when audio fails
      if (type === 'start') {
        console.log('🔇 [SILENT] Mission start sound would play here');
      } else if (type === 'complete') {
        console.log('🔇 [SILENT] Victory fanfare would play here');
      }
    }
  };

  // Enable audio on first user interaction
  const enableAudioOnInteraction = async () => {
    if (!audioEnabled) {
      try {
        await Tone.start();
        setAudioEnabled(true);
        console.log('🎵 Audio enabled by user interaction');
      } catch (error) {
        console.warn('⚠️ Could not enable audio:', error);
      }
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    if (currentJob?.status === 'running') {
      if (!lastAnnouncedPhase) {
        playCyberBeep('start');
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
          playCyberBeep('phase');
          addBotMessage(message);
          setLastAnnouncedPhase(currentJob.gBotPhaseChange);
        }
      }
    } else if (currentJob?.status === 'completed') {
      if (lastAnnouncedPhase !== 'completed') {
        playCyberBeep('complete');
        addBotMessage(`Mission accomplished! ${currentJob.celebrity} image package is ready for download.`);
        setLastAnnouncedPhase('completed');
        
        // Add a final completion summary message
        setTimeout(() => {
          addBotMessage(`✅ MISSION COMPLETE ✅\n\nCelebrity: ${currentJob.celebrity}\nStatus: Package compiled and uploaded\nDownload: Available in Mission Archive\n\nGBot.EXE standing by for next assignment.`);
          
          // Ask for new mission after another delay
          setTimeout(() => {
            addBotMessage(`Ready for another mission?\n\nEnter a new celebrity name to begin next operation, or enjoy your downloads! 🎯`);
            setAwaitingNewMission(true);
          }, 3000);
        }, 2000);
      }
    } else if (currentJob?.status === 'error') {
      if (lastAnnouncedPhase !== 'error') {
        playCyberBeep('error');
        addBotMessage(`Mission encountered an error. Systems standing by for new orders.`);
        setLastAnnouncedPhase('error');
      }
    }
    
    if (!currentJob) {
      setLastAnnouncedPhase(null);
      setAwaitingNewMission(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!celebrityName.trim() || currentJob?.status === 'running') return;

    // Enable audio on first interaction
    await enableAudioOnInteraction();

    setMessages(prev => [...prev, {
      id: Date.now(),
      text: `Process images for: ${celebrityName}`,
      isBot: false,
      timestamp: 'USER'
    }]);

    // Reset state for new mission
    setAwaitingNewMission(false);
    setLastAnnouncedPhase(null);

    onStartJob();
  };

  return (
    <div className="cyber-panel">
      {/* Audio Status Indicator */}
      {!audioEnabled && (
        <div className="absolute top-2 right-2 z-10">
          <div className="bg-yellow-900/80 text-yellow-200 px-3 py-1 rounded text-sm font-mono">
            🔇 Click Execute to enable audio
          </div>
        </div>
      )}
      
      {/* Matching ProgressDisplay padding pattern: consistent 12px all around */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'row', height: '100%', position: 'relative' }}>
        
        {/* Vertical divider positioned relative to the padded container */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '32px',    // Decreased top spacing to 32px
          bottom: '0px',  // No bottom spacing - divider goes to bottom edge
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
              {/* Audio status indicator */}
              {audioEnabled && (
                <motion.div 
                  className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full border-2 border-slate-900 flex items-center justify-center"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  <div className="w-2 h-2 bg-yellow-600 rounded-full"></div>
                </motion.div>
              )}
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
              <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
                <input
                  type="text"
                  value={celebrityName}
                  onChange={(e) => setCelebrityName(e.target.value)}
                  onFocus={enableAudioOnInteraction}
                  placeholder="input celebrity subject name..."
                  className="cyber-input flex-1 text-base"
                  style={{ 
                    padding: '14px 16px', 
                    height: '48px', 
                    boxSizing: 'border-box',
                    margin: 0,
                    border: '2px solid #2563eb',
                    borderRadius: '8px'
                  }}
                  disabled={currentJob?.status === 'running'}
                />
                <button
                  type="submit"
                  onClick={handleSubmit}
                  disabled={!celebrityName.trim() || currentJob?.status === 'running'}
                  className={`text-base whitespace-nowrap ${
                    currentJob?.status === 'running' ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  style={{ 
                    height: '48px', 
                    boxSizing: 'border-box',
                    padding: '14px 32px',
                    margin: 0,
                    background: 'linear-gradient(145deg, #0066CC, #0052a3)',
                    border: '2px solid #00bfff',
                    borderRadius: '8px',
                    color: 'white',
                    fontFamily: "'Orbitron', monospace",
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: (!celebrityName.trim() || currentJob?.status === 'running') ? 'not-allowed' : 'pointer'
                  }}
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
                    <span>Jack in! Sourcing routine executing... Stand by for mission updates</span>
                  </motion.div>
                )}
                {awaitingNewMission && !currentJob && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 text-base text-green-400 font-ui"
                  >
                    <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                    <span>Ready for next mission - Enter celebrity name above! 🚀</span>
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
              
          {/* Chat Container - FIXED SCROLLING */}
          <div className="gbot-chat-container bg-slate-900/80 rounded-lg border border-slate-600" style={{ height: 'calc(100% - 60px)' }}>
            
            {/* Chat Header */}
            <div className="bg-slate-800/70 px-4 py-3 border-b border-slate-600 flex items-center gap-2 flex-shrink-0">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm font-mono text-slate-300 ml-3">chat://gbot.exe</span>
            </div>
            
            {/* Embedded chat separator line */}
            <div className="bg-slate-950/90 border-b border-slate-700" style={{ height: '2px', flexShrink: 0 }}></div>
            
            {/* Chat Messages Area - FIXED SCROLLING */}
            <div className="gbot-chat-messages space-y-4">
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
