/* global UTF8ToString */

self.Module = {
  'onRuntimeInitialized'() {
    const {cwrap} = self.Module;

    self.add = cwrap('add', null,
      ['number', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string']
    );
    self.query = cwrap('query', null,
      ['number', 'string', 'string', 'number', 'number', 'boolean', 'boolean', 'boolean', 'boolean']
    );
    self.snippet = cwrap('snippet', 'string', ['string', 'string', 'number', 'string']);
    self.key = cwrap('key', 'number', ['number']);
    self.percent = cwrap('percent', 'number', ['number']);
    self.prepare = cwrap('prepare', null, ['number', 'string']);
    self.release = cwrap('release', null, ['number']);

    top.postMessage({
      response: 'xapian-ready'
    }, '*');
  }
};
const toString = ptr => UTF8ToString(ptr); // eslint-disable-line new-cap

const post = (id, c) => {
  try {
    top.postMessage({
      id,
      response: c()
    }, '*');
  }
  catch (e) {
    top.postMessage({
      id,
      error: e.message
    }, '*');
  }
};

window.addEventListener('message', e => {
  const {method, request, id} = e.data;

  if (method === 'add') {
    post(id, () => {
      self.add(...request.args);
      return '';
    });
  }
  else if (method === 'search') {
    const pointer = self.query(...request.args);
    const rst = toString(pointer);
    if (rst.startsWith('Error: ')) {
      top.postMessage({
        id,
        error: rst.replace('Error: ', '')
      }, '*');
    }
    else {
      const [size, estimated] = rst.split('/');
      top.postMessage({
        id,
        response: {
          size: Number(size),
          estimated: Number(estimated)
        }
      }, '*');
    }
  }
  else if (method === 'key') {
    post(id, () => toString(self.key(...request.args)));
  }
  else if (method === 'percent') {
    post(id, () => self.percent(...request.args));
  }
  else if (method === 'snippet') {
    post(id, () => self.snippet(...request.args));
  }
  else if (method === 'new') {
    post(id, () => self.prepare(...request.args));
  }
  else if (method === 'release') {
    post(id, () => self.release(...request.args));
  }
});
