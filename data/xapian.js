/* global FS, IDBFS, UTF8ToString */
'use strict';

var xapian = {};
xapian.cache = {};
xapian.config = {
  persistent: false,
  object: {
    store: true // if false, there will be no object storing (only indexing)
  },
  directories: ['/database'],
  database: 'storage'
};

var Module = {};

Module['onRuntimeInitialized'] = () => {
  const _add = Module.cwrap('add', null,
    ['number', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string']
  );
  const _clean = Module.cwrap('clean', null, ['number', 'string']);
  const _compact = Module.cwrap('compact', null, ['number', 'string']);
  const _release = Module.cwrap('release', null, ['number']);
  const _prepare = Module.cwrap('prepare', null, ['number', 'string']);
  const _commit = Module.cwrap('commit', null, ['number']);
  const _query = Module.cwrap('query', null, ['number', 'string', 'string', 'number', 'number', 'boolean', 'boolean', 'boolean', 'boolean']);
  const _percent = Module.cwrap('percent', 'number', ['number']);
  const _key = Module.cwrap('key', 'number', ['number']);
  const _languages = Module.cwrap('languages', 'string', []);
  const _snippet = Module.cwrap('snippet', 'string', ['string', 'string', 'number', 'string']);

  const toString = ptr => UTF8ToString(ptr); // eslint-disable-line new-cap

  xapian.compact = (index, directory) => new Promise((resolve, reject) => {
    _compact(index, directory);
    FS.syncfs(e => {
      if (e) {
        return reject(e);
      }
      resolve();
    });
  });

  xapian.release = index => {
    _release(index);
  };

  xapian.add = ({
    mime = '',
    keywords = '',
    date = '',
    description = '',
    lang = 'english',
    url,
    title,
    body,
    timestamp
  }, hidden = {}, guid, db = 0, sync = true) => new Promise((resolve, reject) => {
    const {hostname, pathname} = url ? new URL(url) : {
      hostname: '',
      pathname: ''
    };

    const filename = pathname;

    keywords = keywords.split(/\s*,\s*/).join(',');

    if (xapian.config.persistent) {
      const object = Object.assign({mime, url, hostname, title, body}, hidden, {
        timestamp: Date.now() || timestamp
      });
      if (guid) {
        object.guid = guid;
      }
      const next = guid => {
        try {
          _add(db, guid + '', lang, hostname, url, date, filename, mime, title, keywords, description, body);
          if (sync) {
            _commit(db);
            FS.syncfs(e => {
              if (e) {
                return reject(e);
              }
              resolve(guid + '');
            });
          }
          else {
            resolve(guid + '');
          }
        }
        catch (e) {
          reject(e);
        }
      };
      if (xapian.config.object.store) {
        const request = xapian.storage.transaction(['objects'], 'readwrite')
          .objectStore('objects').put(object);
        request.onsuccess = () => {
          next(request.result);
        };
        request.onerror = reject;
      }
      else {
        next(guid || Math.random());
      }
    }
    else {
      if (guid === undefined) {
        guid = xapian.add.guid + '';
        xapian.add.guid += 1;
      }
      _add(db, guid, lang, hostname, url, date, filename, mime, title, keywords, description, body);
      if (xapian.config.object.store) {
        xapian.cache[guid] = Object.assign({mime, url, hostname, title, body}, hidden);
      }
      resolve(guid);
    }
  });

  xapian.remove = (guid, db = 0, sync = true) => new Promise((resolve, reject) => {
    _clean(db, guid + '');
    if (xapian.config.persistent) {
      const next = () => {
        const request = xapian.storage.transaction(['objects'], 'readwrite').objectStore('objects')
          .delete(guid);
        request.onsuccess = resolve;
        request.onerror = reject;
      };
      if (sync) {
        _commit(db);
        FS.syncfs(e => {
          if (e) {
            return reject(e);
          }
          if (xapian.config.object.store) {
            next();
          }
          else {
            resolve();
          }
        });
      }
      else {
        next();
      }
    }
    else {
      delete xapian.cache[guid];
      resolve();
    }
  });

  xapian.search = ({query, start = 0, length = 30, lang = 'english', partial = true, spell_correction = false, synonym = false, descending = true}, db = 0) => {
    const pointer = _query(db, lang, query, start, length, partial, spell_correction, synonym, descending);
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
    return toString(_key(index));
  };
  // get body of "index"ed matching result
  xapian.search.body = index => {
    const guid = xapian.search.guid(index);
    return xapian.body(guid);
  };
  // get snippet based on the actual content of the "index"ed matching result
  // if body is not stored, content is mandatory
  xapian.search.snippet = ({index, lang = 'english', omit = '', content}) => {
    if (content) {
      return Promise.resolve(_snippet(lang, content, 300, omit));
    }
    if (xapian.config.object.store === false) {
      throw Error('xapian.search.snippet  is called without content');
    }
    const guid = xapian.search.guid(index);
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
    if (xapian.config.object.store === false) {
      throw Error('xapian.body is not available');
    }
    else if (xapian.config.persistent) {
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
    for (const directory of xapian.config.directories) {
      FS.mkdir(directory);
      FS.mount(IDBFS, {}, directory);
    }
    // sync local indexDB before opening the database
    FS.syncfs(true, e => {
      if (e) {
        return console.error(e);
      }
      xapian.config.directories.forEach((directory, index) => {
        _prepare(index, directory);
      });
      // object storage
      if (xapian.config.object.store) {
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
      }
      else {
        document.dispatchEvent(new Event('xapian-ready'));
      }
    });
  }
  else {
    xapian.config.directories.forEach((directory, index) => {
      _prepare(index, directory);
    });
    xapian.add.guid = 0;
    document.dispatchEvent(new Event('xapian-ready'));
  }
};

/* if trash is true, pinned recorders are skipped */
xapian.records = ({number = 3, offset = 0, direction = 'next', trash = false}) => {
  if (xapian.config.object.store === false) {
    throw Error('xapian.records is not available');
  }
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
  if (xapian.config.object.store === false) {
    throw Error('xapian.count is not available');
  }
  const request = xapian.storage.transaction(['objects'], 'readonly')
    .objectStore('objects')
    .count();
  request.onsuccess = e => resolve(e.target.result);
  request.onerror = reject;
});
