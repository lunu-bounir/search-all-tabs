/* global lunr */
const engine = window.engine = {
  records: [],
  idx: {},
  add(record, hidden) {
    engine.records.push({
      ...record,
      ...hidden
    });
  },
  search({query, origin, lang}) {
    origin = origin || query;
    const idx = engine.idx[lang] || lunr(function() {
      if (lang in lunr) {
        this.use(lunr[lang]);
        console.info('lunr language', lang);
      }
      else {
        console.info('lunr language', 'EN');
      }

      this.ref('guid');

      this.field('title', {
        boost: 1
      });
      this.field('body');
      this.field('mime');
      this.field('keywords');
      // this.field('date');
      this.field('description');
      this.field('lang');
      this.field('url');
      // this.field('timestamp');

      this.metadataWhitelist = ['position'];

      engine.records.forEach((record, guid) => {
        this.add({
          ...record,
          guid
        });
      });
    });
    engine.idx[lang] = idx;
    engine.result = idx.search(query);
    const size = engine.result.length;
    if (size === 0 && origin.indexOf('*') === -1 && origin.indexOf('"') === -1) {
      const ws = origin.split(/\s+/);
      const w = ws.pop();
      if (w.indexOf(':') === -1) {
        return engine.search({
          origin: query,
          query: ws.join(' ') + (ws.length ? ' ' : '') + '*' + w + '*',
          lang
        });
      }
      else {
        const [prefix, q] = w.split(':');
        return engine.search({
          origin: query,
          query: ws.join(' ') + (ws.length ? ' ' : '') + prefix + ':' + '*' + q + '*',
          lang
        });
      }
    }
    return {
      size,
      estimated: size
    };
  }
};

engine.search.guid = index => index;
engine.body = engine.search.body = index => {
  const n = engine.result[index].ref;
  return engine.records[n];
};
engine.search.percent = index => {
  const score = engine.result[index].score;
  return (Math.min(1, score) * 100).toFixed(0);
};
engine.search.snippet = ({index, size}) => {
  const n = engine.result[index].ref;
  const metadata = engine.result[index].matchData.metadata;
  // only consider keys that are in body
  const keys = Object.keys(metadata).filter(key => metadata[key].body);
  // positions to highlight
  if (keys.length) {
    const positions = keys.map(key => metadata[key].body.position).flat();
    const body = engine.records[n].body;
    // first index
    const startIndex = Math.max(0, body.substr(0, Math.min(...positions.map(a => a[0]))).lastIndexOf(' '));
    const length = Math.max(size, body.substr(startIndex + size).indexOf(' '));
    const highlights = [];
    for (const [x, len] of positions) {
      if (x >= startIndex && x + len <= startIndex + length) {
        highlights.push([x, len]);
      }
    }
    let snippet = '';
    let offset = startIndex;
    for (const [x, len] of highlights) {
      snippet += body.substring(offset, x) + '<b>' + body.substr(x, len) + '</b>';
      offset = x + len;
    }
    snippet += body.substring(offset, startIndex + length);
    return Promise.resolve(snippet);
  }
  return Promise.resolve('');
};

engine.language = code => {
  code = code.split('-')[0];

  return ({
    'fa': 'ar',
    'ur': 'ar',
    'du': 'nl',
    'zh': 'ja',
    'ko': 'ja'
  })[code] || code;
};

{
  const add = src => new Promise(resolve => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    document.body.appendChild(s);
  });
  Promise.all([
    add('../lunr/lunr.js'),
    add('../lunr/tiny_segmenter-0.2.js')
  ]).then(async () => {
    lunr.TinySegmenter = window.TinySegmenter;
    await add('../lunr/lunr.stemmer.support.js'),
    await Promise.all([
      add('../lunr/languages/lunr.ar.js'),
      add('../lunr/languages/lunr.da.js'),
      add('../lunr/languages/lunr.de.js'),
      add('../lunr/languages/lunr.es.js'),
      add('../lunr/languages/lunr.fi.js'),
      add('../lunr/languages/lunr.fr.js'),
      add('../lunr/languages/lunr.hu.js'),
      add('../lunr/languages/lunr.it.js'),
      add('../lunr/languages/lunr.ja.js'),
      add('../lunr/languages/lunr.nl.js'),
      add('../lunr/languages/lunr.no.js'),
      add('../lunr/languages/lunr.pt.js'),
      add('../lunr/languages/lunr.ro.js'),
      add('../lunr/languages/lunr.ru.js'),
      add('../lunr/languages/lunr.sv.js'),
      add('../lunr/languages/lunr.tr.js'),
      add('../lunr/languages/lunr.vi.js')
    ]);
  }).then(() => document.dispatchEvent(new Event('engine-ready')));
}
