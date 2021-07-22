'use strict';

const cache = {};
chrome.tabs.onRemoved.addListener(tabId => delete cache[tabId]);

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'find') {
    chrome.tabs.update(request.tabId, {
      active: true
    });
    chrome.windows.update(request.windowId, {
      focused: true
    });
    chrome.storage.local.get({
      strict: false
    }, prefs => {
      if (request.snippet && (request.snippet.indexOf('<b>') !== -1 || prefs.strict)) {
        cache[request.tabId] = request;
        chrome.scripting.executeScript({
          target: {
            tabId: request.tabId,
            allFrames: true
          },
          files: ['data/highlight.js']
        }, () => chrome.runtime.lastError);
      }
      response();
    });
  }
  else if (request.method === 'get') {
    response(cache[sender.tab.id]);
    cache[sender.tab.id];
  }
  else if (request.method === 'group') {
    const tabId = request.ids.shift();
    chrome.windows.create({
      tabId
    }, w => {
      if (request.ids.length) {
        chrome.tabs.move(request.ids, {
          windowId: w.id,
          index: -1
        });
        chrome.windows.update(w.id, {
          focused: true
        });
      }
    });
  }
});

// Context Menu
{
  const startup = () => chrome.storage.local.get({
    'mode': 'none',
    'scope': 'both',
    'engine': 'xapian',
    'strict': false,
    'duplicates': true,
    'parse-pdf': true,
    'search-size': 30,
    'snippet-size': 300
  }, prefs => {
    chrome.contextMenus.create({
      id: 'automatic-search',
      title: 'Auto Search',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'mode:selected',
      title: 'Selected Text',
      contexts: ['action'],
      checked: prefs.mode === 'selected',
      parentId: 'automatic-search'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'mode:history',
      title: 'The last Query',
      contexts: ['action'],
      checked: prefs.mode === 'history',
      parentId: 'automatic-search'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'mode:none',
      title: 'Turn off Automatic Search',
      contexts: ['action'],
      checked: prefs.mode === 'none',
      parentId: 'automatic-search'
    });

    chrome.contextMenus.create({
      id: 'search-scope',
      title: 'Search Scope',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'scope:title',
      title: 'Only index page title',
      contexts: ['action'],
      checked: prefs.scope === 'title',
      parentId: 'search-scope'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'scope:body',
      title: 'Only index page content',
      contexts: ['action'],
      checked: prefs.scope === 'body',
      parentId: 'search-scope'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'scope:both',
      title: 'Index both page body and title',
      contexts: ['action'],
      checked: prefs.scope === 'both',
      parentId: 'search-scope'
    });

    chrome.contextMenus.create({
      id: 'search-engine',
      title: 'Search Engine',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'engine:lunr',
      title: 'lunr.js',
      contexts: ['action'],
      checked: prefs.engine === 'lunr',
      parentId: 'search-engine'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'engine:xapian',
      title: 'xapian.js',
      contexts: ['action'],
      checked: prefs.engine === 'xapian',
      parentId: 'search-engine'
    });

    chrome.contextMenus.create({
      id: 'options',
      title: 'Options',
      contexts: ['action']
    });

    chrome.contextMenus.create({
      type: 'checkbox',
      id: 'strict',
      title: 'Always Try to Scroll to a Matching Result',
      contexts: ['action'],
      checked: prefs.strict,
      parentId: 'options'
    });
    chrome.contextMenus.create({
      type: 'checkbox',
      id: 'duplicates',
      title: 'Ignore Duplicated Tabs',
      contexts: ['action'],
      checked: prefs.duplicates,
      parentId: 'options'
    });
    chrome.contextMenus.create({
      type: 'checkbox',
      id: 'parse-pdf',
      title: 'Include PDF Files (parse with PDF.js)',
      contexts: ['action'],
      checked: prefs['parse-pdf'],
      parentId: 'options'
    });
    chrome.contextMenus.create({
      id: 'search',
      title: 'Search Size',
      contexts: ['action'],
      checked: prefs.duplicates,
      parentId: 'options'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'search:10',
      title: '10 results',
      contexts: ['action'],
      checked: prefs['search-size'] === 10,
      parentId: 'search'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'search:30',
      title: '30 results',
      contexts: ['action'],
      checked: prefs['search-size'] === 30,
      parentId: 'search'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'search:60',
      title: '60 results',
      contexts: ['action'],
      checked: prefs['search-size'] === 60,
      parentId: 'search'
    });
    chrome.contextMenus.create({
      id: 'snippet',
      title: 'Snippet Size',
      contexts: ['action'],
      checked: prefs.duplicates,
      parentId: 'options'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'snippet:100',
      title: '100 words',
      contexts: ['action'],
      checked: prefs['snippet-size'] === 100,
      parentId: 'snippet'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'snippet:300',
      title: '300 words',
      contexts: ['action'],
      checked: prefs['snippet-size'] === 300,
      parentId: 'snippet'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'snippet:600',
      title: '600 words',
      contexts: ['action'],
      checked: prefs['snippet-size'] === 600,
      parentId: 'snippet'
    });

    chrome.contextMenus.create({
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
  else {
    chrome.storage.local.set({
      mode: info.menuItemId.replace('mode:', '')
    });
  }
});

/* FAQs & Feedback */
{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const page = getManifest().homepage_url;
    const {name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.query({active: true, currentWindow: true}, tbs => tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install',
              ...(tbs && tbs.length && {index: tbs[0].index + 1})
            }));
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
