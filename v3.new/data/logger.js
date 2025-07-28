/**
 * Unified Logger with Chrome messaging API
 * Centralizes logging from all extension contexts
 */

class UnifiedLogger {
  constructor(context = 'UNKNOWN', maxLogSize = 4096, maxEntries = 200) {
    this.context = context;
    this.maxLogSize = maxLogSize; // 4KB default for unified system
    this.maxEntries = maxEntries;
    this.isServiceWorker = typeof chrome !== 'undefined' && chrome.runtime && !chrome.tabs;
    this.isPopup = typeof window !== 'undefined' && window.location && window.location.pathname.includes('/popup/');
    
    // Initialize storage for central log collection
    this.initializeStorage();
  }

  /**
   * Initialize central storage for all logs
   */
  async initializeStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await new Promise(resolve => 
          chrome.storage.local.get(['unifiedLogs'], resolve)
        );
        if (!result.unifiedLogs) {
          await new Promise(resolve => 
            chrome.storage.local.set({ unifiedLogs: [] }, resolve)
          );
        }
      } catch (e) {
        console.warn('Failed to initialize unified logging storage:', e);
      }
    }
  }

  /**
   * Send log entry to central storage via messaging
   */
  async sendLogEntry(level, message, ...args) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const argsStr = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ') : '';
    
    const entry = `[${timestamp}] ${this.context}/${level.toUpperCase()}: ${message}${argsStr}`;
    
    // Store in chrome.storage for persistence
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await new Promise(resolve => 
          chrome.storage.local.get(['unifiedLogs'], resolve)
        );
        
        const logs = result.unifiedLogs || [];
        logs.push({
          timestamp: Date.now(),
          context: this.context,
          level: level.toUpperCase(),
          entry: entry
        });
        
        // Keep only recent entries to prevent storage overflow
        if (logs.length > this.maxEntries) {
          logs.splice(0, logs.length - this.maxEntries);
        }
        
        await new Promise(resolve => 
          chrome.storage.local.set({ unifiedLogs: logs }, resolve)
        );
      } catch (e) {
        // Fallback to console if storage fails
        console.warn('Failed to store unified log:', e);
      }
    }
    
    // Also try to send to popup if it's open (for real-time display)
    if (typeof chrome !== 'undefined' && chrome.runtime && !this.isPopup) {
      try {
        chrome.runtime.sendMessage({
          method: 'unified-log',
          context: this.context,
          level: level,
          message: message,
          args: args,
          entry: entry
        }).catch(() => {
          // Popup might not be open, that's fine
        });
      } catch (e) {
        // Runtime might not be available
      }
    }
  }

  /**
   * Log levels with unified messaging
   */
  debug(message, ...args) {
    this.sendLogEntry('debug', message, ...args);
    console.debug(`🔧 [${this.context}] ${message}`, ...args);
  }

  info(message, ...args) {
    this.sendLogEntry('info', message, ...args);
    console.info(`ℹ️ [${this.context}] ${message}`, ...args);
  }

  warn(message, ...args) {
    this.sendLogEntry('warn', message, ...args);
    console.warn(`⚠️ [${this.context}] ${message}`, ...args);
  }

  error(message, ...args) {
    this.sendLogEntry('error', message, ...args);
    console.error(`❌ [${this.context}] ${message}`, ...args);
  }

  log(message, ...args) {
    this.sendLogEntry('log', message, ...args);
    console.log(`📝 [${this.context}] ${message}`, ...args);
  }

  /**
   * Get current unified log statistics
   */
  async getStats() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await new Promise(resolve => 
          chrome.storage.local.get(['unifiedLogs'], resolve)
        );
        const logs = result.unifiedLogs || [];
        const contexts = [...new Set(logs.map(log => log.context))];
        const totalSize = logs.reduce((size, log) => size + log.entry.length, 0);
        
        return {
          totalEntries: logs.length,
          contexts: contexts.length,
          contextList: contexts,
          currentSize: totalSize,
          maxSize: this.maxLogSize,
          maxEntries: this.maxEntries,
          utilizationPercent: Math.round((totalSize / this.maxLogSize) * 100)
        };
      } catch (e) {
        console.warn('Could not get unified log stats:', e);
      }
    }
    
    return {
      totalEntries: 0,
      contexts: 0,
      contextList: [],
      currentSize: 0,
      maxSize: this.maxLogSize,
      maxEntries: this.maxEntries,
      utilizationPercent: 0
    };
  }

  /**
   * Download all unified logs as a file
   */
  async downloadLogs(filename = null) {
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `search-all-tabs-unified-debug-${timestamp}.log`;
    }

    let logContent = '=== UNIFIED EXTENSION LOGS ===\n';
    logContent += `Generated: ${new Date().toISOString()}\n\n`;
    
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await new Promise(resolve => 
          chrome.storage.local.get(['unifiedLogs'], resolve)
        );
        
        const logs = result.unifiedLogs || [];
        if (logs.length > 0) {
          // Group logs by context
          const contextGroups = {};
          logs.forEach(log => {
            if (!contextGroups[log.context]) {
              contextGroups[log.context] = [];
            }
            contextGroups[log.context].push(log);
          });
          
          // Sort and output by context
          Object.keys(contextGroups).sort().forEach(context => {
            logContent += `\n=== ${context} CONTEXT ===\n`;
            contextGroups[context]
              .sort((a, b) => a.timestamp - b.timestamp)
              .forEach(log => {
                logContent += log.entry + '\n';
              });
          });
        } else {
          logContent += 'No unified logs found.\n';
        }
      } catch (e) {
        logContent += `Error loading unified logs: ${e.message}\n`;
      }
    } else {
      logContent += 'Chrome storage not available.\n';
    }
    
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  /**
   * Clear all unified logs
   */
  async clear() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        await new Promise(resolve => 
          chrome.storage.local.set({ unifiedLogs: [] }, resolve)
        );
        
        // Also clear old worker logs for cleanup
        await new Promise(resolve => 
          chrome.storage.local.remove(['workerLogs'], resolve)
        );
        
        this.info('Unified log storage cleared');
      } catch (e) {
        console.warn('Could not clear unified logs:', e);
      }
    }
  }

  /**
   * Get recent unified logs (newest first)
   */
  async getRecentLogs(count = 50) {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await new Promise(resolve => 
          chrome.storage.local.get(['unifiedLogs'], resolve)
        );
        const logs = result.unifiedLogs || [];
        return logs
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, count)
          .map(log => log.entry);
      } catch (e) {
        console.warn('Could not get recent unified logs:', e);
      }
    }
    return [];
  }

  /**
   * Display stack debugging info
   */
  showStack() {
    const stack = new Error().stack;
    console.log('📊 Logger Stack Trace:', stack);
  }

  /**
   * Test function to verify logging is working
   */
  test() {
    this.debug('Test debug message');
    this.info('Test info message');
    this.warn('Test warning message');
    this.log('Logger test completed - entries should appear in stack');
  }
}

