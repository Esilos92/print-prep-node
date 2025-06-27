const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logFile = path.join(__dirname, '..', 'logs', 'system.log');
    this.ensureLogDir();
  }
  
  ensureLogDir() {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }
  
  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    
    if (data) {
      return `${logMessage} ${JSON.stringify(data)}`;
    }
    return logMessage;
  }
  
  log(level, message, data = null) {
    const formattedMessage = this.formatMessage(level, message, data);
    
    // Console output with colors
    const colors = {
      info: '\x1b[36m',    // cyan
      warn: '\x1b[33m',    // yellow
      error: '\x1b[31m',   // red
      success: '\x1b[32m', // green
      reset: '\x1b[0m'
    };
    
    console.log(`${colors[level] || ''}${formattedMessage}${colors.reset}`);
    
    // File output
    fs.appendFileSync(this.logFile, formattedMessage + '\n');
  }
  
  info(message, data) { this.log('info', message, data); }
  warn(message, data) { this.log('warn', message, data); }
  error(message, data) { this.log('error', message, data); }
  success(message, data) { this.log('success', message, data); }
}

module.exports = new Logger();
