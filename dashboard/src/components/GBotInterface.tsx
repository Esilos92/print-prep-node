import { motion } from 'framer-motion';
import { Bot, Send, Zap, Terminal, Cpu } from 'lucide-react';
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
      timestamp: 'System Boot'
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
      {/* Terminal Header */}
      <div className="bg-gradient-to-r from-blue-900/80 to-blue-800/80 px-4 py-3 border-b border-blue-500/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-blue-300" />
            <span className="font-cyber text-sm text-blue-300">GBot.EXE Terminal</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <motion.div 
              className="flex items-center gap-1"
              animate={{ opacity: currentJob?.status === 'running' ? [1, 0.5, 1] : 1 }}
              transition={{ repeat: currentJob?.status === 'running' ? Infinity : 0, duration: 1 }}
            >
              <Cpu className="w-4 h-4 text-green-400" />
              <span className="text-xs text-green-400 font-cyber">ONLINE</span>
            </motion.div>
          </div>
        </div>
      </div>

      {/* GBot Avatar & Status */}
      <div className="px-4 py-3 bg-slate-900/50 border-b border-blue-500/20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <motion.div 
              className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-slate-900"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
          </div>
          <div className="flex-1">
            <h3 className="font-cyber text-lg font-bold text-glow-blue">GBot.EXE</h3>
            <p className="text-xs text-slate-400">AI Image Sourcing Assistant</p>
          </div>
          <motion.div 
            animate={{ rotate: currentJob?.status === 'running' ? 360 : 0 }}
            transition={{ repeat: currentJob?.status === 'running' ? Infinity : 0, duration: 2 }}
          >
            <Zap className="w-5 h-5 text-yellow-400" />
          </motion.div>
        </div>
      </div>

      {/* Terminal Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-950/80 space-y-3">
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-1"
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
            <div className={`p-3 rounded-lg border ${
              message.isBot 
                ? 'bg-blue-900/20 text-blue-100 border-blue-500/30' 
                : 'bg-pink-900/20 text-pink-100 border-pink-500/30'
            }`}>
              <p className="text-sm font-ui leading-relaxed">{message.text}</p>
            </div>
          </motion.div>
        ))}
        
        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-1"
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="font-cyber px-2 py-1 rounded text-xs bg-blue-900/50 text-blue-300">
                GBot.EXE
              </span>
            </div>
            <div className="bg-blue-900/20 text-blue-100 border border-blue-500/30 p-3 rounded-lg">
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

      {/* Terminal Input */}
      <div className="p-4 bg-slate-900/80 border-t border-blue-500/30 flex-shrink-0">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-400 font-cyber min-w-0">
              <span className="text-green-400">USER@terminal:</span>
              <span className="text-blue-400">~$</span>
            </div>
            <input
              type="text"
              value={celebrityName}
              onChange={(e) => setCelebrityName(e.target.value)}
              placeholder="enter celebrity name..."
              className="cyber-input flex-1 text-sm"
              disabled={currentJob?.status === 'running'}
            />
            <button
              type="submit"
              disabled={!celebrityName.trim() || currentJob?.status === 'running'}
              className={`cyber-button px-4 py-2 text-sm ${
                currentJob?.status === 'running' ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          
          {currentJob?.status === 'running' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-xs text-yellow-400 font-ui"
            >
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
              <span>Processing mission... Stand by for updates</span>
            </motion.div>
          )}
        </form>
      </div>
    </div>
  );
}