// Create unified logger instances
let logger;

// Detect context and create appropriate logger
if (typeof chrome !== 'undefined' && chrome.runtime && !chrome.tabs) {
  // Service Worker context
  logger = new UnifiedLogger('WORKER');
} else if (typeof window !== 'undefined') {
  // Web page context - detect specific page
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
  
  logger = new UnifiedLogger(context);
  
  // Make logger globally available
  window.logger = logger;
  
  // Log initialization
  logger.info('Unified logger initialized for context:', context);
  
  // Add debug controls to options page
  if (context === 'OPTIONS') {
    document.addEventListener('DOMContentLoaded', () => {
      addDebugControls();
    });
  }
} else {
  // Fallback for content scripts or other contexts
  logger = new UnifiedLogger('CONTENT');
}

/**
 * Add debug control buttons to options page
 */
function addDebugControls() {
  const toast = document.getElementById('toast');
  if (!toast) return;
  
  const debugSection = document.createElement('div');
  debugSection.innerHTML = `
    <h3>Unified Debug Logging</h3>
    <p>Centralized logging from all extension contexts (Worker, Popup, Options, Content Scripts)</p>
    <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
      <button id="test-logs" type="button">Test Logger</button>
      <button id="download-logs" type="button">Download Unified Logs</button>
      <button id="clear-logs" type="button">Clear All Logs</button>
      <span id="log-stats" style="font-size: 0.9em; color: #666;"></span>
    </div>
  `;
  
  // Insert before the save button's paragraph
  const saveButton = document.getElementById('save');
  if (saveButton && saveButton.parentNode) {
    const saveButtonParagraph = saveButton.parentNode;
    const parentContainer = saveButtonParagraph.parentNode;
    if (parentContainer) {
      parentContainer.insertBefore(debugSection, saveButtonParagraph);
    }
  }
  
  // Event listeners
  const testButton = document.getElementById('test-logs');
  const downloadButton = document.getElementById('download-logs');
  const clearButton = document.getElementById('clear-logs');
  
  if (testButton) {
    testButton.addEventListener('click', () => {
      logger.test();
      updateLogStats();
      if (toast) toast.textContent = 'Test logs added to unified storage';
      setTimeout(() => {
        if (toast) toast.textContent = '';
      }, 2000);
    });
  }
  
  if (downloadButton) {
    downloadButton.addEventListener('click', () => {
      logger.downloadLogs();
      if (toast) toast.textContent = 'Unified debug logs downloaded';
      setTimeout(() => {
        if (toast) toast.textContent = '';
      }, 2000);
    });
  }
  
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      logger.clear();
      updateLogStats();
      if (toast) toast.textContent = 'All unified logs cleared';
      setTimeout(() => {
        if (toast) toast.textContent = '';
      }, 2000);
    });
  }
  
  // Update stats display for unified logging
  async function updateLogStats() {
    try {
      const stats = await logger.getStats();
      const statsEl = document.getElementById('log-stats');
      if (statsEl) {
        statsEl.textContent = `${stats.totalEntries} entries from ${stats.contexts} contexts (${stats.contextList.join(', ')})`;
      }
    } catch (e) {
      console.warn('Failed to update unified log stats:', e);
    }
  }
  
  // Initial stats update and periodic refresh
  updateLogStats();
  setInterval(updateLogStats, 5000);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UnifiedLogger;
}