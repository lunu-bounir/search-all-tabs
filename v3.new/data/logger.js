/**
 * Stack-based Logger with persistent file logging
 * Maintains a LIFO stack with automatic memory management
 */

class FileLogger {
  constructor(context = 'UNKNOWN', maxLogSize = 2048, maxEntries = 100) {
    this.context = context;
    this.maxLogSize = maxLogSize; // 2KB default
    this.maxEntries = maxEntries;
    this.logs = [];
    this.currentLogSize = 0;
  }

  /**
   * Add a log entry with automatic memory management
   */
  addEntry(level, message, ...args) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const argsStr = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ') : '';
    
    const entry = `[${timestamp}] ${this.context}/${level}: ${message}${argsStr}`;
    
    // Add to stack (LIFO - newest entries at end)
    this.logs.push(entry);
    this.currentLogSize += entry.length;
    
    // Automatic cleanup - remove oldest entries if over limits
    while (this.currentLogSize > this.maxLogSize || this.logs.length > this.maxEntries) {
      const removedEntry = this.logs.shift(); // Remove oldest
      if (removedEntry) {
        this.currentLogSize -= removedEntry.length;
      }
    }
  }

  /**
   * Log levels with console forwarding
   */
  debug(message, ...args) {
    this.addEntry('DEBUG', message, ...args);
    console.debug(`🔧 [${this.context}] ${message}`, ...args);
  }

  info(message, ...args) {
    this.addEntry('INFO', message, ...args);
    console.info(`ℹ️ [${this.context}] ${message}`, ...args);
  }

  warn(message, ...args) {
    this.addEntry('WARN', message, ...args);
    console.warn(`⚠️ [${this.context}] ${message}`, ...args);
  }

  error(message, ...args) {
    this.addEntry('ERROR', message, ...args);
    console.error(`❌ [${this.context}] ${message}`, ...args);
  }

  log(message, ...args) {
    this.addEntry('LOG', message, ...args);
    console.log(`📝 [${this.context}] ${message}`, ...args);
  }

  /**
   * Get current log statistics
   */
  getStats() {
    return {
      totalEntries: this.logs.length,
      currentSize: this.currentLogSize,
      maxSize: this.maxLogSize,
      maxEntries: this.maxEntries,
      utilizationPercent: Math.round((this.currentLogSize / this.maxLogSize) * 100)
    };
  }

  /**
   * Download logs as a file
   */
  downloadLogs(filename = null) {
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `search-all-tabs-debug-${this.context.toLowerCase()}-${timestamp}.log`;
    }

    const logContent = this.logs.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  /**
   * Clear all logs
   */
  clear() {
    this.logs = [];
    this.currentLogSize = 0;
    this.info('Log stack cleared');
  }

  /**
   * Get recent logs (newest first)
   */
  getRecentLogs(count = 50) {
    return this.logs.slice(-count).reverse();
  }

  /**
   * Display stack debugging info
   */
  showStack() {
    const stack = new Error().stack;
    console.log('📊 Logger Stack Trace:', stack);
  }
}

// Create context-aware logger instances
let logger;

// Detect context based on current location
if (typeof window !== 'undefined') {
  const path = window.location.pathname;
  let context = 'UNKNOWN';
  
  if (path.includes('/popup/')) {
    context = 'POPUP';
  } else if (path.includes('/options/')) {
    context = 'OPTIONS';
  } else if (path.includes('/background/')) {
    context = 'BACKGROUND';
  } else {
    context = 'CONTENT';
  }
  
  logger = new FileLogger(context);
  
  // Make logger globally available
  window.logger = logger;
  
  // Add debug controls to options page
  if (context === 'OPTIONS') {
    document.addEventListener('DOMContentLoaded', () => {
      addDebugControls();
    });
  }
}

/**
 * Add debug control buttons to options page
 */
function addDebugControls() {
  const toast = document.getElementById('toast');
  if (!toast) return;
  
  const debugSection = document.createElement('div');
  debugSection.innerHTML = `
    <h3>Debug Logging</h3>
    <p>Manage debug logs with stack-based memory management (2KB limit)</p>
    <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
      <button id="download-logs" type="button">Download Logs</button>
      <button id="clear-logs" type="button">Clear Logs</button>
      <span id="log-stats" style="font-size: 0.9em; color: #666;"></span>
    </div>
  `;
  
  // Insert before the save button
  const saveButton = document.getElementById('save');
  saveButton.parentNode.insertBefore(debugSection, saveButton.parentNode);
  
  // Event listeners
  document.getElementById('download-logs').addEventListener('click', () => {
    logger.downloadLogs();
    toast.textContent = 'Debug logs downloaded';
    setTimeout(() => toast.textContent = '', 2000);
  });
  
  document.getElementById('clear-logs').addEventListener('click', () => {
    logger.clear();
    updateLogStats();
    toast.textContent = 'Debug logs cleared';
    setTimeout(() => toast.textContent = '', 2000);
  });
  
  // Update stats display
  function updateLogStats() {
    const stats = logger.getStats();
    const statsEl = document.getElementById('log-stats');
    if (statsEl) {
      statsEl.textContent = `${stats.totalEntries} entries, ${stats.currentSize}/${stats.maxSize} bytes (${stats.utilizationPercent}%)`;
    }
  }
  
  // Initial stats update and periodic refresh
  updateLogStats();
  setInterval(updateLogStats, 5000);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FileLogger;
}