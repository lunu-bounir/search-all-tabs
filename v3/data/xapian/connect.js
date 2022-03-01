const iframe = document.createElement('iframe');

const post = (method, request) => new Promise((resolve, reject) => {
  const id = Math.random();
  post.cache[id] = {resolve, reject};
  iframe.contentWindow.postMessage({
    method,
    id,
    request
  }, '*');
});
post.cache = {};
window.addEventListener('message', e => {
  const {id, response, error} = e.data;

  if (response === 'xapian-ready') {
    xapian.new(0, '/database').then(() => {
      document.dispatchEvent(new Event('engine-ready'));
    });
  }
  else if (error) {
    post.cache[id].reject(Error(error));
  }
  else {
    post.cache[id].resolve(response);
  }
  delete post.cache[id];
});

const xapian = {};
window.engine = xapian;
xapian.cache = {};

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

xapian.add = ({
  mime = '',
  keywords = '',
  date = '',
  description = '',
  lang = 'english',
  url,
  title,
  body
}, hidden = {}, guid, db = 0) => {
  const {hostname, pathname} = url ? new URL(url) : {
    hostname: '',
    pathname: ''
  };
  const filename = pathname;

  keywords = keywords.split(/\s*,\s*/).join(',');

  if (guid === undefined) {
    guid = xapian.add.guid + '';
    xapian.add.guid += 1;
  }

  xapian.cache[guid] = Object.assign({mime, url, hostname, title, body}, hidden);
  return post('add', {
    args: [db, guid, lang, hostname, url, date, filename, mime, title, keywords, description, body]
  });
};
xapian.add.guid = 0;

xapian.search = ({query, start = 0, length = 30, lang = 'english', partial = true, spell_correction = false, synonym = false, descending = true}, db = 0) => {
  return post('search', {
    args: [db, lang, query, start, length, partial, spell_correction, synonym, descending]
  });
};
xapian.search.guid = index => post('key', {
  args: [index]
});
xapian.search.percent = index => post('percent', {
  args: [index]
});
xapian.search.snippet = async ({index, lang = 'english', omit = '', content, size = 300}) => {
  const guid = await xapian.search.guid(index);
  const {body} = await xapian.body(guid);

  return post('snippet', {
    args: [lang, body, size, omit]
  });
};
xapian.body = guid => xapian.cache[guid];
// add a new database
xapian.new = (index, name) => post('new', {
  args: [index, name]
});
xapian.release = index => post('release', {
  args: [index]
});

/* add iframe */
iframe.src = '/data/xapian/sandbox/index.html';
iframe.style.display = 'none';
document.body.appendChild(iframe);
