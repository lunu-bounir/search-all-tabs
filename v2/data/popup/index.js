/* globals engine, pdfjsLib */
'use strict';

// Tests => PDF, discarded tab, about:blank, about:addons, google

const args = new URLSearchParams(location.search);
if (args.get('mode') === 'sidebar') {
  document.body.dataset.mode = 'sidebar';
}

let ready = false;
let docs = 0;

let aid;
const arrange = () => {
  clearTimeout(aid);
  aid = setTimeout(arrange.do, 100);
};
arrange.do = () => {
  const es = [...document.querySelectorAll('.result')];
  const vs = es.filter(e => e.getBoundingClientRect().y > 5);
  es.forEach((e, c) => {
    const n = e.querySelector('[data-id="number"]');
    const v = vs.length - es.length + c + 1;
    n.textContent = '#' + v;
    n.dataset.count = v;
  });
};

// keep tabs
const cache = {};

const index = (tab, scope = 'both', options = {}) => {
  const od = {
    body: '',
    date: new Date(document.lastModified).toISOString().split('T')[0].replace(/-/g, ''),
    description: '',
    frameId: 0,
    keywords: '',
    lang: 'english',
    mime: 'text/html',
    title: tab.title,
    url: tab.url,
    top: true
  };
  return Promise.race([new Promise(resolve => {
    chrome.tabs.executeScript(tab.id, {
      runAt: 'document_start',
      allFrames: true,
      file: '/data/collect.js'
    }, arr => {
      chrome.runtime.lastError;
      arr = (arr || []).filter(a => a);
      arr = (arr && arr.length ? arr : [od]).map(o => {
        o.title = o.title || tab.title;
        return o;
      });

      // support parsing PDF files
      let parse = false;
      if (options['parse-pdf'] === true) {
        if (arr && tab.url && (arr[0].mime === 'application/pdf' || tab.url.indexOf('.pdf') !== -1)) {
          if (scope === 'both' || scope === 'body') {
            parse = true;
          }
        }
      }
      if (parse) {
        pdfjsLib.getDocument(tab.url).promise.then(pdf => {
          return Promise.all(Array.from(Array(pdf.numPages)).map(async (a, n) => {
            const page = await pdf.getPage(n + 1);
            const content = await page.getTextContent();
            return content.items.map(s => s.str).join('') + '\n\n' +
              content.items.map(s => s.str).join('\n');
          })).then(a => a.join('\n\n')).then(c => {
            arr[0].body = c;
            arr[0].pdf = true;
            resolve(arr);
          });
        }).catch(e => {
          console.warn('Cannot parse PDF document', tab.url, e);
          resolve(arr);
        });
      }
      else {
        resolve(arr);
      }
    });
  }), new Promise(resolve => setTimeout(() => resolve([od]), 1000))]).then(arr => {
    try {
      arr = arr.filter(a => a && (a.title || a.body));

      arr.forEach(o => {
        o.lang = engine.language(o.lang);
        o.title = o.title || tab.title || cache[tab.id].title;
        if (o.title) {
          cache[tab.id].title = o.title;
        }
        const favIconUrl = tab.favIconUrl || o.favIconUrl || cache[tab.id].favIconUrl;
        if (favIconUrl) {
          cache[tab.id].favIconUrl = o.title;
        }
        if (scope === 'body') {
          o.title = '';
        }
        else if (scope === 'title') {
          o.body = '';
        }
        engine.add(o, {
          tabId: tab.id,
          windowId: tab.windowId,
          favIconUrl: favIconUrl || 'web.svg',
          frameId: o.frameId,
          top: o.top,
          lang: o.lang
        });
      });
      return arr.length;
    }
    catch (e) {
      console.warn('document skipped', e);
      return 0;
    }
  });
};

