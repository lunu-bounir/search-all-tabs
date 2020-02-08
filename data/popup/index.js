/* globals xapian */
'use strict';

let ready = false;
let docs = 0;

const detectLanguage = code => {
  code = code.split('-')[0];

  return ({
    'ar': 'arabic',
    'fa': 'arabic',
    'hy': 'armenian',
    'eu': 'basque',
    'ca': 'catalan',
    'da': 'danish',
    'nl': 'dutch',
    'en': 'english',
    'fi': 'finnish',
    'fr': 'french',
    'de': 'german',
    'hu': 'hungarian',
    'id': 'indonesian',
    'ga': 'irish',
    'it': 'italian',
    'lt': 'lithuanian',
    'ne': 'nepali',
    'no': 'norwegian',
    'nn': 'norwegian',
    'nb': 'norwegian',
    'pt': 'portuguese',
    'ro': 'romanian',
    'ru': 'russian',
    'es': 'spanish',
    'sv': 'swedish',
    'ta': 'tamil',
    'tr': 'turkish'
  })[code] || 'english';
};

const index = tab => Promise.race([new Promise(resolve => chrome.tabs.executeScript(tab.id, {
  runAt: 'document_start',
  allFrames: true,
  file: '/data/collect.js'
}, arr => {
  try {
    chrome.runtime.lastError;
    arr = (arr || [{
      body: '',
      date: new Date(document.lastModified).toISOString().split('T')[0].replace(/-/g, ''),
      description: '',
      frameId: 0,
      keywords: '',
      lang: 'english',
      mime: 'text/html',
      title: tab.title,
      url: tab.url
    }]).filter(a => a);
    arr.forEach(o => {
      o.lang = detectLanguage(o.lang);
      o.title = o.title || tab.title;
      xapian.add(o, {
        tabId: tab.id,
        windowId: tab.windowId,
        favIconUrl: tab.favIconUrl,
        frameId: o.frameId
      });
    });
    resolve(arr.length);
  }
  catch (e) {
    console.warn('document skipped', e);
    resolve(0);
  }
})), new Promise(resolve => setTimeout(() => resolve(0), 1000))]);

document.addEventListener('xapian-ready', () => chrome.tabs.query({}, async tabs => {
  let ignored = 0;
  docs = (await Promise.all(tabs.map(tab => index(tab)))).reduce((p, c) => {
    if (c === 0) {
      ignored += 1;
    }
    return p + c;
  }, 0);
  if (docs === 0) {
    root.dataset.empty = 'Nothing to index. You need to have some tabs open.';
  }
  else {
    root.dataset.empty = `Searching among ${docs} document(s)`;
    if (ignored) {
      root.dataset.empty += `. ${ignored} tab(s) are ignored`;
    }
  }
  ready = true;
  // do we have anything to search
  const input = document.querySelector('#search input[type=search]');
  if (input.value) {
    input.dispatchEvent(new Event('input', {
      bubbles: true
    }));
  }
  else {
    chrome.storage.local.get({
      mode: 'selected',
      query: ''
    }, prefs => {
      if (prefs.mode === 'selected') {
        // do we have selected text
        chrome.tabs.executeScript({
          code: 'window.getSelection().toString()',
          runAt: 'document_start'
        }, arr => {
          if (chrome.runtime.lastError || input.value) {
            return;
          }
          const query = arr.reduce((p, c) => p || c, '');
          if (query) {
            input.value = query;
            input.dispatchEvent(new Event('input', {
              bubbles: true
            }));
          }
        });
      }
      else if (prefs.mode === 'history' && prefs.query) {
        input.value = prefs.query;
        input.dispatchEvent(new Event('input', {
          bubbles: true
        }));
      }
    });
  }
}));

const root = document.getElementById('results');

document.getElementById('search').addEventListener('submit', e => {
  e.preventDefault();
});
document.getElementById('search').addEventListener('input', e => {
  const query = e.target.value;
  root.textContent = '';
  const info = document.getElementById('info');
  if (query && ready) {
    const start = Date.now();
    // detect input language
    chrome.i18n.detectLanguage(query, async obj => {
      const lang = detectLanguage(obj && obj.languages.length ? obj.languages[0].language : 'en');

      const {size, estimated} = xapian.search({
        query,
        lang
      });
      root.dataset.size = size;

      if (size === 0) {
        info.textContent = '';
        return;
      }
      info.textContent =
        `About ${estimated} results (${((Date.now() - start) / 1000).toFixed(2)} seconds in ${docs} documents)`;

      const t = document.getElementById('result');
      for (let index = 0; index < size; index += 1) {
        const obj = await xapian.search.body(index);
        const clone = document.importNode(t.content, true);
        clone.querySelector('a').href = obj.url;
        Object.assign(clone.querySelector('a').dataset, {
          tabId: obj.tabId,
          windowId: obj.windowId,
          frameId: obj.frameId,
          index
        });
        clone.querySelector('cite').textContent = obj.url;
        clone.querySelector('h2 span[data-id="number"]').textContent = '#' + (index + 1);
        clone.querySelector('h2 span[data-id="title"]').textContent = obj.title;
        clone.querySelector('h2 img').src = obj.favIconUrl || 'chrome://favicon/' + obj.url;
        const code = clone.querySelector('h2 code');
        const percent = xapian.search.percent(index);
        code.textContent = percent + '%';
        if (percent > 80) {
          code.style['background-color'] = 'green';
        }
        else if (code > 60) {
          code.style['background-color'] = 'orange';
        }
        else {
          code.style['background-color'] = 'gray';
        }
        const snippet = await xapian.search.snippet({
          index
        });
        // the HTML code that is returns from snippet is escaped
        // https://xapian.org/docs/apidoc/html/classXapian_1_1MSet.html#a6f834ac35fdcc58fcd5eb38fc7f320f1
        clone.querySelector('p').innerHTML = snippet || 'Preview is not supported for this entry';

        root.appendChild(clone);
      }
    });
  }
  else {
    info.textContent = '';
    delete root.dataset.size;
  }
  // save last query
  chrome.storage.local.set({query});
});

document.addEventListener('click', e => {
  const a = e.target.closest('[data-cmd]');
  if (a) {
    const cmd = a.dataset.cmd;

    if (cmd === 'open') {
      const {tabId, windowId, frameId} = a.dataset;
      const snippet = e.target.closest('.result').querySelector('p').innerHTML;

      chrome.runtime.sendMessage({
        method: 'find',
        tabId: Number(tabId),
        windowId: Number(windowId),
        frameId,
        snippet
      }, () => window.close());
      e.preventDefault();
    }
    else if (cmd === 'faqs') {
      chrome.tabs.create({
        url: chrome.runtime.getManifest().homepage_url
      });
    }
  }
});

// keyboard shortcut
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey) {
    if (e.code && e.code.startsWith('Digit')) {
      const index = Number(e.code.replace('Digit', ''));
      const a = document.querySelector(`a[data-index="${index - 1}"]`);
      if (a) {
        a.click();
      }
    }
  }
  else if (e.code === 'Escape' && e.target.value === '') {
    window.close();
  }
  else if (e.code === 'Enter') {
    // fire Ctrl + 1
    window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'Digit1',
      ctrlKey: true
    }));
  }
});

// loading resources
{
  const api = document.createElement('script');
  api.src = '../xapian.js';
  api.onload = () => {
    const core = document.createElement('script');
    core.src = '../xapian/xapian.js';
    document.body.appendChild(core);
  };
  document.body.appendChild(api);
}
