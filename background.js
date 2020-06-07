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
    if (request.snippet) {
      cache[request.tabId] = request;
      chrome.tabs.executeScript(request.tabId, {
        file: 'data/highlight.js',
        runAt: 'document_start',
        allFrames: true
      }, () => chrome.runtime.lastError);
    }
    response();
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
      }
    });
  }
});

// Contextmenu
{
  const startup = () => chrome.storage.local.get({
    mode: 'selected'
  }, prefs => {
    chrome.contextMenus.create({
      type: 'radio',
      id: 'mode:selected',
      title: 'Automatically Search the Selected Text',
      contexts: ['browser_action'],
      checked: prefs.mode === 'selected'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'mode:history',
      title: 'Automatically Search the last Query',
      contexts: ['browser_action'],
      checked: prefs.mode === 'history'
    });
    chrome.contextMenus.create({
      type: 'radio',
      id: 'mode:none',
      title: 'Turn off Automatic Seach',
      contexts: ['browser_action'],
      checked: prefs.mode === 'none'
    });
  });
  chrome.runtime.onStartup.addListener(startup);
  chrome.runtime.onInstalled.addListener(startup);
}
chrome.contextMenus.onClicked.addListener(info => chrome.storage.local.set({
  mode: info.menuItemId.replace('mode:', '')
}));

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
            tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install'
            });
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