document.addEventListener('engine-ready', () => chrome.tabs.query({}, async tabs => {
  tabs.forEach(tab => cache[tab.id] = tab);

  const prefs = await (new Promise(resolve => chrome.storage.local.get({
    'scope': 'both',
    'parse-pdf': true,
    'duplicates': true
  }, prefs => resolve(prefs))));

  let ignored = 0;
  if (prefs.duplicates) {
    const list = new Set();
    tabs = tabs.filter(t => {
      if (list.has(t.url)) {
        ignored += 1;
        return false;
      }
      list.add(t.url);
      return true;
    });
  }

  docs = (await Promise.all(tabs.map(tab => index(tab, prefs.scope, {
    'parse-pdf': prefs['parse-pdf']
  })))).reduce((p, c) => {
    if (c === 0) {
      ignored += 1;
    }
    return p + c;
  }, 0);

  if (docs === 0) {
    root.dataset.empty = 'Nothing to index. You need to have some tabs open.';
  }
  else {
    root.dataset.empty = `Searching among ${docs} document${docs === 1 ? '' : 's'}`;
    if (ignored) {
      root.dataset.empty += `. ${ignored} tab${ignored === 1 ? ' is' : 's are'} ignored.`;
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
      mode: 'none',
      query: ''
    }, prefs => {
      if (prefs.mode === 'selected') {
        // do we have selected text
        chrome.tabs.executeScript({
          code: 'window.getSelection().toString()',
          runAt: 'document_start'
        }, (arr = []) => {
          if (chrome.runtime.lastError || input.value) {
            return;
          }
          const query = arr.reduce((p, c) => p || c, '');
          if (query) {
            input.value = query;
            input.select();
            input.dispatchEvent(new Event('input', {
              bubbles: true
            }));
          }
        });
      }
      else if (prefs.mode === 'history' && prefs.query) {
        input.value = prefs.query;
        input.select();
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
  const query = e.target.value.trim();
  root.textContent = '';
  const info = document.getElementById('info');
  if (query && ready) {
    const start = Date.now();
    chrome.storage.local.get({
      'snippet-size': 300,
      'search-size': 30
    }, prefs => {
      // detect input language
      chrome.i18n.detectLanguage(query, async obj => {
        const lang = engine.language(obj && obj.languages.length ? obj.languages[0].language : 'en');

        try {
          const {size, estimated} = engine.search({
            query,
            lang,
            length: prefs['search-size']
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
            const obj = await engine.search.body(index);
            const guid = engine.search.guid(index);
            const clone = document.importNode(t.content, true);
            clone.querySelector('a').href = obj.url;
            Object.assign(clone.querySelector('a').dataset, {
              tabId: obj.tabId,
              windowId: obj.windowId,
              frameId: obj.frameId,
              index,
              guid
            });
            clone.querySelector('cite').textContent = obj.url;
            clone.querySelector('h2 span[data-id="number"]').textContent = '#' + (index + 1);
            clone.querySelector('h2').title = clone.querySelector('h2 span[data-id="title"]').textContent = obj.title;
            clone.querySelector('h2 img').src = obj.favIconUrl || cache[obj.tabId].favIconUrl || 'chrome://favicon/' + obj.url;
            clone.querySelector('h2 img').onerror = e => {
              e.target.src = 'web.svg';
            };
            if (!obj.top) {
              clone.querySelector('h2 span[data-id="type"]').textContent = 'iframe';
            }
            const code = clone.querySelector('h2 code');
            const percent = engine.search.percent(index);
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
            const snippet = await engine.search.snippet({
              index,
              size: prefs['snippet-size']
            });
            // the HTML code that is returns from snippet is escaped
            // https://xapian.org/docs/apidoc/html/classXapian_1_1MSet.html#a6f834ac35fdcc58fcd5eb38fc7f320f1
            clone.querySelector('p').content = clone.querySelector('p').innerHTML = snippet;

            // intersection observer
            new IntersectionObserver(arrange, {
              threshold: 1.0
            }).observe(clone.querySelector('h2'));

            root.appendChild(clone);
          }
        }
        catch (e) {
          console.warn(e);
          info.textContent = e.message || 'Unknown error occurred';
        }
      });
    });
  }
  else {
    info.textContent = '';
    delete root.dataset.size;
  }
  // save last query
  chrome.storage.local.set({query});
});

const deep = async a => {
  const guid = a.dataset.guid;
  const data = await engine.body(guid);
  engine.new(1, 'one-tab');

  const prefs = await new Promise(resolve => chrome.storage.local.get({
    'snippet-size': 300,
    'search-size': 30
  }, resolve));

  const parts = data.body.split(/\n+/).filter(a => a);
  const bodies = [];
  let body = '';
  for (const part of parts) {
    body += '\n' + part;

    if (body.length > prefs['snippet-size']) {
      bodies.push(body);
      body = '';
    }
  }
  if (body) {
    bodies.push(body);
  }

  const lang = data.lang;
  try {
    for (const body of bodies) {
      engine.add({
        body,
        lang
      }, undefined, undefined, 1);
    }
    const {size} = engine.search({
      query: document.querySelector('#search input[type=search]').value,
      lang,
      length: prefs['search-size']
    }, 1);

    if (size) {
      const o = a.closest('.result');
      for (let index = size - 1; index >= 0; index -= 1) {
        const n = o.cloneNode(true);

        const snippet = await engine.search.snippet({
          index,
          size: prefs['snippet-size']
        });

        n.classList.add('sub');
        n.querySelector('img').remove();
        n.querySelector('[data-id=title]').textContent = '⇢ ' + n.querySelector('[data-id=title]').textContent;
        n.querySelector('p').content = n.querySelector('p').innerHTML = snippet;

        const code = n.querySelector('h2 code');
        const percent = engine.search.percent(index);
        code.textContent = percent + '%';

        // intersection observer
        new IntersectionObserver(arrange, {
          threshold: 1.0
        }).observe(n.querySelector('h2'));

        o.insertAdjacentElement('afterend', n);
      }
    }
  }
  catch (e) {
    console.warn(e);
  }
  engine.release(1);
};

document.addEventListener('click', e => {
  const a = e.target.closest('[data-cmd]');

  if (e.target.dataset.id === 'deep-search') {
    e.preventDefault();
    e.target.textContent = '';
    e.target.classList.add('done');

    return deep(a);
  }

  if (a) {
    const cmd = a.dataset.cmd;

    if (cmd === 'open') {
      const {tabId, windowId, frameId} = a.dataset;
      const snippet = e.target.closest('.result').querySelector('p').content;
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
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyR') {
    location.reload();
    e.stopPropagation();
    e.preventDefault();
  }
  if (e.metaKey || e.ctrlKey) {
    if (e.code && e.code.startsWith('Digit')) {
      e.preventDefault();
      const index = Number(e.code.replace('Digit', ''));
      const n = document.querySelector(`[data-count="${index}"]`);
      if (n) {
        n.click();
      }
    }
    else if (e.code === 'KeyD') {
      e.preventDefault();
      const links = [...document.querySelectorAll('[data-tab-id]')]
        .map(a => a.href)
        .filter((s, i, l) => l.indexOf(s) === i);

      if (links.length) {
        navigator.clipboard.writeText(links.join('\n')).catch(e => {
          console.warn(e);
          if (e) {
            alert(links.join('\n'));
          }
        });
      }
    }
  }
  else if (e.code === 'Escape' && e.target.value === '') {
    window.close();
  }
  // extract all tabs into a new window
  else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && e.shiftKey) {
    e.preventDefault();
    const ids = [...document.querySelectorAll('[data-tab-id]')]
      .map(a => a.dataset.tabId)
      .filter((s, i, l) => l.indexOf(s) === i)
      .map(Number);
    if (ids.length) {
      chrome.runtime.sendMessage({
        method: 'group',
        ids
      });
      window.close();
    }
  }
  else if ((e.code === 'Enter' || e.code === 'NumpadEnter')) {
    e.preventDefault();
    // fire Ctrl + 1
    window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'Digit1',
      ctrlKey: true
    }));
  }
  else if (e.code === 'ArrowDown') {
    e.preventDefault();
    const div = [...document.querySelectorAll('.result')].filter(e => {
      return e.getBoundingClientRect().top > document.documentElement.clientHeight;
    }).shift();
    if (div) {
      div.scrollIntoView({
        block: 'end'
      });
    }
  }
  else if (e.code === 'ArrowUp') {
    e.preventDefault();
    const div = [...document.querySelectorAll('.result')].filter(e => {
      return e.getBoundingClientRect().bottom < 0;
    }).pop();
    if (div) {
      div.scrollIntoView({
        block: 'start'
      });
    }
  }
});

// guide
chrome.storage.local.get({
  'guide': true
}, prefs => {
  if (prefs.guide) {
    document.getElementById('guide').classList.remove('hidden');
  }
});
document.getElementById('guide-close').addEventListener('click', e => {
  e.target.parentElement.classList.add('hidden');
  chrome.storage.local.set({
    'guide': false
  });
});

// permit
chrome.storage.local.get({
  'internal': true
}, prefs => {
  if (prefs.internal) {
    chrome.permissions.contains({
      permissions: ['tabs']
    }, granted => {
      if (granted === false) {
        document.getElementById('internal').classList.remove('hidden');
      }
    });
  }
});
document.getElementById('internal-close').addEventListener('click', e => {
  e.target.parentElement.classList.add('hidden');
  chrome.storage.local.set({
    'internal': false
  });
});
document.getElementById('internal').addEventListener('submit', e => {
  e.preventDefault();
  chrome.permissions.request({
    permissions: ['tabs']
  }, granted => {
    if (granted) {
      e.target.classList.add('hidden');
    }
  });
});

// select engine
chrome.storage.local.get({
  engine: 'xapian'
}, prefs => {
  const s = document.createElement('script');
  s.src = '../' + prefs.engine + '/connect.js';
  console.info('I am using', prefs.engine, 'engine');
  document.body.dataset.engine = prefs.engine;
  document.body.appendChild(s);
});
