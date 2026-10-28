// ===== Simple Ad Blocker - YouTube Content Script (IMPROVED) =====
// Tangani YouTube ads yang disuntik ke DOM secara dinamis

(function () {
  'use strict';

  console.log('[AdBlocker-YT] Script loaded');

  let youtubeEnabled = true;
  let initDone = false;

  // Load setting dengan callback proper (jangan async race condition)
  chrome.storage.local.get(['youtube_enabled'], (result) => {
    youtubeEnabled = result.youtube_enabled !== false;
    console.log('[AdBlocker-YT] youtube_enabled:', youtubeEnabled);
    if (!initDone && youtubeEnabled) {
      init();
      initDone = true;
    }
  });

  // Listen setting changes real-time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.youtube_enabled) {
      youtubeEnabled = changes.youtube_enabled.newValue !== false;
      console.log('[AdBlocker-YT] Setting changed, enabled:', youtubeEnabled);
    }
  });

  // Selector yang aggressive untuk YouTube ads
  const AD_SELECTORS = [
    // Video player ads
    '.ytp-ad-module',
    '.ytp-ad-overlay-container',
    '.ytp-ad-player-overlay',
    '.ytp-ad-text-overlay',
    '.video-ads',
    '#player-ads',
    '.ytp-advertisement',
    'div[data-ad-container]',

    // Sidebar/promoted content
    'ytd-promoted-video-renderer',
    'ytd-display-ad-renderer',
    'ytd-companion-slot-renderer',
    'yt-formatted-string[role="status"][aria-label*="Ad"]',

    // Shelf ads
    '[role="complementary"] ytd-video-renderer',
    'ytd-shelf-renderer [data-ad]',

    // General catch-all
    '[class*="ad-"][class*="container"]',
    '[id*="ad_"]',
    '.ad-badge',
    '.ad-label'
  ];

  const SKIP_SELECTORS = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    'button[aria-label="Skip ad"]',
    'button[aria-label="Lewati"]',  // Indonesian
    '.ytp-skip-ad-button'
  ];

  let blockedCount = 0;
  let observer = null;

  function log(msg) {
    console.log('[AdBlocker-YT]', msg);
  }

  function notifyBlocked() {
    blockedCount++;
    log('Blocked #' + blockedCount);
    chrome.runtime.sendMessage({ action: 'blocked', count: blockedCount }).catch(() => {});
  }

  function clickSkipButton() {
    if (!youtubeEnabled) return;
    for (const sel of SKIP_SELECTORS) {
      const btns = document.querySelectorAll(sel);
      for (const btn of btns) {
        if (!btn.closest('.ytp-ad-skip-button-container[style*="display: none"]')) {
          try {
            btn.click();
            log('Clicked skip button: ' + sel);
            notifyBlocked();
            return true;
          } catch (e) {
            log('Failed to click: ' + e.message);
          }
        }
      }
    }
    return false;
  }

  function removeAdElements() {
    if (!youtubeEnabled) return;
    let removed = 0;
    
    for (const sel of AD_SELECTORS) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          // Skip jika element ada di dalam video player utama (bukan ad)
          if (el.closest('#movie_player') && !el.classList.toString().includes('ad')) {
            continue;
          }
          
          // Hide atau remove
          if (el.id === 'player-ads' || el.id === 'movie_player') {
            el.style.display = 'none';
          } else {
            try {
              el.remove();
            } catch (e) {
              el.style.display = 'none';
            }
          }
          removed++;
        }
      } catch (e) {
        // selector error, lanjut
      }
    }

    if (removed > 0) {
      log('Removed ' + removed + ' ad elements');
      notifyBlocked();
    }
    return removed > 0;
  }

  function hideOverlay() {
    if (!youtubeEnabled) return;
    const overlays = document.querySelectorAll('.ytp-ad-overlay-container, .ytp-ad-player-overlay, .ytp-advertisement');
    for (const o of overlays) {
      o.style.display = 'none';
      o.style.visibility = 'hidden';
      o.style.pointerEvents = 'none';
    }
  }

  function tick() {
    if (!youtubeEnabled) return;
    clickSkipButton();
    removeAdElements();
    hideOverlay();
  }

  function init() {
    log('Init started');

    // Immediate
    tick();

    // Periodic (aggressive - 300ms instead of 500ms)
    const interval = setInterval(() => {
      if (!youtubeEnabled) {
        clearInterval(interval);
        return;
      }
      tick();
    }, 300);

    // MutationObserver (detect new ad elements)
    try {
      observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'childList') {
            // Check if new nodes have ad indicators
            let hasAd = false;
            for (const node of m.addedNodes) {
              if (node.nodeType === 1) { // Element node
                if (node.className?.toString().includes('ad') || 
                    node.id?.toString().includes('ad') ||
                    node.tagName?.includes('ytd-ad') ||
                    node.getAttribute?.('data-ad-container')) {
                  hasAd = true;
                  break;
                }
              }
            }
            if (hasAd) tick();
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
      });
      log('MutationObserver started');
    } catch (e) {
      log('MutationObserver error: ' + e.message);
    }

    // Listen YouTube navigation (SPA)
    document.addEventListener('yt-navigate-finish', () => {
      log('Page navigated, tick');
      tick();
    });

    // Page load
    window.addEventListener('load', () => {
      log('Window load, tick');
      setTimeout(tick, 1000);
    });

    log('Init complete');
  }

  // Jangan tunggu async, langsung trigger init kalau enabled
  // (callback akan trigger lagi kalau sudah done)
  if (youtubeEnabled && !initDone) {
    init();
    initDone = true;
  }
})();
