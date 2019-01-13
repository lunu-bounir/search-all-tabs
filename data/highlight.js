'use strict';

// only run this code in the assigned frameId
chrome.runtime.sendMessage({
  method: 'get'
}, ({snippet, frameId}) => {
  if (window.frameId && window.frameId + '' === frameId) {
    const simple = snippet.replace(/<\/?b>/g, '');

    if (window.find(simple, false, false, true) === false) {
      const sections = snippet.split('\n').map(a => a.trim()).filter(a => a && a.length > 5).sort((a, b) => {
        const ai = a.indexOf('<b>') !== -1;
        const bi = b.indexOf('<b>') !== -1;
        if (ai && !bi) {
          return -1;
        }
        else if (bi && !ai) {
          return 1;
        }
        return b.length - a.length;
      });
      for (const section of sections) {
        if (window.find(section.replace(/<\/?b>/g, ''), false, false, true)) {
          break;
        }
      }
    }
  }
});
