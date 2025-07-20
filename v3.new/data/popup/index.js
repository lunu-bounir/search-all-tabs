/* global xapian */
'use strict';

// Tests => PDF, discarded tab, about:blank, chrome://extensions/, google, webstore

const isFirefox = navigator.userAgent.includes('Firefox');
const states = {
  ready: false,
  docs: 0,
  ignored: 0
};


const args = new URLSearchParams(location.search);
document.body.dataset.mode = args.get('mode');

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

const closeme = () => document.body.dataset.mode === 'tab' ? chrome.storage.local.get({
  'close-on-tab-mode': true
}, prefs => {
  if (prefs['close-on-tab-mode']) {
    window.close();
  }
}) : window.close();

document.addEventListener('engine-ready', async e => {
  if (window.logger) {
    window.logger.debug('Extension popup opened - engine ready event received', e.detail);
  }
  Object.assign(states, {
    ready: true
  }, e.detail);

  // update interface
  if (states.docs === 0) {
    chrome.storage.local.get({'history-enabled': false}, prefs => {
      if (prefs['history-enabled']) {
        root.dataset.empty = 'Nothing to index. You need to have some tabs open or enable history search in options.';
      } else {
        root.dataset.empty = 'Nothing to index. You need to have some tabs open.';
      }
    });
  }
  else {
    chrome.storage.local.get({'history-enabled': false}, prefs => {
      let sources = 'tabs';
      if (prefs['history-enabled']) {
        sources = 'tabs and browser history';
      }
      root.dataset.empty = `Searching among ${states.docs} document${states.docs === 1 ? '' : 's'} from ${sources}`;
      if (states.ignored) {
        root.dataset.empty += `. ${states.ignored} item${states.ignored === 1 ? ' is' : 's are'} ignored.`;
      }
    });
  }

  const prefs = await (new Promise(resolve => chrome.storage.local.get({
    'highlight-color': 'orange'
  }, prefs => resolve(prefs))));

  // highlight
  document.documentElement.style.setProperty(
    '--highlight-color',
    'var(--highlight-' + prefs['highlight-color'] + ')'
  );

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
      const lang = xapian.language(obj && obj.languages.length ? obj.languages[0].language : 'en');

      try {
        if (window.logger) {
          window.logger.debug('Search started:', query, 'in', lang, 'language');
        }
        const {size, estimated} = await xapian.search({
          query,
          lang,
          length: prefs['search-size']
        });
        if (window.logger) {
          window.logger.debug('Search results:', size, 'found,', estimated, 'estimated');
        }

        document.body.dataset.size = size;

        if (size === 0) {
          info.textContent = '';
          return;
        }
        const elapsed = ((Date.now() - start) / 1000).toFixed(2);
        info.textContent = `About ${estimated} results (${elapsed} seconds in ${states.docs} documents)`;

        const t = document.getElementById('result');
        for (let index = 0; index < size; index += 1) {
          if (signal.aborted) {
            return;
          }
          try {
            const guid = await xapian.search.guid(index);
            const obj = await xapian.body(guid);

            const percent = await xapian.search.percent(index);

            const isHistory = obj.isHistory || false;
            if (window.logger) {
              window.logger.debug('Result', index + 1, ':', obj.title, '(' + percent + '% match)', '[' + (isHistory ? 'history' : 'tab') + ']', 'tabId:', obj.tabId);
            }
            
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
            clone.querySelector('cite').textContent = decodeURIComponent(obj.url);
            clone.querySelector('h2 span[data-id="number"]').textContent = '#' + (index + 1);
            clone.querySelector('h2').title = clone.querySelector('h2 span[data-id="title"]').textContent = obj.title;
            clone.querySelector('h2 img').onerror = e => {
              e.target.src = 'web.svg';
            };
            clone.querySelector('h2 img').src = obj.favIconUrl || (isFirefox ?
              ('chrome://favicon/' + obj.url) :
              `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(obj.url)}&size=32`
            );
            if (!obj.top) {
              clone.querySelector('h2 span[data-id="type"]').textContent = 'iframe';
            } else if (obj.isHistory) {
              clone.querySelector('h2 span[data-id="type"]').textContent = 'history';
              clone.querySelector('h2 span[data-id="type"]').style.color = '#0066cc';
              clone.querySelector('h2 span[data-id="type"]').title = 'From browser history';
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
            const snippet = await xapian.search.snippet({
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
            if (window.logger) {
              window.logger.warn('Cannot add a result', e);
            }
          }
        }
      }
      catch (e) {
        if (window.logger) {
          window.logger.warn('Search error:', e);
        }
        info.textContent = e.message || 'Unknown error occurred';
      }
    });
  });
};
search.controllers = [];

document.getElementById('search').addEventListener('input', e => {
  const query = e.target.value.trim();
  if (window.logger) {
    window.logger.debug('Search query entered:', query);
  }
  root.textContent = '';
  const info = document.getElementById('info');
  if (query && states.ready) {
    search(query);
  }
  else {
    info.textContent = '';
    document.body.dataset.size = states.ready ? 0 : -1;
  }
  // save last query
  chrome.storage.local.set({query});
});

