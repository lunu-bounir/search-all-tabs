/* global UTF8ToString, FS, IDBFS */
'use strict';

const xapian = {
  name: 'object-storage-xapian'
};

// eslint-disable-next-line no-var
var Module = {};

Module['onRuntimeInitialized'] = () => {
  const _add = Module.cwrap('add', null, [
    'number', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string',
    'string', 'string'
  ]);
  const toString = ptr => UTF8ToString(ptr); // eslint-disable-line new-cap

  // add a new database
  xapian.new = (index, name) => {
    Module.cwrap('prepare', null, ['number', 'string'])(index, name);
  };

  xapian.release = index => {
    Module.cwrap('release', null, ['number'])(index);
  };

  xapian.add = (tasks, db = 0) => new Promise((resolve, reject) => {
    const jobs = [];

    for (const task of tasks) {
      const [{
        mime = '',
        keywords = '',
        date = '',
        description = '',
        lang = 'english',
        url,
        title,
        body,
        timestamp
      }, hidden = {}] = task;

      const {hostname, pathname} = url ? new URL(url) : {
        hostname: '',
        pathname: ''
      };

      const filename = pathname;

      const object = Object.assign({mime, url, hostname, title, body}, hidden, {
        timestamp: Date.now() || timestamp
      });

      jobs.push({
        args: [
          lang, hostname, url, date, filename, mime, title,
          keywords.split(/\s*,\s*/).join(','), description, body
        ],
        object
      });
    }

    const request = xapian.storage.transaction(['objects'], 'readwrite');
    const objectStore = request.objectStore('objects');
    const guids = [];

    jobs.forEach(job => {
      const putRequest = objectStore.put(job.object);
      putRequest.onsuccess = () => {
        const guid = putRequest.result + '';

        _add(db, guid, ...job.args);
        guids.push(guid);
      };

      putRequest.onerror = reject;
    });
    request.oncomplete = () => resolve(guids);
    request.onerror = reject;
  });

  xapian.remove = (guids, db = 0) => new Promise((resolve, reject) => {
    for (const guid of guids) {
      Module.cwrap('clean', null, ['number', 'string'])(db, guid + '');
    }

    const transaction = xapian.storage.transaction(['objects'], 'readwrite');
    const objectStore = transaction.objectStore('objects');

    guids.forEach(guid => {
      const request = objectStore.delete(Number(guid));
      request.onerror = e => {
        console.error(`Failed to delete GUID ${guid}`, e.target.error);
      };
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = e => reject(e.target.error);
  });

  xapian.sync = (db = 0) => {
    Module.cwrap('commit', null, ['number'])(db);
    Module.cwrap('compact', null, ['number', 'string'])(db, '/database');

    return new Promise((resolve, reject) => FS.syncfs(e => {
      if (e) {
        return reject(e);
      }
      resolve();
    }));
  };

  xapian.search = ({
    query,
    start = 0,
    length = 30,
    lang = 'english',
    partial = true,
    spell_correction = false,
    synonym = false,
    descending = true
  }, db = 0) => {
    const pointer = Module.cwrap('query', null,
      ['number', 'string', 'string', 'number', 'number', 'boolean', 'boolean', 'boolean', 'boolean']
    )(
      db, lang, query, start, length, partial, spell_correction, synonym, descending
    );
    const rst = toString(pointer);
    if (rst.startsWith('Error: ')) {
      throw Error(rst.replace('Error: ', ''));
    }
    const [size, estimated] = rst.split('/');
    return {
      size: Number(size),
      estimated: Number(estimated)
    };
  };
  xapian.search.guid = index => {
    return toString(Module.cwrap('key', 'number', ['number'])(index));
  };
  // get body of "index"ed matching result
  xapian.search.body = index => {
    const guid = xapian.search.guid(index);
    return xapian.body(guid);
  };
  // get snippet based on the actual content of the "index"ed matching result
  // if body is not stored, content is mandatory
  xapian.search.snippet = ({index, lang = 'english', omit = '', content, size = 300}) => {
    const _snippet = Module.cwrap('snippet', 'string', ['string', 'string', 'number', 'string']);
    if (content) {
      return Promise.resolve(_snippet(lang, content, size, omit));
    }
    const guid = xapian.search.guid(index);
    return xapian.body(guid).then(obj => _snippet(lang, obj.body, size, omit));
  };
  // get weight percent of "index"ed matching result
  xapian.search.percent = index => {
    return Module.cwrap('percent', 'number', ['number'])(index);
  };

  xapian.body = guid => new Promise((resolve, reject) => {
    // if guid is auto generated, it is a number, though xapian storage returns string
    // we need to convert to search the IndexedDB database
    if (isNaN(guid) === false) {
      guid = Number(guid);
    }

    const request = xapian.storage.transaction(['objects'], 'readonly')
      .objectStore('objects')
      .openCursor(IDBKeyRange.only(guid));
    request.onsuccess = e => e.target.result ? resolve(e.target.result.value) : reject(Error('no result'));
    request.onerror = reject;
  });

  // open database in IDBFS or MEMFS state
  FS.mkdir('/database');
  FS.mount(IDBFS, {}, '/database');
  // sync local indexDB before opening the database
  FS.syncfs(true, e => {
    if (e) {
      return console.error(e);
    }
    xapian.initiate().then(() => {
      for (const {resolve} of xapian.ready.cache) {
        resolve();
      }
      delete xapian.ready.cache;
      xapian.ready = () => Promise.resolve();
    }).catch(e => {
      console.error(e);
      alert(e.message);
    });
  });
};

xapian.initiate = () => new Promise((resolve, reject) => {
  xapian.new(0, '/database');
  // object storage
  const request = indexedDB.open(xapian.name, 1);
  request.onupgradeneeded = () => {
    const db = request.result;

    // Delete the old database if it exists
    if (db.objectStoreNames.contains('objects')) {
      db.deleteObjectStore('oldObjectStore');
    }
    // create new storage
    const store = db.createObjectStore('objects', {
      keyPath: 'guid',
      autoIncrement: true
    });
    store.createIndex('guid', 'guid', {
      unique: true
    });
    store.createIndex('timestamp', 'timestamp', {
      unique: false
    });
    store.createIndex('pinned', 'pinned', {
      unique: false
    });
  };
  request.onerror = e => reject(e.target.error);
  request.onsuccess = e => {
    xapian.storage = request.result;
    resolve();
  };
});

xapian.ready = () => new Promise(resolve => {
  xapian.ready.cache.push({resolve});
});
xapian.ready.cache = [];

xapian.language = code => {
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

xapian.reset = () => new Promise((resolve, reject) => {
  xapian.storage.close();
  const request = indexedDB.deleteDatabase(xapian.name);
  request.onsuccess = async () => {
    try {
      xapian.release(0);
      await xapian.initiate();
      await xapian.sync();
      resolve();
    }
    catch (e) {
      reject(e);
    }
  };
  request.onerror = e => reject(e.target.error);
});
