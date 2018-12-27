'use strict';

var cache = {};
chrome.tabs.onRemoved.addListener(tabId => delete cache[tabId]);

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'find') {
    cache[request.tabId] = request;

    chrome.tabs.executeScript(request.tabId, {
      file: 'data/highlight.js',
      runAt: 'document_start',
      allFrames: true
    }, () => {
      chrome.tabs.update(request.tabId, {
        active: true
      });
      chrome.windows.update(request.windowId, {
        focused: true
      });
    });
  }
  else if (request.method === 'get') {
    response(cache[sender.tab.id]);
    cache[sender.tab.id];
  }
});