const deep = async a => {
  const guid = a.dataset.guid;
  const data = await xapian.body(guid);

  await xapian.new(1, 'deep-search');

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
    await xapian.add(bodies.map(body => [{
      body,
      lang
    }]), 1);

    const {size} = await xapian.search({
      query: document.querySelector('#search input[type=search]').value,
      lang,
      length: prefs['search-size']
    }, 1);

    if (size) {
      const o = a.closest('.result');
      for (let index = size - 1; index >= 0; index -= 1) {
        const n = o.cloneNode(true);

        const snippet = await xapian.search.snippet({
          index,
          size: prefs['snippet-size']
        });

        n.classList.add('sub');
        n.querySelector('img').remove();
        n.querySelector('[data-id=title]').textContent = '⇢ ' + n.querySelector('[data-id=title]').textContent;
        n.querySelector('p').content = n.querySelector('p').innerHTML = snippet;

        const code = n.querySelector('h2 code');
        const percent = await xapian.search.percent(index);
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
    if (window.logger) {
      window.logger.warn('Deep search error:', e);
    }
  }
  xapian.release(1);
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
      
      // Check if this is a history item (negative tabId indicates history)
      if (Number(tabId) === -1) {
        // This is a history item - open in new tab
        if (window.logger) {
          window.logger.debug('Opening history item in new tab:', a.href);
        }
        chrome.tabs.create({
          url: a.href,
          active: true
        }, closeme);
      } else {
        // This is an active tab - focus it
        if (window.logger) {
          window.logger.debug('Focusing active tab:', Number(tabId), a.href);
        }
        const snippet = e.target.closest('.result').querySelector('p').content;
        chrome.runtime.sendMessage({
          method: 'find',
          tabId: Number(tabId),
          windowId: Number(windowId),
          frameId: Number(frameId),
          snippet
        }, closeme);
      }
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
        .filter(id => Number(id) !== -1) // Exclude history items
        .filter((s, i, l) => l.indexOf(s) === i)
        .map(Number);

      if (ids.length > 0) {
        chrome.runtime.sendMessage({
          method: cmd,
          ids
        }, closeme);
      } else {
        if (window.logger) {
          window.logger.warn('No active tabs selected for', cmd, 'operation');
        }
      }
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
        if (window.logger) {
          window.logger.warn('Clipboard operation failed:', e);
        }
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
    closeme();
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
      .filter(id => Number(id) !== -1) // Exclude history items
      .filter((s, i, l) => l.indexOf(s) === i)
      .map(Number);

    if (ids.length) {
      chrome.runtime.sendMessage({
        method: 'group',
        ids
      }, closeme);
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
        parent.scrollIntoView({block: 'center'});
      }
    }
    else if (n === es.length - 1) {
      es[0].checked = true;
      root.scrollTo({top: 0});
    }
  }
  else if (e.code === 'ArrowUp') {
    e.preventDefault();

    const es = [...document.querySelectorAll('.result input[type=radio]')];
    const n = es.findIndex(e => e.checked);
    if (n === 1) {
      es[0].checked = true;
      root.scrollTo({top: 0});
    }
    else if (n !== 0) {
      es[n - 1].checked = true;
      const parent = es[n - 1].parentElement;
      if (parent.getBoundingClientRect().top < root.getBoundingClientRect().top) {
        parent.scrollIntoView({block: 'center'});
      }
    }
    else if (n === 0) {
      es[es.length - 1].checked = true;
      const parent = es[es.length - 1].parentElement;
      parent.scrollIntoView({block: 'center'});
    }
  }
  else if (e.code === 'PageUp') {
    e.preventDefault();

    const es = [...document.querySelectorAll('.result input[type=radio]')];
    if (es) {
      es[0].checked = true;
      root.scrollTo({top: 0});
    }
  }
  else if (e.code === 'PageDown') {
    e.preventDefault();

    const es = [...document.querySelectorAll('.result input[type=radio]')];
    if (es.length) {
      es[es.length - 1].checked = true;
      const parent = es[es.length - 1].parentElement;
      parent.scrollIntoView({block: 'center'});
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

// select results
document.addEventListener('change', () => {
  document.body.dataset.menu = Boolean(document.querySelector('#results [data-id="select"]:checked'));
});

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'search-interface') {
    response(true);
    chrome.runtime.sendMessage({
      method: 'focus'
    });
  }
  else if (request.method === 'close') {
    window.close();
  }
  else if (request.method === 'unified-log') {
    // Unified logging messages - just acknowledge receipt
    // The actual logging is handled by the UnifiedLogger's chrome.storage persistence
    if (window.logger) {
      // Optional: Log that we received a unified log message for debugging
      // window.logger.debug('Received unified log from', request.context);
    }
  }
  else if (request.method === 'log' && window.logger) {
    // Legacy support for old log messages
    const { level, message, args, context } = request;
    const logMessage = `[${context}] ${message}`;
    
    if (window.logger[level]) {
      window.logger[level](logMessage, ...(args || []));
    } else {
      window.logger.debug(logMessage, ...(args || []));
    }
  }
});

