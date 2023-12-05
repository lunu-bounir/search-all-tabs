'use strict';

self.importScripts('context.js');

const isFF = /Firefox/.test(navigator.userAgent);

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
      if (request.snippet && (request.snippet.includes('<b>') || prefs.strict)) {
        cache[request.tabId] = request;
        chrome.scripting.executeScript({
          target: {
            tabId: request.tabId,
            allFrames: true
          },
          files: ['/data/highlight.js']
        }, () => chrome.runtime.lastError);
      }
      try {
        response();
      }
      catch (e) {}
    });

    return true;
  }
  else if (request.method === 'get') {
    response(cache[sender.tab.id]);
    cache[sender.tab.id];
  }
  else if (request.method === 'delete') {
    chrome.tabs.remove(request.ids);
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

/* action */
chrome.action.onClicked.addListener(tab => chrome.tabs.create({
  url: `/data/popup/index.html?mode=tab`,
  index: tab.index + 1
}));
{
  const startup = () => chrome.storage.local.get({
    'open-mode': 'popup'
  }, prefs => {
    chrome.action.setPopup({
      popup: prefs['open-mode'] === 'popup' ? '/data/popup/index.html' : ''
    });
  });
  chrome.runtime.onStartup.addListener(startup);
  chrome.runtime.onInstalled.addListener(startup);
}
chrome.storage.onChanged.addListener(ps => {
  if (ps['open-mode']) {
    chrome.action.setPopup({
      popup: ps['open-mode'].newValue === 'popup' ? '/data/popup/index.html' : ''
    });
  }
});

/* clear database */
if (indexedDB.databases === undefined) {
  indexedDB.databases = function() {
    return new Promise(resolve => {
      const dbs = [];
      for (const [name, value] of Object.entries(localStorage)) {
        if (value === 'idb') {
          dbs.push({name});
        }
      }
      resolve(dbs);
    });
  };
  indexedDB.deleteDatabase = new Proxy(indexedDB.deleteDatabase, {
    apply(target, self, args) {
      localStorage.removeItem(args[0]);
      return Reflect.apply(target, self, args);
    }
  });
}
chrome.runtime.onConnect.addListener(port => {
  if (isFF) {
    localStorage.setItem(port.name, 'idb');
  }
  port.onDisconnect.addListener(() => {
    indexedDB.deleteDatabase(port.name);
  });
});
// remove all remaining databases on startup
{
  const once = async () => {
    for (const {name} of await indexedDB.databases()) {
      indexedDB.deleteDatabase(name);
    }
  };
  chrome.runtime.onInstalled.addListener(once);
  chrome.runtime.onStartup.addListener(once);
}

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
