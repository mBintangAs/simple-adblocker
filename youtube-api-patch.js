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

  // ---- Step 3: Monitor player state untuk detect ads non-skippable ----
  // Patch window.yt.player.seekTo & player.play buat track kapan ada playing
  
  setTimeout(() => {
    if (!window.yt || !window.yt.player) {
      console.log(TAG, 'window.yt.player not available yet, skipping...');
      return;
    }

    const player = window.yt.player;
    let lastSeekTime = 0;
    let adDetectionCount = 0;

    // Intercept seekTo — track jika jump mendadak (indikasi skip ad)
    if (typeof player.seekTo === 'function') {
      const origSeekTo = player.seekTo;
      player.seekTo = function(time, shouldQueue) {
        const current = this.getCurrentTime?.() || 0;
        const diff = Math.abs(time - current);
        
        // Jump > 10 detik = mungkin skip ad
        if (diff > 10 && enabled) {
          lastSeekTime = Date.now();
          console.log(TAG, 'seekTo detected jump:', current, '->', time, '(diff:', diff, ')');
        }
        return origSeekTo.call(this, time, shouldQueue);
      };
    }

    // Monitor currentTime — kalau stuck = indikasi ad playing
    let checkInterval = setInterval(() => {
      if (!enabled) {
        clearInterval(checkInterval);
        return;
      }

      try {
        const video = document.querySelector('video');
        if (!video || !video.duration) return;

        const current = video.currentTime;
        const duration = video.duration;
        const paused = video.paused;

        // Heuristic: kalau video stuck di posisi tertentu > 2 detik, tapi durasi normal = ad
        if (window.__adblockLastTime !== undefined) {
          const timeDiff = current - window.__adblockLastTime;
          const timeElapsed = (Date.now() - window.__adblockLastTime_ms) / 1000;

          // Time tidak maju tapi bukan paused = ad playing (frozen)
          if (Math.abs(timeDiff) < 0.1 && timeElapsed > 2 && !paused) {
            adDetectionCount++;
            if (adDetectionCount > 2) {
              console.log(TAG, 'Detected stuck video (ad?), forcing skip...');
              // Try jump forward
              video.currentTime = Math.min(current + 5, duration);
              adDetectionCount = 0;
            }
          } else {
            adDetectionCount = 0;
          }
        }

        window.__adblockLastTime = current;
        window.__adblockLastTime_ms = Date.now();
      } catch (e) {}
    }, 500);

    console.log(TAG, 'Player state monitoring started');
  }, 1000);
})();
