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
        chrome.tabs.executeScript(request.tabId, {
          file: 'data/highlight.js',
          runAt: 'document_start',
          allFrames: true
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

// Contextmenu
{
  const startup = () => chrome.storage.local.get({
    mode: 'none',
    scope: 'both',
    engine: 'xapian',
    strict: false
  }, prefs => {
    chrome.contextMenus.create({
      id: 'automatic-search',
      title: 'Search for',
      contexts: ['browser_action']
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'mode:selected',
      title: 'Selected Text',
      contexts: ['browser_action'],
      checked: prefs.mode === 'selected',
      parentId: 'automatic-search'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'mode:history',
      title: 'The last Query',
      contexts: ['browser_action'],
      checked: prefs.mode === 'history',
      parentId: 'automatic-search'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'mode:none',
      title: 'Turn off Automatic Search',
      contexts: ['browser_action'],
      checked: prefs.mode === 'none',
      parentId: 'automatic-search'
    });

    chrome.contextMenus.create({
      id: 'search-scope',
      title: 'Search Scope',
      contexts: ['browser_action']
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'scope:title',
      title: 'Only index page title',
      contexts: ['browser_action'],
      checked: prefs.scope === 'title',
      parentId: 'search-scope'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'scope:body',
      title: 'Only index page content',
      contexts: ['browser_action'],
      checked: prefs.scope === 'body',
      parentId: 'search-scope'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'scope:both',
      title: 'Index both page body and title',
      contexts: ['browser_action'],
      checked: prefs.scope === 'both',
      parentId: 'search-scope'
    });

    chrome.contextMenus.create({
      id: 'search-engine',
      title: 'Search Engine',
      contexts: ['browser_action']
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'engine:lunr',
      title: 'lunr.js',
      contexts: ['browser_action'],
      checked: prefs.engine === 'lunr',
      parentId: 'search-engine'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'engine:xapian',
      title: 'xapian.js',
      contexts: ['browser_action'],
      checked: prefs.engine === 'xapian',
      parentId: 'search-engine'
    });

    chrome.contextMenus.create({
      type: 'checkbox',
      id: 'strict',
      title: 'Always try to scroll to a matching result',
      contexts: ['browser_action'],
      checked: prefs.strict
    });
  });
  chrome.runtime.onStartup.addListener(startup);
  chrome.runtime.onInstalled.addListener(startup);
}
chrome.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId === 'strict') {
    chrome.storage.local.set({
      strict: info.checked
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
              index: tbs ? tbs[0].index + 1 : undefined
            }));
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
