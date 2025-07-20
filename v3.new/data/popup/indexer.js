/* global xapian */

const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = './parser/pdf.worker.js';

class Preferences {
  get(prefs) {
    return chrome.storage.local.get(prefs);
  }
  set(prefs) {
    return chrome.storage.local.set(prefs);
  }
  remove(key) {
    return chrome.storage.local.remove(key);
  }
}
class Indexer {
  #prefs = {};
  async #pdf(tab) {
    const pdf = await pdfjsLib.getDocument(tab.url).promise;

    const meta = await pdf.getMetadata();

    const body = await Promise.all(Array.from(Array(pdf.numPages)).map(async (a, n) => {
      const page = await pdf.getPage(n + 1);
      const content = await page.getTextContent();
      return content.items.map(s => s.str).join('') + '\n\n' +
        content.items.map(s => s.str).join('\n');
    })).then(a => a.join('\n\n'));

    return {
      body,
      title: meta.info.Title
    };
  }
  async prepare() {
    console.debug('🔧 Indexer.prepare() - Loading preferences');
    const prefs = new Preferences();
    this.#prefs = await prefs.get({
      'fetch-timeout': 10000,
      'max-content-length': 100 * 1024,
      'scope': 'both',
      'parse-pdf': true,
      'index': 'browser',
      'duplicates': true,
      'history-enabled': false,
      'history-days': 7,
      'history-max-results': 1000
    });
    this.#prefs.root = prefs;
    console.debug('⚙️ Indexer preferences loaded:', {
      historyEnabled: this.#prefs['history-enabled'],
      historyDays: this.#prefs['history-days'],
      maxResults: this.#prefs['history-max-results']
    });
  }
  async query(ignored = []) {
    const query = {};
    if (this.#prefs.index === 'window' || this.#prefs.index === 'tab') {
      query.currentWindow = true;
    }
    if (this.#prefs.index === 'tab') {
      query.active = true;
    }
    const tabs = {};
    const list = new Set();
    for (const tab of await chrome.tabs.query(query)) {
      const o = {
        tab,
        skip: false,
        reasons: []
      };
      if (this.#prefs.duplicates) {
        if (list.has(tab.url)) {
          o.skip = true;
          o.reasons.push('DUPLICATED');
        }
        else if (tab.url && ignored.some(s => tab.url.includes(s))) {
          o.skip = true;
          o.reasons.push('USER_REQUEST');
        }
        else {
          list.add(tab.url);
        }
      }
      tabs[tab.id] = o;
    }

    return tabs;
  }
  async queryHistory(ignored = []) {
    if (!this.#prefs['history-enabled']) {
      console.debug('🕒 History search disabled');
      return {};
    }

    const startTime = Date.now() - (this.#prefs['history-days'] * 24 * 60 * 60 * 1000);
    console.debug('🕒 Querying browser history:', this.#prefs['history-days'], 'days back, max', this.#prefs['history-max-results'], 'results');
    
    const historyItems = await chrome.history.search({
      text: '',
      startTime: startTime,
      maxResults: this.#prefs['history-max-results']
    });
    
    console.debug('📖 Found', historyItems.length, 'history items');

    const items = {};
    const list = new Set();
    
    for (const item of historyItems) {
      const o = {
        historyItem: item,
        skip: false,
        reasons: []
      };
      
      if (this.#prefs.duplicates) {
        if (list.has(item.url)) {
          o.skip = true;
          o.reasons.push('DUPLICATED');
        } else if (item.url && ignored.some(s => item.url.includes(s))) {
          o.skip = true;
          o.reasons.push('USER_REQUEST');
        } else {
          list.add(item.url);
        }
      }
      
      items[`history_${item.id}`] = o;
    }

    return items;
  }
  async inspect(tab) {
    const od = {
      body: '',
      date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      description: '',
      keywords: '',
      lang: 'english',
      mime: 'text/html',
      title: tab.title,
      url: tab.url,
      top: true,
      favIconUrl: '',
      //
      frameId: 0
    };

    if (tab.discarded) {
      return [od];
    }

    const collect = async () => {
      try {
        const a = await chrome.scripting.executeScript({
          target: {
            tabId: tab.id,
            allFrames: true
          },
          files: ['/data/collect.js'],
          injectImmediately: true
        });
        const os = [];
        for (const b of a.filter(a => a && a.result)) {
          const o = b.result;
          o.frameId = b.frameId;

          if (this.#prefs.scope === 'both' || this.#prefs.scope === 'body') {
            if (!o.body) {
              if (o.mime === 'application/pdf' || o.url?.includes('.pdf')) {
                if (this.#prefs['parse-pdf']) {
                  try {
                    // update body and title
                    Object.assign(o, await this.#pdf(tab), {
                      pdf: true
                    });
                  }
                  catch (e) {
                    console.warn('Cannot parse PDF document', tab.url, e);
                  }
                }
              }
            }
          }
          os.push(o);
        }

        return os;
      }
      catch (e) {
        return [od];
      }
    };

    const os = await Promise.race([
      new Promise(resolve => setTimeout(resolve, this.#prefs['fetch-timeout'], [od])),
      collect()
    ]);

    for (const o of os) {
      o.lang = xapian.language(o.lang);
      o.title = o.top ? (o.title || tab.title || '') : (o.title || '');
      o.url = o.url || tab.url || '';

      o.favIconUrl = o.top ? (tab.favIconUrl || o.favIconUrl || '') : (o.favIconUrl || '');
    }

    return os;
  }
  async inspectHistory(historyItem) {
    console.debug('📡 Fetching content for history item:', historyItem.url);
    const lastVisitTime = new Date(historyItem.lastVisitTime);
    const od = {
      body: '',
      date: lastVisitTime.toISOString().split('T')[0].replace(/-/g, ''),
      description: '',
      keywords: '',
      lang: 'english',
      mime: 'text/html',
      title: historyItem.title || '',
      url: historyItem.url,
      top: true,
      favIconUrl: '',
      frameId: 0,
      visitCount: historyItem.visitCount,
      lastVisitTime: historyItem.lastVisitTime,
      typedCount: historyItem.typedCount
    };

    try {
      const response = await fetch(historyItem.url, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
        signal: AbortSignal.timeout(this.#prefs['fetch-timeout'])
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        od.mime = contentType || 'text/html';
        
        if (contentType && contentType.includes('text/html')) {
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          
          od.body = doc.body ? doc.body.innerText.trim() : '';
          od.title = doc.title || historyItem.title || '';
          
          const metaKeywords = doc.querySelector('meta[name="keywords" i]');
          if (metaKeywords) od.keywords = metaKeywords.content || '';
          
          const metaDescription = doc.querySelector('meta[name="description" i]');
          if (metaDescription) od.description = metaDescription.content || '';
          
          const htmlLang = doc.documentElement.lang;
          if (htmlLang) od.lang = xapian.language(htmlLang);
          
          const favicon = doc.querySelector('link[rel*="icon"]');
          if (favicon) od.favIconUrl = favicon.href || '';
          
          console.debug('✅ History content parsed:', od.title, '(' + od.body.length + ' chars)');
        }
      }
    } catch (e) {
      console.warn('❌ Cannot fetch content for history item:', historyItem.url, e);
    }

    return [od];
  }
  async add(tab, os) {
    const tasks = [];
    for (const o of os) {
      const vo = {
        mime: o.mime,
        keywords: o.keywords,
        date: o.date,
        description: o.description,
        lang: o.lang,
        url: o.url,
        title: this.#prefs.scope === 'body' ? '' : o.title,
        body: this.#prefs.scope === 'title' ? '' : o.body,
        timestamp: ''
      };
      const ho = {
        tabId: tab.id || -1,
        windowId: tab.windowId || -1,
        favIconUrl: o.favIconUrl,
        frameId: o.frameId,
        top: o.top,
        lang: o.lang,
        visitCount: o.visitCount || 0,
        lastVisitTime: o.lastVisitTime || Date.now(),
        typedCount: o.typedCount || 0,
        isHistory: !!tab.isHistory
      };
      if (this.#prefs['max-content-length'] > 0) {
        if (vo.body && vo.body.length > this.#prefs['max-content-length']) {
          // console.log('trimming', tab.url, vo.body.length);
          vo.body = vo.body.slice(0, this.#prefs['max-content-length']);
        }
      }
      tasks.push([vo, ho]);
    }
    return await xapian.add(tasks);
  }
  async reset() {
    await xapian.reset();
    await this.#prefs.root.remove('hashes');
  }
}

const indexer = new Indexer();
xapian.ready().then(async () => {
  const prefs = new Preferences();
  const ps = await prefs.get({
    'hashes': {},
    'clean-up': [], // tab ids to get re-indexed
    'user-exception-list': [] // patterns to get ignored by user
  });
  const hashes = {};
  let docs = 0;
  let ignored = 0;

  await indexer.prepare();
  const tabEntries = Object.entries(await indexer.query(ps['user-exception-list']));
  const historyEntries = Object.entries(await indexer.queryHistory(ps['user-exception-list']));
  const entries = [...tabEntries, ...historyEntries];
  
  console.debug('📋 Found', tabEntries.length, 'active tabs,', historyEntries.length, 'history items to process');

  if (ps['clean-up'].includes(-1)) {
    await xapian.reset();
    ps['hashes'] = {};
    ps['clean-up'] = [];
  }

  // run indexer on multiple tabs at once
  for (let n = 0; n < entries.length; n += 5) {
    const batchNum = Math.floor(n / 5) + 1;
    const totalBatches = Math.ceil(entries.length / 5);
    console.debug('🔄 Processing batch', batchNum + '/' + totalBatches, '(items', n + 1, '-', Math.min(n + 5, entries.length), ')');
    
    document.dispatchEvent(new CustomEvent('indexing-stat', {
      detail: {
        current: n,
        total: entries.length
      }
    }));

    await Promise.all([0, 1, 2, 3, 4].map(async m => {
      if (!entries[n + m]) {
        return;
      }
      const [id, entry] = entries[n + m];
      const {skip} = entry;
      
      if (skip) {
        ignored += 1;
        return;
      }

      const isHistoryItem = id.startsWith('history_');
      const item = entry.tab || entry.historyItem;
      const itemUrl = item.url;

      // item hash already been indexed
      if (id in ps.hashes) {
        if (itemUrl === ps.hashes[id].url) {
          if (ps['clean-up'].includes(id)) {
            // console.log('cleaning old entry for re-indexing', id, ps.hashes[id].guids);
            await xapian.remove(ps.hashes[id].guids, 0, false);
            delete ps.hashes[id];
          }
          else {
            // console.log('item is already in database', itemUrl);
            hashes[id] = ps.hashes[id];
            docs += hashes[id].guids.length;
            delete ps.hashes[id];
            return;
          }
        }
      }

      let frames;
      if (isHistoryItem) {
        frames = await indexer.inspectHistory(item);
        item.isHistory = true;
        item.id = id;
      } else {
        frames = (await indexer.inspect(item)).filter(o => {
          if (o.url || o.title || o.body) {
            return true;
          }
          return false;
        });
      }
      
      if (frames.length) {
        const guids = await indexer.add(item, frames);
        console.debug('✅ Indexed', isHistoryItem ? 'history item' : 'tab', ':', itemUrl, '(', guids.length, 'documents)');
        docs += guids.length;
        hashes[id] = {
          url: itemUrl,
          guids
        };
      }
    }));
  }

  // clean unused entries
  for (const [id, {guids}] of Object.entries(ps.hashes)) {
    // console.log('cleaning old entry', id, guids);
    await xapian.remove(guids, 0, false);
    delete ps.hashes[id];
  }
  // save
  await prefs.set({
    hashes,
    'clean-up': []
  });
  await xapian.sync();
  // ready
  console.debug('🎉 Indexing complete! Indexed', docs, 'documents, ignored', ignored, 'items');
  document.dispatchEvent(new CustomEvent('engine-ready', {
    detail: {
      docs,
      ignored
    }
  }));
});
