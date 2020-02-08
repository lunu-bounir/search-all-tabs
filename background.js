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
  }
  else if (request.method === 'get') {
    response(cache[sender.tab.id]);
    cache[sender.tab.id];
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

// FAQs and Feedback
{
  const {onInstalled, setUninstallURL, getManifest} = chrome.runtime;
  const {name, version} = getManifest();
  const page = getManifest().homepage_url;
  onInstalled.addListener(({reason, previousVersion}) => {
    chrome.storage.local.get({
      'faqs': true,
      'last-update': 0
    }, prefs => {
      if (reason === 'install' || (prefs.faqs && reason === 'update')) {
        const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
        if (doUpdate && previousVersion !== version) {
          chrome.tabs.create({
            url: page + '?version=' + version +
              (previousVersion ? '&p=' + previousVersion : '') +
              '&type=' + reason,
            active: reason === 'install'
          });
          chrome.storage.local.set({'last-update': Date.now()});
        }
      }
    });
  });
  setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
}
