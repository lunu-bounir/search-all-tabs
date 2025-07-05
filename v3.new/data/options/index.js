document.getElementById('support').onclick = () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url + '?rd=donate'
});

let id;
document.getElementById('save').onclick = async () => {
  await chrome.storage.local.set({
    'user-exception-list': document.getElementById('user-exception-list').value.split(/\s*,\s*/).filter((s, i, l) => {
      return s && l.indexOf(s) === i;
    })
  });
  clearTimeout(id);
  document.getElementById('toast').textContent = 'Options saved';
  id = setTimeout(() => {
    document.getElementById('toast').textContent = '';
  }, 750);
};

chrome.storage.local.get({
  'user-exception-list': []
}).then(prefs => document.getElementById('user-exception-list').value = prefs['user-exception-list'].join(', '));
