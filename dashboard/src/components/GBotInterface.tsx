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
      timestamp: new Date().toLocaleTimeString()
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
      timestamp: new Date().toLocaleTimeString()
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
      timestamp: new Date()
    }]);

    onStartJob();
  };

  return (
    <div className="cyber-panel p-6 h-[600px] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-blue-500/30">
        <div className="relative">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
            <Bot className="w-7 h-7 text-white" />
          </div>
          <motion.div 
            className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
          />
        </div>
        <div>
          <h3 className="font-cyber text-lg font-bold text-glow-blue">GBot.EXE</h3>
          <p className="text-sm text-slate-400">AI Image Sourcing Assistant</p>
        </div>
        <motion.div 
          className="ml-auto"
          animate={{ rotate: currentJob?.status === 'running' ? 360 : 0 }}
          transition={{ repeat: currentJob?.status === 'running' ? Infinity : 0, duration: 2 }}
        >
          <Zap className="w-6 h-6 text-yellow-400" />
        </motion.div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${message.isBot ? 'justify-start' : 'justify-end'}`}
          >
            <div className={`max-w-[80%] p-3 rounded-lg ${
              message.isBot 
                ? 'bg-blue-900/50 text-blue-100 border border-blue-500/30' 
                : 'bg-pink-900/50 text-pink-100 border border-pink-500/30'
            }`}>
              <p className="text-sm font-ui">{message.text}</p>
             <p className="text-xs opacity-60 mt-1">
              {message.timestamp}
            </p>
            </div>
          </motion.div>
        ))}
        
        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="bg-blue-900/50 text-blue-100 border border-blue-500/30 p-3 rounded-lg">
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

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={celebrityName}
            onChange={(e) => setCelebrityName(e.target.value)}
            placeholder="Enter celebrity name..."
            className="cyber-input flex-1"
            disabled={currentJob?.status === 'running'}
          />
          <button
            type="submit"
            disabled={!celebrityName.trim() || currentJob?.status === 'running'}
            className={`cyber-button px-4 py-2 ${
              currentJob?.status === 'running' ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        
        {currentJob?.status === 'running' && (
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-yellow-400 font-ui text-center"
          >
            🤖 Processing mission... Please standby
          </motion.p>
        )}
      </form>
    </div>
  );
}