// focus
if (isFirefox) {
  setTimeout(() => document.querySelector('input[name="search"]').focus(), 300);
}

// Indexing stats
document.addEventListener('indexing-stat', e => {
  const {current, total} = e.detail;
  root.dataset.empty = 'Indexing new documents (' + (current / total * 100).toFixed(0) + '%). Please wait...';
});

// Filter functionality
let currentFilter = 'all';

const updateResultCounts = () => {
  try {
    const allResults = document.querySelectorAll('.result');
    const tabResults = document.querySelectorAll('.result a:not([data-tab-id="-1"])');
    const historyResults = document.querySelectorAll('.result a[data-tab-id="-1"]');
    
    const countAll = document.getElementById('count-all');
    const countTabs = document.getElementById('count-tabs');
    const countHistory = document.getElementById('count-history');
    
    if (countAll) countAll.textContent = allResults.length;
    if (countTabs) countTabs.textContent = tabResults.length;
    if (countHistory) countHistory.textContent = historyResults.length;
  } catch (e) {
    if (window.logger) {
      window.logger.warn('Error updating result counts:', e);
    }
  }
};

const applyFilter = (filter) => {
  try {
    const results = document.querySelectorAll('.result');
    
    results.forEach(result => {
      const link = result.querySelector('a');
      if (!link) return;
      
      const tabId = link.dataset.tabId;
      const isHistory = tabId === '-1';
      
      let shouldShow = false;
      
      switch (filter) {
        case 'all':
          shouldShow = true;
          break;
        case 'tabs':
          shouldShow = !isHistory;
          break;
        case 'history':
          shouldShow = isHistory;
          break;
      }
      
      if (shouldShow) {
        result.classList.remove('filter-hidden');
      } else {
        result.classList.add('filter-hidden');
      }
    });
    
    // Update filter button text and icon
    const filterText = document.getElementById('filter-text');
    const filterIcon = document.getElementById('filter-icon');
    
    if (filterText && filterIcon) {
      switch (filter) {
        case 'all':
          filterText.textContent = 'All';
          filterIcon.textContent = '🔗';
          break;
        case 'tabs':
          filterText.textContent = 'Tabs';
          filterIcon.textContent = '📑';
          break;
        case 'history':
          filterText.textContent = 'History';
          filterIcon.textContent = '🕒';
          break;
      }
    }
    
    currentFilter = filter;
  } catch (e) {
    if (window.logger) {
      window.logger.warn('Error applying filter:', e);
    }
  }
};

// Filter controls event listeners
const filterToggle = document.getElementById('filter-toggle');
if (filterToggle) {
  filterToggle.addEventListener('click', (e) => {
    e.preventDefault();
    const menu = document.getElementById('filter-menu');
    const toggle = document.getElementById('filter-toggle');
    
    if (!menu || !toggle) return;
    
    if (menu.classList.contains('hidden')) {
      menu.classList.remove('hidden');
      toggle.classList.add('active');
      updateResultCounts();
    } else {
      menu.classList.add('hidden');
      toggle.classList.remove('active');
    }
  });
}

// Filter option clicks
const initializeFilterOptions = () => {
  const filterOptions = document.querySelectorAll('.filter-option');
  filterOptions.forEach(option => {
    option.addEventListener('click', (e) => {
      try {
        e.preventDefault();
        const filter = option.dataset.filter;
        
        if (!filter) return;
        
        // Update active state
        document.querySelectorAll('.filter-option').forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        
        // Apply filter
        applyFilter(filter);
        
        // Hide menu
        const menu = document.getElementById('filter-menu');
        const toggle = document.getElementById('filter-toggle');
        if (menu) menu.classList.add('hidden');
        if (toggle) toggle.classList.remove('active');
      } catch (e) {
        if (window.logger) {
          window.logger.warn('Error in filter option click:', e);
        }
      }
    });
  });
};

// Initialize filter options
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeFilterOptions);
} else {
  initializeFilterOptions();
}

// Close filter menu when clicking outside
document.addEventListener('click', (e) => {
  const filterControls = document.getElementById('filter-controls');
  if (!filterControls || filterControls.contains(e.target)) return;
  
  const menu = document.getElementById('filter-menu');
  const toggle = document.getElementById('filter-toggle');
  if (menu) menu.classList.add('hidden');
  if (toggle) toggle.classList.remove('active');
});

// Monitor results container for changes and update filter counts
const initializeFilterObserver = () => {
  const resultsContainer = document.getElementById('results');
  if (resultsContainer) {
    const observer = new MutationObserver(() => {
      // Debounce the updates to avoid excessive calls
      clearTimeout(observer.timeoutId);
      observer.timeoutId = setTimeout(() => {
        try {
          updateResultCounts();
          applyFilter(currentFilter);
        } catch (e) {
          if (window.logger) {
            window.logger.warn('Filter update error:', e);
          }
        }
      }, 100);
    });
    
    observer.observe(resultsContainer, {
      childList: true,
      subtree: true
    });
  }
};

// Initialize observer when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeFilterObserver);
} else {
  initializeFilterObserver();
}
