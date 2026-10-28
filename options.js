// ===== Simple Ad Blocker - Options Page Logic =====

const ENABLED_KEY = 'adblock_enabled';
const YT_KEY = 'youtube_enabled';
const COUNT_KEY = 'blocked_count';

document.addEventListener('DOMContentLoaded', async () => {
  const toggleAds = document.getElementById('toggleAds');
  const toggleYoutube = document.getElementById('toggleYoutube');
  const resetBtn = document.getElementById('resetCount');
  const backBtn = document.getElementById('backBtn');

  // Load state
  const data = await chrome.storage.local.get([ENABLED_KEY, YT_KEY]);
  toggleAds.checked = data[ENABLED_KEY] !== false;
  toggleYoutube.checked = data[YT_KEY] !== false;

  // Toggle network rules (declarativeNetRequest)
  toggleAds.addEventListener('change', async () => {
    const isOn = toggleAds.checked;
    await chrome.storage.local.set({ [ENABLED_KEY]: isOn });
    chrome.runtime.sendMessage({ action: isOn ? 'enable' : 'disable' });
  });

  // Toggle YouTube content script
  toggleYoutube.addEventListener('change', async () => {
    const isOn = toggleYoutube.checked;
    await chrome.storage.local.set({ [YT_KEY]: isOn });
  });

  // Reset counter
  resetBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ [COUNT_KEY]: 0 });
    alert('Counter direset ke 0');
  });

  // Back to popup
  backBtn.addEventListener('click', () => {
    window.close();
  });
});
