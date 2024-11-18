/* global xapian */

const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = './parser/pdf.worker.js';

class Preferences {
  get(prefs) {
    return new Promise(resolve => chrome.storage.local.get(prefs, resolve));
  }
  set(prefs) {
    return new Promise(resolve => chrome.storage.local.set(prefs, resolve));
  }
  remove(key) {
    return new Promise(resolve => chrome.storage.local.remove(key, resolve));
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
    const prefs = new Preferences();
    this.#prefs = await prefs.get({
      'fetch-timeout': 10000,
      'max-content-length': 100 * 1024,
      'scope': 'both',
      'parse-pdf': true,
      'index': 'browser',
      'duplicates': true
    });
    this.#prefs.root = prefs;
  }
  async query() {
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
        else {
          list.add(tab.url);
        }
      }
      tabs[tab.id] = o;
    }

    return tabs;
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
        tabId: tab.id,
        windowId: tab.windowId,
        favIconUrl: o.favIconUrl,
        frameId: o.frameId,
        top: o.top,
        lang: o.lang
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
    'clean-up': [] // tab ids to get re-indexed
  });
  const hashes = {};
  let docs = 0;
  let ignored = 0;

  await indexer.prepare();
  const entries = Object.entries(await indexer.query());

  if (ps['clean-up'].includes(-1)) {
    await xapian.reset();
    ps['hashes'] = {};
    ps['clean-up'] = [];
  }

  // run indexer on multiple tabs at once
  for (let n = 0; n < entries.length; n += 5) {
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
      const [id, {tab, skip}] = entries[n + m];
      if (skip) {
        ignored += 1;
        return;
      }

      // tab hash already been indexed
      if (id in ps.hashes) {
        if (tab.url === ps.hashes[id].url) {
          if (ps['clean-up'].includes(id)) {
            // console.log('cleaning old entry for re-indexing', id, ps.hashes[id].guids);
            await xapian.remove(ps.hashes[id].guids, 0, false);
            delete ps.hashes[id];
          }
          else {
            // console.log('tab is already in database', tab.url);
            hashes[id] = ps.hashes[id];
            docs += hashes[id].guids.length;
            delete ps.hashes[id];
            return;
          }
        }
      }

      const frames = (await indexer.inspect(tab)).filter(o => {
        if (o.url || o.title || o.body) {
          return true;
        }
        // ignored += 1;
        return false;
      });
      if (frames.length) {
        const guids = await indexer.add(tab, frames);
        // console.log('added tab to database', tab.url, guids);
        docs += guids.length;
        hashes[tab.id] = {
          url: tab.url,
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
  document.dispatchEvent(new CustomEvent('engine-ready', {
    detail: {
      docs,
      ignored
    }
  }));
});
