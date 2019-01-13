/* global Pointer_stringify, FS, IDBFS */
'use strict';

var xapian = {};
xapian.cache = {};
xapian.config = {
  persistent: false,
  directory: '/database',
  database: 'storage'
};

var Module = {};

Module['onRuntimeInitialized'] = () => {
  const _add = Module.cwrap('add', null,
    ['string', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string']
  );
  const _clean = Module.cwrap('clean', null, ['string']);
  const _prepare = Module.cwrap('prepare', null, ['string']);
  const _commit = Module.cwrap('commit', null, []);
  const _query = Module.cwrap('query', null, ['string', 'string', 'number', 'number', 'boolean', 'boolean', 'boolean']);
  const _percent = Module.cwrap('percent', 'number', ['number']);
  const _key = Module.cwrap('key', 'number', ['number']);
  const _languages = Module.cwrap('languages', 'string', []);
  const _snippet = Module.cwrap('snippet', 'string', ['string', 'string', 'number', 'string']);

  const toString = ptr => Pointer_stringify(ptr);

  xapian.add = ({
    mime = '',
    keywords = '',
    date = '',
    description = '',
    lang = 'english',
    url,
    title,
    body
  }, hidden = {}, guid) => new Promise((resolve, reject) => {
    const {hostname, pathname} = url ? new URL(url) : {
      hostname: '',
      pathname: ''
    };

    const filename = pathname;

    keywords = keywords.split(/\s*,\s*/).join(',');

    if (xapian.config.persistent) {
      const object = Object.assign({mime, url, hostname, title, body}, hidden, {
        timestamp: Date.now()
      });
      if (guid) {
        object.guid = guid;
      }
      const request = xapian.storage.transaction(['objects'], 'readwrite')
        .objectStore('objects').put(object);
      request.onsuccess = () => {
        const guid = request.result;
        _add(guid + '', lang, hostname, url, date, filename, mime, title, keywords, description, body);
        _commit();
        FS.syncfs(e => {
          if (e) {
            return reject(e);
          }
          resolve();
        });
      };
      request.onerror = reject;
    }
    else {
      if (!guid) {
        guid = xapian.add.guid + '';
        xapian.add.guid += 1;
      }
      _add(guid, lang, hostname, url, date, filename, mime, title, keywords, description, body);
      xapian.cache[guid] = Object.assign({mime, url, hostname, title, body}, hidden);
      resolve();
    }
  });

  xapian.remove = guid => new Promise((resolve, reject) => {
    _clean(guid + '');
    if (xapian.config.persistent) {
      _commit();
      FS.syncfs(e => {
        if (e) {
          return reject(e);
        }
        const request = xapian.storage.transaction(['objects'], 'readwrite').objectStore('objects')
          .delete(guid);
        request.onsuccess = resolve;
        request.onerror = reject;
      });
    }
    else {
      delete xapian.cache[guid];
      resolve();
    }
  });

  xapian.search = ({query, start = 0, length = 30, lang = 'english', partial = true, spell_correction = false, synonym = false}) => {
    const pointer = _query(lang, query, start, length, partial, spell_correction, synonym);
    const [size, estimated] = toString(pointer).split('/');
    return {
      size: Number(size),
      estimated: Number(estimated)
    };
  };
  // get body of "index"ed matching result
  xapian.search.body = index => {
    const guid = toString(_key(index));
    return xapian.body(guid);
  };
  // get snippet based on the actual content of the "index"ed matching result
  xapian.search.snippet = ({index, lang = 'english', omit = ''}) => {
    const guid = toString(_key(index));
    if (xapian.config.persistent) {
      return xapian.body(guid).then(obj => _snippet(lang, obj.body, 300, omit));
    }
    else {
      const body = xapian.cache[guid].body;
      return Promise.resolve(_snippet(lang, body, 300, omit));
    }
  };
  // get weight percent of "index"ed matching result
  xapian.search.percent = index => {
    return _percent(index);
  };


  xapian.body = guid => new Promise((resolve, reject) => {
    if (xapian.config.persistent) {
      // if guid is auto generated, it is a number, though xapian storage returns string
      // we need to convert to search the indexeddb database
      if (isNaN(guid) === false) {
        guid = Number(guid);
      }
      const request = xapian.storage.transaction(['objects'], 'readonly')
        .objectStore('objects')
        .openCursor(IDBKeyRange.only(guid));
      request.onsuccess = e => resolve(e.target.result.value);
      request.onerror = reject;
    }
    else {
      resolve(xapian.cache[guid]);
    }
  });

  xapian.languages = () => {
    return _languages().split(' ');
  };

  // open database in IDBFS or MEMFS state
  if (xapian.config.persistent) {
    FS.mkdir(xapian.config.directory);
    FS.mount(IDBFS, {}, xapian.config.directory);
    // read local indexDB before opening the database
    FS.syncfs(true, e => {
      if (e) {
        return console.error(e);
      }
      _prepare(xapian.config.directory);
      //
      const request = indexedDB.open(xapian.config.database, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (db.objectStoreNames.contains('objects') === false) {
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
        }
      };
      request.onerror = e => console.error(e);
      request.onsuccess = () => {
        xapian.storage = request.result;
        document.dispatchEvent(new Event('xapian-ready'));
      };
    });
  }
  else {
    _prepare(xapian.config.directory);
    xapian.add.guid = 0;
    document.dispatchEvent(new Event('xapian-ready'));
  }
};

/* if trash is true, pinned recorders are skipped */
xapian.records = ({number = 3, offset = 0, direction = 'next', trash = false}) => {
  if (xapian.config.persistent) {
    return new Promise((resolve, reject) => {
      const store = xapian.storage.transaction(['objects'], 'readonly')
        .objectStore('objects');
      const request = store.index('timestamp').openCursor(null, direction);

      let i = 0;
      let ignore = offset !== 0;
      const results = [];
      request.onsuccess = e => {
        const cursor = e.target.result;
        if (!cursor || i === number) {
          return resolve(results);
        }
        if (ignore) {
          ignore = false;
          return cursor.advance(offset);
        }
        if (!trash || !cursor.value.pinned) {
          i += 1;
          results.push(cursor.value);
        }
        cursor.continue();
      };
      request.onerror = reject;
    });
  }
  else {
    const list = Object.keys(xapian.cache);
    if (direction === 'prev') {
      list.reverse();
    }
    return Promise.resolve(list.slice(0, number).map(id => xapian.cache[id]));
  }
};

xapian.count = () => new Promise((resolve, reject) => {
  const request = xapian.storage.transaction(['objects'], 'readonly')
    .objectStore('objects')
    .count();
  request.onsuccess = e => resolve(e.target.result);
  request.onerror = reject;
});
