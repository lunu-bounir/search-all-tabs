/* global engine */
'use strict';

// Tests => PDF, discarded tab, about:blank, chrome://extensions/, google, webstore

const isFirefox = navigator.userAgent.includes('Firefox');

const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = './parser/pdf.worker.js';

const args = new URLSearchParams(location.search);
document.body.dataset.mode = args.get('mode');

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
    chrome.scripting.executeScript({
      target: {
        tabId: tab.id,
        allFrames: true
      },
      files: ['/data/collect.js']
    }).catch(() => []).then(arr => {
      chrome.runtime.lastError;
      arr = (arr || []).filter(a => a && a.result).map(a => a.result);
      arr = (arr && arr.length ? arr : [od]).map(o => {
        o.title = o.title || tab.title;
        return o;
      });

      // support parsing PDF files
      let parse = false;
      if (options['parse-pdf'] === true) {
        if (arr && tab.url && (arr[0].mime === 'application/pdf' || tab.url.includes('.pdf'))) {
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
  }), new Promise(resolve => setTimeout(() => {
    resolve([od]);
  }, options['fetch-timeout']))]).then(async arr => {
    try {
      arr = arr.filter(a => a && (a.title || a.body));

      for (const o of arr) {
        o.lang = engine.language(o.lang);
        o.title = o.title || tab.title || cache[tab.id].title;
        if (o.title) {
          cache[tab.id].title = o.title;
        }
        const favIconUrl = tab.favIconUrl || o.favIconUrl || cache[tab.id].favIconUrl;
        if (favIconUrl) {
          cache[tab.id].favIconUrl = favIconUrl;
        }
        if (scope === 'body') {
          o.title = '';
        }
        else if (scope === 'title') {
          o.body = '';
        }
        if (options['max-content-length'] > 0) {
          o.body = o.body.slice(0, options['max-content-length']);
        }

        await engine.add(o, {
          tabId: tab.id,
          windowId: tab.windowId,
          favIconUrl: favIconUrl || 'web.svg',
          frameId: o.frameId,
          top: o.top,
          lang: o.lang
        });
      }
      return arr.length;
    }
    catch (e) {
      console.warn('document skipped', e);
      if (e.message.includes('memory access out of bounds')) {
        return -1;
      }
      return 0;
    }
  });
};

