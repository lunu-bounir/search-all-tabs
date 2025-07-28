# Search All Tabs - Code Flow Diagram

## Architecture Overview

```mermaid
graph TB
    %% User Interface Layer
    User[👤 User] --> Action1[Click Extension Icon]
    User --> Action2[Configure Options]
    User --> Action3[Search Query]
    
    %% Entry Points
    Action1 --> PopupHTML[📄 data/popup/index.html]
    Action2 --> OptionsHTML[📄 data/options/index.html]
    
    %% Background Service Worker
    Worker[🔧 worker.js<br/>Background Service Worker] --> WorkerMethods{Worker Methods}
    WorkerMethods --> FindTab[find: Focus Active Tab]
    WorkerMethods --> DeleteTab[delete: Close Tabs]
    WorkerMethods --> GroupTab[group: Create Window]
    
    %% Core Application Files
    PopupHTML --> PopupJS[📜 data/popup/index.js<br/>UI Controller]
    PopupJS --> IndexerJS[📜 data/popup/indexer.js<br/>Core Indexing Logic]
    
    %% Search Engine
    IndexerJS --> XapianConnect[📜 data/xapian/connect.js<br/>Search Engine Interface]
    XapianConnect --> XapianWASM[📦 xapian_noexception_wasm_db.js<br/>WebAssembly Search Engine]
    
    %% Configuration
    OptionsHTML --> OptionsJS[📜 data/options/index.js<br/>Settings Controller]
    OptionsJS --> ChromeStorage[(🗄️ Chrome Storage<br/>Local Settings)]
    
    %% Data Sources
    IndexerJS --> TabsAPI[🌐 chrome.tabs API<br/>Active Tabs]
    IndexerJS --> HistoryAPI[🕒 chrome.history API<br/>Browser History]
    IndexerJS --> ContentScript[📜 data/collect.js<br/>Content Extraction]
    
    %% Storage Systems
    XapianConnect --> IndexedDB[(💾 IndexedDB<br/>Search Index)]
    ChromeStorage --> IndexerJS
    
    %% Data Flow
    TabsAPI --> ProcessTabs[Process Active Tabs]
    HistoryAPI --> ProcessHistory[Process History Items]
    ProcessTabs --> ContentScript
    ProcessHistory --> HTTPFetch[HTTP Fetch Content]
    ContentScript --> IndexContent[Index Content]
    HTTPFetch --> IndexContent
    IndexContent --> XapianConnect
    
    %% Search Flow
    Action3 --> SearchQuery[Search Processing]
    SearchQuery --> XapianConnect
    XapianConnect --> SearchResults[Display Results]
    SearchResults --> PopupJS
    
    %% Styling
    classDef entrypoint fill:#e1f5fe,stroke:#0277bd,stroke-width:2px
    classDef core fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef api fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef storage fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef user fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    
    class PopupHTML,OptionsHTML entrypoint
    class PopupJS,IndexerJS,XapianConnect core
    class TabsAPI,HistoryAPI,ContentScript api
    class ChromeStorage,IndexedDB,XapianWASM storage
    class User user
```

## Detailed Function Flow

```mermaid
sequenceDiagram
    participant U as User
    participant P as Popup (index.js)
    participant I as Indexer (indexer.js)
    participant X as Xapian (connect.js)
    participant T as chrome.tabs
    participant H as chrome.history
    participant C as Content Script
    participant S as Storage
    
    Note over U,S: 🚀 Extension Initialization
    U->>P: Click extension icon
    P->>I: Initialize indexer.prepare()
    I->>S: Load preferences
    I->>I: queryTabs() + queryHistory()
    I->>T: chrome.tabs.query()
    I->>H: chrome.history.search()
    
    Note over U,S: 📊 Content Indexing Phase
    par Active Tabs Processing
        I->>T: Get active tabs
        I->>C: Inject content script
        C-->>I: Return extracted content
    and History Processing
        I->>H: Get history items
        I->>I: inspectHistory() - HTTP fetch
        I-->>I: Parse HTML content
    end
    
    I->>X: xapian.add(tasks)
    X->>X: Index content in Xapian
    X-->>P: Indexing complete event
    
    Note over U,S: 🔍 Search Phase
    U->>P: Enter search query
    P->>X: xapian.search({query, lang, length})
    X->>X: Perform full-text search
    X-->>P: Return search results
    P->>P: Render results with visual indicators
    
    Note over U,S: 🎯 Result Interaction
    U->>P: Click search result
    alt History Item (tabId=-1)
        P->>T: chrome.tabs.create({url})
    else Active Tab
        P->>Worker: Send 'find' message
        Worker->>T: chrome.tabs.update(focus)
    end
```

