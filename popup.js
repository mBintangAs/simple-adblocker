// ===== Simple Ad Blocker - Popup Logic =====
// Menghubungkan UI popup dengan service worker dan storage

const ENABLED_KEY = 'adblock_enabled';
const COUNT_KEY = 'blocked_count';
const DATE_KEY = 'count_date';

// Filter label untuk ditampilkan di list
const RULE_LABELS = [
  'adservice / ad-server',
  'ads.google',
  'facebook.com/tr (pixel)',
  'doubleclick.net',
  'analytics tracker',
  'pagead',
  'banner image'
];

document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('toggleAds');
  const statusEl = document.getElementById('status');
  const countEl = document.getElementById('blockedCount');
  const rulesList = document.getElementById('rulesList');
  const settingsBtn = document.getElementById('openSettings');

  // Tampilkan daftar aturan
  rulesList.innerHTML = '';
  RULE_LABELS.forEach(label => {
    const li = document.createElement('li');
    li.textContent = '• ' + label;
    rulesList.appendChild(li);
  });

  // Baca status dari storage
  const data = await chrome.storage.local.get([ENABLED_KEY, COUNT_KEY, DATE_KEY]);
  const today = new Date().toDateString();

  // Reset counter kalau sudah ganti hari
  if (data[DATE_KEY] !== today) {
    await chrome.storage.local.set({ [COUNT_KEY]: 0, [DATE_KEY]: today });
    data[COUNT_KEY] = 0;
  }

  const enabled = data[ENABLED_KEY] !== false;
  toggle.checked = enabled;
  updateStatus(statusEl, enabled);
  countEl.textContent = data[COUNT_KEY] || 0;

  // Toggle on/off
  toggle.addEventListener('change', async () => {
    const isOn = toggle.checked;
    await chrome.storage.local.set({ [ENABLED_KEY]: isOn });
    updateStatus(statusEl, isOn);
    // Kirim pesan ke service worker untuk enable/disable ruleset
    chrome.runtime.sendMessage({ action: isOn ? 'enable' : 'disable' });
  });

  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage?.();
  });
});

function updateStatus(el, enabled) {
  el.textContent = enabled ? 'Aktif' : 'Nonaktif';
  el.className = 'status ' + (enabled ? 'on' : 'off');
}

// Update counter secara real-time dari feedback
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'blocked') {
    const countEl = document.getElementById('blockedCount');
    if (countEl) countEl.textContent = msg.count;
  }
});
