document.getElementById('support').onclick = () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url + '?rd=donate'
});

let id;
document.getElementById('save').onclick = async () => {
  const newSettings = {
    'user-exception-list': document.getElementById('user-exception-list').value.split(/\s*,\s*/).filter((s, i, l) => {
      return s && l.indexOf(s) === i;
    }),
    'history-enabled': document.getElementById('history-enabled').checked,
    'history-days': parseInt(document.getElementById('history-days').value) || 7,
    'history-max-results': parseInt(document.getElementById('history-max-results').value) || 1000
  };
  
  if (window.logger) {
    window.logger.debug('Saving extension settings:', newSettings);
  }
  await chrome.storage.local.set(newSettings);
  
  clearTimeout(id);
  document.getElementById('toast').textContent = 'Options saved';
  id = setTimeout(() => {
    document.getElementById('toast').textContent = '';
  }, 750);
};

// Update history options visibility
const updateHistoryOptionsVisibility = () => {
  const enabled = document.getElementById('history-enabled').checked;
  const options = document.getElementById('history-options');
  options.style.opacity = enabled ? '1' : '0.5';
  options.querySelectorAll('input').forEach(input => input.disabled = !enabled);
};

document.getElementById('history-enabled').addEventListener('change', updateHistoryOptionsVisibility);

chrome.storage.local.get({
  'user-exception-list': [],
  'history-enabled': false,
  'history-days': 7,
  'history-max-results': 1000
}).then(prefs => {
  if (window.logger) {
    window.logger.debug('Options page loaded with settings:', prefs);
  }
  document.getElementById('user-exception-list').value = prefs['user-exception-list'].join(', ');
  document.getElementById('history-enabled').checked = prefs['history-enabled'];
  document.getElementById('history-days').value = prefs['history-days'];
  document.getElementById('history-max-results').value = prefs['history-max-results'];
  updateHistoryOptionsVisibility();
});