document.addEventListener('engine-ready', async () => {
  const prefs = await (new Promise(resolve => chrome.storage.local.get({
    'scope': 'both',
    'index': 'browser',
    'parse-pdf': true,
    'fetch-timeout': 10000,
    'max-content-length': 100 * 1024,
    'duplicates': true,
    'highlight-color': 'orange'
  }, prefs => resolve(prefs))));

  const query = {};
  if (prefs.index === 'window' || prefs.index === 'tab') {
    query.currentWindow = true;
  }
  if (prefs.index === 'tab') {
    query.active = true;
  }
  let tabs = await chrome.tabs.query(query);
  tabs.forEach(tab => cache[tab.id] = tab);

  // highlight
  document.documentElement.style.setProperty(
    '--highlight-color',
    'var(--highlight-' + prefs['highlight-color'] + ')'
  );

  // index
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

  const length = 5; // number of simultaneous indexers
  for (let n = 0; n < tabs.length; n += length) {
    root.dataset.empty = `Indexing ${n + 1} of ${tabs.length} tabs. Please wait...`;

    const pt = Array.from({
      length
    }, (_, m) => tabs[n + m]).filter(a => a);
    const cs = await Promise.all(pt.map(tab => index(tab, prefs.scope, {
      'parse-pdf': prefs['parse-pdf'],
      'fetch-timeout': prefs['fetch-timeout'],
      'max-content-length': prefs['max-content-length']
    }).then(c => {
      if (c === -1) {
        alert(`Your browser's memory limit for indexing content reached.

  Right-click on the toolbar button and reduce the "Maximum Size of Each Content" option and retry.`);
        window.close();
      }
      return c;
    })));

    for (const c of cs) {
      if (c === 0 || c === -1) {
        ignored += 1;
      }
      else {
        docs += c;
      }
    }
  }

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
      if (prefs.mode === 'selected' || prefs.mode === 'selectedORhistory') {
        // do we have selected text

        chrome.tabs.query({
          currentWindow: true,
          active: true
        }, ([tab]) => chrome.scripting.executeScript({
          target: {
            tabId: tab.id
          },
          func: () => {
            return window.getSelection().toString();
          }
        }, (arr = []) => {
          if (chrome.runtime.lastError || input.value) {
            return;
          }
          const query = arr.reduce((p, c) => p || c.result, '');
          if (query) {
            input.value = query;
            input.select();
            input.dispatchEvent(new Event('input', {
              bubbles: true
            }));
          }
          else if (prefs.mode === 'selectedORhistory' && prefs.query) {
            input.value = prefs.query;
            input.select();
            input.dispatchEvent(new Event('input', {
              bubbles: true
            }));
          }
        }));
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
});

const root = document.getElementById('results');

document.getElementById('search').addEventListener('submit', e => {
  e.preventDefault();
});

const search = query => {
  // abort all ongoing search requests
  for (const c of search.controllers) {
    c.abort();
  }
  search.controllers.length = 0;
  const controller = new AbortController();
  const {signal} = controller;
  search.controllers.push(controller);

  const info = document.getElementById('info');
  const start = Date.now();
  chrome.storage.local.get({
    'snippet-size': 300,
    'search-size': 30
  }, prefs => {
    if (signal.aborted) {
      return;
    }
    // detect input language
    chrome.i18n.detectLanguage(query, async obj => {
      if (signal.aborted) {
        return;
      }
      const lang = engine.language(obj && obj.languages.length ? obj.languages[0].language : 'en');

      try {
        const {size, estimated} = await engine.search({
          query,
          lang,
          length: prefs['search-size']
        });

        document.body.dataset.size = size;

        if (size === 0) {
          info.textContent = '';
          return;
        }
        info.textContent =
          `About ${estimated} results (${((Date.now() - start) / 1000).toFixed(2)} seconds in ${docs} documents)`;

        const t = document.getElementById('result');
        for (let index = 0; index < size; index += 1) {
          if (signal.aborted) {
            return;
          }
          try {
            const guid = await engine.search.guid(index);
            const obj = await engine.body(guid);

            const percent = await engine.search.percent(index);

            const clone = document.importNode(t.content, true);
            clone.querySelector('a').href = obj.url;
            Object.assign(clone.querySelector('a').dataset, {
              tabId: obj.tabId,
              windowId: obj.windowId,
              frameId: obj.frameId,
              index,
              guid,
              percent
            });
            clone.querySelector('input[name=search]').checked = index == 0;
            clone.querySelector('cite').textContent = obj.url;
            clone.querySelector('h2 span[data-id="number"]').textContent = '#' + (index + 1);
            clone.querySelector('h2').title = clone.querySelector('h2 span[data-id="title"]').textContent = obj.title;
            clone.querySelector('h2 img').onerror = e => {
              e.target.src = 'web.svg';
            };
            clone.querySelector('h2 img').src = obj.favIconUrl || cache[obj.tabId]?.favIconUrl || (isFirefox ?
              ('chrome://favicon/' + obj.url) :
              `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(obj.url)}&size=32`
            );
            if (!obj.top) {
              clone.querySelector('h2 span[data-id="type"]').textContent = 'iframe';
            }
            const code = clone.querySelector('h2 code');

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
          catch (e) {
            console.warn('Cannot add a result', e);
          }
        }
      }
      catch (e) {
        console.warn(e);
        info.textContent = e.message || 'Unknown error occurred';
      }
    });
  });
};
search.controllers = [];

document.getElementById('search').addEventListener('input', e => {
  const query = e.target.value.trim();
  root.textContent = '';
  const info = document.getElementById('info');
  if (query && ready) {
    search(query);
  }
  else {
    info.textContent = '';
    document.body.dataset.size = ready ? 0 : -1;
  }
  // save last query
  chrome.storage.local.set({query});
});

const deep = async a => {
  const guid = a.dataset.guid;
  const data = await engine.body(guid);

  await engine.new(1, 'deep-search');

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
      await engine.add({
        body,
        lang
      }, undefined, undefined, 1);
    }
    const {size} = await engine.search({
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
        const percent = await engine.search.percent(index);
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

  if (e.target.dataset.id === 'select') {
    if (/Firefox/.test(navigator.userAgent)) {
      setTimeout(() => {
        e.target.checked = !e.target.checked;
        e.target.dispatchEvent(new Event('change', {
          bubbles: true
        }));
      });
      e.preventDefault();
    }
    return;
  }

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
    else if (cmd === 'shortcuts') {
      chrome.tabs.create({
        url: chrome.runtime.getManifest().homepage_url + '#faq25'
      });
    }
    else if (cmd === 'select-all') {
      [...document.querySelectorAll('.result [data-id="select"]')].forEach(e => e.checked = true);
      document.dispatchEvent(new Event('change'));
    }
    else if (cmd === 'select-none') {
      [...document.querySelectorAll('.result [data-id="select"]')].forEach(e => e.checked = false);
      document.dispatchEvent(new Event('change'));
    }
    else if (cmd === 'group' || cmd === 'delete') {
      const ids = [...document.querySelectorAll('#results [data-id=select]:checked')]
        .map(e => e.closest('a').dataset.tabId)
        .filter((s, i, l) => l.indexOf(s) === i)
        .map(Number);

      chrome.runtime.sendMessage({
        method: cmd,
        ids
      }, () => window.close());
    }
  }
});

// keyboard shortcut
window.addEventListener('keydown', e => {
  const meta = e.metaKey || e.ctrlKey;

  if (e.code === 'Tab') {
    e.preventDefault();
    const input = document.querySelector('#search input[type=search]');
    return input.focus();
  }
  if (meta && e.code === 'KeyR') {
    e.stopPropagation();
    e.preventDefault();

    location.reload();
  }
  if (meta && e.code && e.code.startsWith('Digit')) {
    e.preventDefault();
    const index = Number(e.code.replace('Digit', ''));
    const n = document.querySelector(`[data-count="${index}"]`);
    if (n) {
      n.click();
    }
  }
  else if (meta && e.shiftKey && e.code === 'KeyA') {
    e.preventDefault();
    document.querySelector('[data-cmd=select-all]').click();
  }
  else if (meta && e.shiftKey && e.code === 'KeyF') {
    e.preventDefault();
    document.querySelector('[data-cmd=faqs]').click();
  }
  else if (meta && e.shiftKey && e.code === 'KeyS') {
    e.preventDefault();
    document.querySelector('[data-cmd=shortcuts]').click();
  }
  else if (meta && e.shiftKey && e.code === 'KeyC') {
    e.preventDefault();
    document.querySelector('[data-cmd=delete]').click();
  }
  else if (meta && e.shiftKey && e.code === 'KeyG') {
    e.preventDefault();
    document.querySelector('[data-cmd=group]').click();
  }
  else if (meta && e.shiftKey && e.code === 'KeyN') {
    e.preventDefault();
    document.querySelector('[data-cmd=select-none]').click();
  }
  else if (meta && e.code === 'KeyD') {
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
  else if (meta && e.code === 'KeyF') {
    e.preventDefault();
    const input = document.querySelector('#search input[type=search]');
    input.focus();
    input.select();
  }
  else if (e.code === 'Escape' && e.target.value === '') {
    window.close();
  }
  else if (e.code === 'Space' && e.shiftKey) {
    e.preventDefault();
    const i = document.querySelector('.result input[type=radio]:checked');

    if (i) {
      i.closest('div').querySelector('[data-id=select]').click();
    }
  }
  // extract all tabs into a new window
  else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && e.shiftKey) {
    e.preventDefault();

    const ids = [...document.querySelectorAll('[data-tab-id]')]
      .filter(a => meta ? Number(a.dataset.percent) >= 80 : true)
      .map(a => a.dataset.tabId)
      .filter((s, i, l) => l.indexOf(s) === i)
      .map(Number);

    if (ids.length) {
      chrome.runtime.sendMessage({
        method: 'group',
        ids
      }, () => window.close());
    }
  }
  else if ((e.code === 'Enter' || e.code === 'NumpadEnter')) {
    e.preventDefault();
    const n = document.querySelector(`.result input[type=radio]:checked + a`);
    if (n) {
      n.click();
    }
  }
  else if (e.code === 'ArrowDown') {
    e.preventDefault();

    const es = [...document.querySelectorAll('.result input[type=radio]')];
    const n = es.findIndex(e => e.checked);
    if (n !== -1 && n !== es.length - 1) {
      es[n + 1].checked = true;
      const parent = es[n + 1].parentElement;
      if (
        parent.getBoundingClientRect().bottom > document.documentElement.clientHeight ||
        parent.getBoundingClientRect().top < root.getBoundingClientRect().top
      ) {
        parent.scrollIntoView({block: 'center', behavior: 'smooth'});
      }
    }
    else if (n === es.length - 1) {
      es[0].checked = true;
      root.scrollTo({top: 0, behavior: 'smooth'});
    }
  }
  else if (e.code === 'ArrowUp') {
    e.preventDefault();

    const es = [...document.querySelectorAll('.result input[type=radio]')];
    const n = es.findIndex(e => e.checked);
    if (n === 1) {
      es[0].checked = true;
      root.scrollTo({top: 0, behavior: 'smooth'});
    }
    else if (n !== 0) {
      es[n - 1].checked = true;
      const parent = es[n - 1].parentElement;
      if (parent.getBoundingClientRect().top < root.getBoundingClientRect().top) {
        parent.scrollIntoView({block: 'center', behavior: 'smooth'});
      }
    }
    else if (n === 0) {
      es[es.length - 1].checked = true;
      const parent = es[es.length - 1].parentElement;
      parent.scrollIntoView({block: 'center', behavior: 'smooth'});
    }
  }
  else if (e.code === 'PageUp') {
    e.preventDefault();

    const es = [...document.querySelectorAll('.result input[type=radio]')];
    if (es) {
      es[0].checked = true;
      root.scrollTo({top: 0, behavior: 'smooth'});
    }
  }
  else if (e.code === 'PageDown') {
    e.preventDefault();

    const es = [...document.querySelectorAll('.result input[type=radio]')];
    if (es.length) {
      es[es.length - 1].checked = true;
      const parent = es[es.length - 1].parentElement;
      parent.scrollIntoView({block: 'center', behavior: 'smooth'});
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
  s.onload = () => { // delete database on close
    if (prefs.engine === 'xapian') {
      chrome.runtime.connect({
        name: engine.name
      });
    }
  };
  s.src = '../' + prefs.engine + '/connect.js';
  console.info('I am using', prefs.engine, 'engine');
  document.body.dataset.engine = prefs.engine;
  document.body.appendChild(s);
});

// select results
document.addEventListener('change', () => {
  document.body.dataset.menu = Boolean(document.querySelector('#results [data-id="select"]:checked'));
});

