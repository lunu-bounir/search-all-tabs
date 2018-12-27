/* global Pointer_stringify */
'use strict';

var xapian = {};
var Module = {};
Module['onRuntimeInitialized'] = () => {
  const _add = Module.cwrap('add', null,
    ['string', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string']
  );
  const _query = Module.cwrap('query', null, ['string', 'string', 'number', 'number']);
  const _percent = Module.cwrap('percent', 'number', ['number']);
  const _key = Module.cwrap('key', 'number', ['number']);
  const _languages = Module.cwrap('languages', 'string', []);
  const _snippet = Module.cwrap('snippet', 'string', ['string', 'string', 'number', 'string']);

  const toString = ptr => Pointer_stringify(ptr);

  const cache = {};
  let index = 0;

  xapian.add = ({
    mime = '',
    keywords = '',
    date = '',
    description = '',
    lang = 'english',
    url,
    title,
    body
  }, hidden = {}) => {
    const {hostname, pathname} = new URL(url);
    const filename = pathname;

    keywords = keywords.split(/\s*,\s*/).join(',');

    _add(index + '', lang, hostname, url, date, filename, mime, title, keywords, description, body);
    cache[index] = Object.assign({mime, url, hostname, title, body}, hidden);
    index += 1;
  };
  xapian.query = ({query, start = 0, length = 30, lang = 'english'}) => {
    const pointer = _query(lang, query, start, length);
    const [size, estimated] = toString(pointer).split('/');
    return {
      size: Number(size),
      estimated: Number(estimated)
    };
  };
  xapian.percent = index => {
    return _percent(index);
  };
  xapian.data = index => {
    const ptr = _key(index);
    return cache[toString(ptr)];
  };
  xapian.languages = () => {
    return _languages().split(' ');
  };
  xapian.snippet = ({index, lang = 'english', omit = ''}) => {
    const ptr = _key(index);
    const body = cache[toString(ptr)].body;
    console.log(1111, lang, body, 300, omit);
    return _snippet(lang, body, 300, omit);
  };
  document.dispatchEvent(new Event('xapian-ready'));
};

