// ===== Simple Ad Blocker - Service Worker (Manifest V3) =====
// Mengelola ruleset declarativeNetRequest dan menghitung iklan yang diblokir

const ENABLED_KEY = 'adblock_enabled';
const COUNT_KEY = 'blocked_count';
const DATE_KEY = 'count_date';
const RULESET_ID = 'ruleset_1';

// Saat install: pastikan ruleset aktif
chrome.runtime.onInstalled.addListener(async () => {
  await enableRuleset();
  await chrome.storage.local.set({ [ENABLED_KEY]: true });
  resetCounterIfNewDay();
});

// Tangani pesan dari popup (toggle on/off)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'enable') {
    enableRuleset();
  } else if (msg.action === 'disable') {
    disableRuleset();
  }
});

// declarativeNetRequest feedback: hitung berapa banyak yang diblokir
chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(async (info) => {
  await incrementCounter();
});

async function enableRuleset() {
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: [RULESET_ID]
    });
    console.log('[AdBlocker] Ruleset enabled');
  } catch (e) {
    console.error('[AdBlocker] enable error', e);
  }
}

async function disableRuleset() {
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      disableRulesetIds: [RULESET_ID]
    });
    console.log('[AdBlocker] Ruleset disabled');
  } catch (e) {
    console.error('[AdBlocker] disable error', e);
  }
}

async function incrementCounter() {
  const today = new Date().toDateString();
  const data = await chrome.storage.local.get([COUNT_KEY, DATE_KEY]);

  if (data[DATE_KEY] !== today) {
    await resetCounterIfNewDay();
    return;
  }

  const newCount = (data[COUNT_KEY] || 0) + 1;
  await chrome.storage.local.set({ [COUNT_KEY]: newCount });

  // Broadcast ke popup kalau terbuka
  chrome.runtime.sendMessage({ action: 'blocked', count: newCount }).catch(() => {});
}

async function resetCounterIfNewDay() {
  const today = new Date().toDateString();
  await chrome.storage.local.set({ [COUNT_KEY]: 0, [DATE_KEY]: today });
}

// ===== API Stripping Stats (YouTube-specific) =====
let apiStripStats = {
  playerResponses: 0,
  adFieldsRemoved: 0,
  lastUpdate: new Date().toDateString()
};

// Listen untuk pesan dari youtube-api-patch tentang API interceptions
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'api-stripped') {
    apiStripStats.playerResponses++;
    apiStripStats.adFieldsRemoved += msg.fieldsRemoved || 0;
    apiStripStats.lastUpdate = new Date().toISOString();
    console.log('[AdBlocker-API] Stripped:', apiStripStats.playerResponses, 'responses');
  } else if (msg.action === 'stuck-video-detected') {
    console.log('[AdBlocker-Video] Stuck ad detected, forced skip');
    incrementCounter();
  } else if (msg.action === 'get-api-stats') {
    sendResponse({
      stats: apiStripStats,
      timestamp: new Date().toDateString()
    });
  }
});
