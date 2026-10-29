// ===== Simple Ad Blocker - YouTube API Response Patcher (MAIN world) =====
// Berjalan di MAIN world (shared context dengan YouTube) untuk intercept
// API responses sebelum YouTube memprosesnya. Ini cara Brave blokir ads:
// buang adPlacements dari playerResponse SEBELUM video player render iklan.
//
// Content script ini dijalankan dengan "world": "MAIN" di manifest, jadi
// berbagi window.fetch / XMLHttpRequest dengan halaman YouTube.

(function () {
  'use strict';

  const TAG = '[AdBlocker-API]';

  // Endpoint YouTube yang mengembalikan data iklan
  const TARGET_ENDPOINTS = [
    'youtubei/v1/player',
    'youtubei/v1/next',
    'youtubei/v1/browse',
    'get_watch'
  ];

  let enabled = true;

  // Baca setting dari storage
  try {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['youtube_enabled'], (r) => {
        enabled = r.youtube_enabled !== false;
      });
    }
  } catch (e) {}

  // Buang semua field iklan dari object (rekursif di level 1)
  function stripAdFields(obj) {
    if (!obj || typeof obj !== 'object') return;

    // Hapus field iklan di level atas
    const AD_KEYS = [
      'adPlacements',
      'playerAds',
      'adBreakHeartbeatParams',
      'adBreakConfig',
      'adSlots',
      'adInfo',
      'adsConfig'
    ];

    for (const key of AD_KEYS) {
      if (key in obj) {
        delete obj[key];
      }
    }

    // Hapus di dalam playerResponse (struktur umum YouTube)
    if (obj.playerResponse && typeof obj.playerResponse === 'object') {
      for (const key of AD_KEYS) {
        if (key in obj.playerResponse) {
          delete obj.playerResponse[key];
        }
      }
    }

    // Hapus di dalam playabilityStatus / streamingData kalau ada flag ads
    if (obj.playerResponse && obj.playerResponse.streamingData) {
      // biarkan streamingData (itu video asli, bukan iklan)
    }
  }

  function shouldIntercept(url) {
    if (!url || !enabled) return false;
    return TARGET_ENDPOINTS.some((e) => url.indexOf(e) !== -1);
  }

  // ---- Patch fetch ----
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      const url = typeof input === 'string'
        ? input
        : (input && input.url) ? input.url : '';

      return origFetch.apply(this, arguments).then((response) => {
        if (!shouldIntercept(url)) return response;

        // Clone supaya body bisa dibaca tanpa mengonsumsi original
        let cloned;
        try {
          cloned = response.clone();
        } catch (e) {
          return response;
        }

        return cloned.text().then((text) => {
          try {
            const json = JSON.parse(text);
            const before = JSON.stringify(json).length;
            stripAdFields(json);
            const after = JSON.stringify(json).length;
            if (before !== after) {
              console.log(TAG, 'Stripped ad fields from', url.split('?')[0]);
            }
            return new Response(JSON.stringify(json), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          } catch (e) {
            // Bukan JSON, kembalikan response asli
            return response;
          }
        }).catch(() => response);
      });
    };
    console.log(TAG, 'fetch patched');
  }

  // ---- Patch XMLHttpRequest (fallback) ----
  const OrigXHRSend = XMLHttpRequest.prototype.send;
  const OrigXHROpen = XMLHttpRequest.prototype.open;
  if (typeof OrigXHRSend === 'function' && typeof OrigXHROpen === 'function') {
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__adblockUrl = url || '';
      return OrigXHROpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      const xhr = this;
      const url = xhr.__adblockUrl || '';

      if (shouldIntercept(url)) {
        const origAddEventListener = xhr.addEventListener;
        xhr.addEventListener = function (type, listener, opts) {
          if (type === 'readystatechange' || type === 'load') {
            const wrapped = function (ev) {
              if (xhr.readyState === 4 && xhr.responseText) {
                try {
                  const json = JSON.parse(xhr.responseText);
                  stripAdFields(json);
                  // Tidak bisa replace responseText langsung, tapi sebagian
                  // besar path YouTube pakai fetch — XHR ini fallback passive.
                } catch (e) {}
              }
              if (listener) listener.call(xhr, ev);
            };
            return origAddEventListener.call(xhr, type, wrapped, opts);
          }
          return origAddEventListener.call(xhr, type, listener, opts);
        };
      }
      return OrigXHRSend.apply(this, arguments);
    };
    console.log(TAG, 'XHR patched (passive)');
  }

  console.log(TAG, 'API patcher loaded, enabled =', enabled);
})();
