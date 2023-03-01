// Context Menu
{
  const create = o => chrome.contextMenus.create(o, () => {
    chrome.runtime.lastError;
  });

  const startup = () => chrome.storage.local.get({
    'mode': 'none',
    'scope': 'both',
    'index': 'browser', // 'browser', 'window', tab'
    'engine': 'xapian',
    'strict': false,
    'duplicates': true,
    'parse-pdf': true,
    'fetch-timeout': 10000, // ms
    'max-content-length': 100 * 1024, // bytes
    'search-size': 30,
    'snippet-size': 300,
    'highlight-color': 'orange',
    'open-mode': 'popup'
  }, prefs => {
    create({
      id: 'automatic-search',
      title: 'Auto Search',
      contexts: ['action']
    });
    create({
      type: 'radio',
      id: 'mode:selectedORhistory',
      title: 'Selected text or last query',
      contexts: ['action'],
      checked: prefs.mode === 'selectedORhistory',
      parentId: 'automatic-search'
    });
    create({
      type: 'radio',
      id: 'mode:selected',
      title: 'Selected Text',
      contexts: ['action'],
      checked: prefs.mode === 'selected',
      parentId: 'automatic-search'
    });
    create({
      type: 'radio',
      id: 'mode:history',
      title: 'The last Query',
      contexts: ['action'],
      checked: prefs.mode === 'history',
      parentId: 'automatic-search'
    });
    create({
      type: 'radio',
      id: 'mode:none',
      title: 'Turn off Automatic Search',
      contexts: ['action'],
      checked: prefs.mode === 'none',
      parentId: 'automatic-search'
    });

    create({
      id: 'search-scope',
      title: 'Search Scope',
      contexts: ['action']
    });
    create({
      type: 'radio',
      id: 'scope:title',
      title: 'Only index page title',
      contexts: ['action'],
      checked: prefs.scope === 'title',
      parentId: 'search-scope'
    });
    create({
      type: 'radio',
      id: 'scope:body',
      title: 'Only index page content',
      contexts: ['action'],
      checked: prefs.scope === 'body',
      parentId: 'search-scope'
    });
    create({
      type: 'radio',
      id: 'scope:both',
      title: 'Index both page body and title',
      contexts: ['action'],
      checked: prefs.scope === 'both',
      parentId: 'search-scope'
    });

    create({
      id: 'search-index',
      title: 'Search Crawler',
      contexts: ['action']
    });
    create({
      type: 'radio',
      id: 'index:window',
      title: 'Only index current window',
      contexts: ['action'],
      checked: prefs.index === 'window',
      parentId: 'search-index'
    });
    create({
      type: 'radio',
      id: 'index:tab',
      title: 'Only index current tab',
      contexts: ['action'],
      checked: prefs.index === 'tab',
      parentId: 'search-index'
    });
    create({
      type: 'radio',
      id: 'index:browser',
      title: 'Index all windows',
      contexts: ['action'],
      checked: prefs.index === 'browser',
      parentId: 'search-index'
    });

    create({
      id: 'search-engine',
      title: 'Search Engine',
      contexts: ['action']
    });
    create({
      type: 'radio',
      id: 'engine:lunr',
      title: 'lunr.js',
      contexts: ['action'],
      checked: prefs.engine === 'lunr',
      parentId: 'search-engine'
    });
    create({
      type: 'radio',
      id: 'engine:xapian',
      title: 'xapian.js (recommended)',
      contexts: ['action'],
      checked: prefs.engine === 'xapian',
      parentId: 'search-engine'
    });

    create({
      id: 'options',
      title: 'Options',
      contexts: ['action']
    });

    create({
      type: 'checkbox',
      id: 'strict',
      title: 'Always Try to Scroll to a Matching Result',
      contexts: ['action'],
      checked: prefs.strict,
      parentId: 'options'
    });
    create({
      type: 'checkbox',
      id: 'duplicates',
      title: 'Ignore Duplicated Tabs',
      contexts: ['action'],
      checked: prefs.duplicates,
      parentId: 'options'
    });
    create({
      type: 'checkbox',
      id: 'parse-pdf',
      title: 'Include PDF Files (parse with PDF.js)',
      contexts: ['action'],
      checked: prefs['parse-pdf'],
      parentId: 'options'
    });
    create({
      id: 'fetch-timeout',
      title: 'Wait for Indexing',
      contexts: ['action'],
      parentId: 'options'
    });
    create({
      type: 'radio',
      id: 'fetch-timeout-1000',
      title: '1 second',
      contexts: ['action'],
      checked: prefs['fetch-timeout'] === 1000,
      parentId: 'fetch-timeout'
    });
    create({
      type: 'radio',
      id: 'fetch-timeout-5000',
      title: '5 seconds',
      contexts: ['action'],
      checked: prefs['fetch-timeout'] === 5000,
      parentId: 'fetch-timeout'
    });
    create({
      type: 'radio',
      id: 'fetch-timeout-10000',
      title: '10 seconds',
      contexts: ['action'],
      checked: prefs['fetch-timeout'] === 10000,
      parentId: 'fetch-timeout'
    });
    create({
      type: 'radio',
      id: 'fetch-timeout-30000',
      title: '30 seconds',
      contexts: ['action'],
      checked: prefs['fetch-timeout'] === 30000,
      parentId: 'fetch-timeout'
    });
    create({
      type: 'radio',
      id: 'fetch-timeout-60000',
      title: '1 minute',
      contexts: ['action'],
      checked: prefs['fetch-timeout'] === 60000,
      parentId: 'fetch-timeout'
    });
    create({
      id: 'max-content-length',
      title: 'Maximum Size of Each Content',
      contexts: ['action'],
      parentId: 'options'
    });
    create({
      type: 'radio',
      id: 'max-content-length-1024',
      title: '1 KB',
      contexts: ['action'],
      checked: prefs['max-content-length'] === 1024,
      parentId: 'max-content-length'
    });
    create({
      type: 'radio',
      id: 'max-content-length-5120',
      title: '5 KB',
      contexts: ['action'],
      checked: prefs['max-content-length'] === 5120,
      parentId: 'max-content-length'
    });
    create({
      type: 'radio',
      id: 'max-content-length-10240',
      title: '10 KB',
      contexts: ['action'],
      checked: prefs['max-content-length'] === 10240,
      parentId: 'max-content-length'
    });
    create({
      type: 'radio',
      id: 'max-content-length-102400',
      title: '100 KB',
      contexts: ['action'],
      checked: prefs['max-content-length'] === 102400,
      parentId: 'max-content-length'
    });
    create({
      type: 'radio',
      id: 'max-content-length-512000',
      title: '500 KB',
      contexts: ['action'],
      checked: prefs['max-content-length'] === 512000,
      parentId: 'max-content-length'
    });
    create({
      type: 'radio',
      id: 'max-content-length-1048576',
      title: '1 MB',
      contexts: ['action'],
      checked: prefs['max-content-length'] === 1048576,
      parentId: 'max-content-length'
    });
    create({
      type: 'radio',
      id: 'max-content-length--1',
      title: 'No Limit (not recommended)',
      contexts: ['action'],
      checked: prefs['max-content-length'] === -1,
      parentId: 'max-content-length'
    });
    create({
      id: 'search',
      title: 'Search Size',
      contexts: ['action'],
      checked: prefs.duplicates,
      parentId: 'options'
    });
    create({
      type: 'radio',
      id: 'search:10',
      title: '10 results',
      contexts: ['action'],
      checked: prefs['search-size'] === 10,
      parentId: 'search'
    });
    create({
      type: 'radio',
      id: 'search:30',
      title: '30 results',
      contexts: ['action'],
      checked: prefs['search-size'] === 30,
      parentId: 'search'
    });
    create({
      type: 'radio',
      id: 'search:60',
      title: '60 results',
      contexts: ['action'],
      checked: prefs['search-size'] === 60,
      parentId: 'search'
    });
    create({
      id: 'snippet',
      title: 'Snippet Size',
      contexts: ['action'],
      parentId: 'options'
    });
    create({
      type: 'radio',
      id: 'snippet:100',
      title: '100 words',
      contexts: ['action'],
      checked: prefs['snippet-size'] === 100,
      parentId: 'snippet'
    });
    create({
      type: 'radio',
      id: 'snippet:300',
      title: '300 words',
      contexts: ['action'],
      checked: prefs['snippet-size'] === 300,
      parentId: 'snippet'
    });
    create({
      type: 'radio',
      id: 'snippet:600',
      title: '600 words',
      contexts: ['action'],
      checked: prefs['snippet-size'] === 600,
      parentId: 'snippet'
    });
    create({
      id: 'highlight',
      title: 'Highlight Color',
      contexts: ['action'],
      parentId: 'options'
    });
    create({
      type: 'radio',
      id: 'highlight:green',
      title: 'Green',
      contexts: ['action'],
      checked: prefs['highlight-color'] === 'green',
      parentId: 'highlight'
    });
    create({
      type: 'radio',
      id: 'highlight:orange',
      title: 'Orange',
      contexts: ['action'],
      checked: prefs['highlight-color'] === 'orange',
      parentId: 'highlight'
    });
    create({
      type: 'radio',
      id: 'highlight:pink',
      title: 'Pink',
      contexts: ['action'],
      checked: prefs['highlight-color'] === 'pink',
      parentId: 'highlight'
    });
    create({
      type: 'radio',
      id: 'highlight:yellow',
      title: 'Yellow',
      contexts: ['action'],
      checked: prefs['highlight-color'] === 'yellow',
      parentId: 'highlight'
    });
    create({
      type: 'radio',
      id: 'highlight:blue',
      title: 'Blue',
      contexts: ['action'],
      checked: prefs['highlight-color'] === 'blue',
      parentId: 'highlight'
    });
    create({
      type: 'radio',
      id: 'highlight:nocolor',
      title: 'No Color',
      contexts: ['action'],
      checked: prefs['highlight-color'] === 'nocolor',
      parentId: 'highlight'
    });
    create({
      id: 'open-mode',
      title: 'Open Mode',
      contexts: ['action'],
      parentId: 'options'
    });
    create({
      type: 'radio',
      id: 'open-mode:popup',
      title: 'Popup',
      contexts: ['action'],
      checked: prefs['open-mode'] === 'popup',
      parentId: 'open-mode'
    });
    create({
      type: 'radio',
      id: 'open-mode:tab',
      title: 'Tab',
      contexts: ['action'],
      checked: prefs['open-mode'] === 'tab',
      parentId: 'open-mode'
    });

    create({
      id: 'preview',
      title: 'How to Use',
      contexts: ['action']
    });
  });
  chrome.runtime.onStartup.addListener(startup);
  chrome.runtime.onInstalled.addListener(startup);
}
chrome.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId === 'strict' || info.menuItemId === 'duplicates' || info.menuItemId === 'parse-pdf') {
    chrome.storage.local.set({
      [info.menuItemId]: info.checked
    });
  }
  else if (info.menuItemId.startsWith('fetch-timeout-')) {
    const timeout = Number(info.menuItemId.replace('fetch-timeout-', ''));
    chrome.storage.local.set({
      'fetch-timeout': timeout
    });
  }
  else if (info.menuItemId.startsWith('max-content-length-')) {
    const bytes = Number(info.menuItemId.replace('max-content-length-', ''));
    chrome.storage.local.set({
      'max-content-length': bytes
    });
  }
  else if (info.menuItemId === 'preview') {
    chrome.tabs.create({
      url: 'https://www.youtube.com/watch?v=ks0PDxFBrA0'
    });
  }
  else if (info.menuItemId.startsWith('scope:')) {
    chrome.storage.local.set({
      scope: info.menuItemId.replace('scope:', '')
    });
  }
  else if (info.menuItemId.startsWith('index:')) {
    chrome.storage.local.set({
      index: info.menuItemId.replace('index:', '')
    });
  }
  else if (info.menuItemId.startsWith('engine:')) {
    chrome.storage.local.set({
      engine: info.menuItemId.replace('engine:', '')
    });
  }
  else if (info.menuItemId.startsWith('search:')) {
    chrome.storage.local.set({
      'search-size': Number(info.menuItemId.replace('search:', ''))
    });
  }
  else if (info.menuItemId.startsWith('snippet:')) {
    chrome.storage.local.set({
      'snippet-size': Number(info.menuItemId.replace('snippet:', ''))
    });
  }
  else if (info.menuItemId.startsWith('highlight:')) {
    chrome.storage.local.set({
      'highlight-color': info.menuItemId.replace('highlight:', '')
    });
  }
  else if (info.menuItemId.startsWith('open-mode:')) {
    chrome.storage.local.set({
      'open-mode': info.menuItemId.replace('open-mode:', '')
    });
  }
  else {
    chrome.storage.local.set({
      mode: info.menuItemId.replace('mode:', '')
    });
  }
});
