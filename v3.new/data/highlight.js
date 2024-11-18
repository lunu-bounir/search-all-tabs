'use strict';

// only run this code in the assigned frameId
chrome.runtime.sendMessage({
  method: 'get'
}, ({snippet}) => {
  const format = snippet => {
    return snippet.replace(/<\/?b>/g, '');
  };

  const simple = format(snippet);
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
      const snippet = format(section);
      if (window.find(snippet, false, false, true)) {
        // console.log('Found', snippet);
        break;
      }
    }
  }
});