## Key Function Entry Points

```mermaid
mindmap
  root((🔧 Entry Points))
    🎯 User Actions
      Click Extension Icon
        ::icon(fa fa-mouse-pointer)
      Configure Options
        ::icon(fa fa-cog)
      Search Query Input
        ::icon(fa fa-search)
    📜 Core Functions
      indexer.prepare()
        Load Preferences
        Initialize Settings
      indexer.query()
        Query Active Tabs
        Process Tab Data
      indexer.queryHistory()
        Query Browser History
        HTTP Content Fetch
      xapian.search()
        Full-text Search
        Result Ranking
    🔄 Background Events
      chrome.tabs.onRemoved
        Clean Cache
      chrome.runtime.onMessage
        Handle Tab Operations
      engine-ready Event
        Update UI State
```

## Debug Logging Strategy

The following console.debug logs have been added to trace execution flow:

### 🎯 Entry Points
- `🚀 Extension popup opened - engine ready event received`
- `⚙️ Options page loaded with settings:`
- `🔍 Search query entered:`

### 📊 Indexing Flow
- `🔧 Indexer.prepare() - Loading preferences`
- `⚙️ Indexer preferences loaded:`
- `📋 Found X active tabs, Y history items to process`
- `🔄 Processing batch X/Y (items N-M)`
- `✅ Indexed history item/tab: URL (N documents)`
- `🎉 Indexing complete! Indexed X documents, ignored Y items`

### 🕒 History Processing
- `🕒 History search disabled` / `🕒 Querying browser history: X days back, max Y results`
- `📖 Found X history items`
- `📡 Fetching content for history item: URL`
- `✅ History content parsed: TITLE (X chars)`
- `❌ Cannot fetch content for history item: URL`

### 🔍 Search Operations
- `🎯 Search started: QUERY in LANG language`
- `📊 Search results: X found, Y estimated`
- `🏷️ Result N: TITLE (X% match) [history/tab]`

### 🎮 User Interactions
- `👆 Opening history item in new tab: URL`
- `👆 Focusing active tab: TAB_ID URL`
- `🔧 Background worker received message: METHOD`
- `⚙️ Saving extension settings:`

## How to View Debug Logs

1. **Open Browser Developer Tools**:
   - **Chrome**: F12 or right-click → Inspect → Console tab
   - **Firefox**: F12 or right-click → Inspect Element → Console tab

2. **View Extension Console Logs**:
   - **For popup logs**: Open extension popup, then open DevTools
   - **For options logs**: Open extension options page, then open DevTools  
   - **For background worker logs**: Go to `chrome://extensions/` → Extension details → Service worker → inspect → Console

3. **Filter Debug Logs**:
   - In console, type: `console.debug` to see only debug messages
   - Look for emoji prefixes to identify different components:
     - 🚀 = Extension startup
     - 🔧 = Indexer operations
     - 🕒 = History processing
     - 🎯 = Search operations
     - 👆 = User interactions
     - ⚙️ = Settings/configuration

4. **Real-time Monitoring**:
   - Keep DevTools open while using the extension
   - Watch the console as you search, configure settings, etc.
   - Debug logs will show the complete execution flow