// ===== Simple Ad Blocker - YouTube Content Script (IMPROVED) =====
// Tangani YouTube ads yang disuntik ke DOM secara dinamis

(function () {
  'use strict';

  console.log('[AdBlocker-YT] Script loaded');

  let youtubeEnabled = true;
  let initDone = false;
  let isExtensionValid = true;

  // Inject CSS to hide ads immediately (before MutationObserver kicks in)
  function injectCSS() {
    try {
      const style = document.createElement('style');
      style.textContent = `
        /* Hide YouTube ad containers */
        .ytp-ad-module,
        .ytp-ad-overlay-container,
        .ytp-ad-player-overlay,
        .ytp-advertisement,
        .video-ads,
        #player-ads,
        .ytp-ad-text-overlay,
        .ytp-ad-skip-button-container,
        ytd-promoted-video-renderer,
        ytd-display-ad-renderer,
        ytd-companion-slot-renderer,
        [data-ad-container],
        [class*="ytd-ad-"],
        .ad-badge,
        .ad-label {
          display: none !important;
          visibility: hidden !important;
          height: 0 !important;
          width: 0 !important;
          pointer-events: none !important;
        }
        
        /* Hide promoted shelf */
        [role="complementary"] ytd-video-renderer,
        ytd-shelf-renderer [data-ad] {
          display: none !important;
        }

        /* Instant hide player overlay ads */
        .ytp-player-content .ytp-ad-player-overlay {
          display: none !important;
          visibility: hidden !important;
        }

        /* Mute audio for ad videos */
        .ytp-ad-module video,
        .video-ads video {
          -webkit-user-select: none;
          user-select: none;
        }
      `;
      if (document.head) {
        document.head.appendChild(style);
      } else if (document.documentElement) {
        document.documentElement.appendChild(style);
      }
      log('CSS injected for ad blocking');
    } catch (e) {
      log('CSS injection error: ' + e.message);
    }
  }

  // Inject CSS immediately
  injectCSS();

  // Check if extension context is valid
  function isContextValid() {
    try {
      chrome.runtime.getURL('');
      return true;
    } catch (e) {
      return false;
    }
  }

  // Load setting dengan callback proper (jangan async race condition)
  try {
    chrome.storage.local.get(['youtube_enabled'], (result) => {
      if (!isContextValid()) return;
      youtubeEnabled = result?.youtube_enabled !== false;
      console.log('[AdBlocker-YT] youtube_enabled:', youtubeEnabled);
      if (!initDone && youtubeEnabled) {
        init();
        initDone = true;
      }
    });
  } catch (e) {
    console.log('[AdBlocker-YT] storage.get error:', e.message);
  }

  // Listen setting changes real-time
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (!isContextValid()) return;
      if (area === 'local' && changes.youtube_enabled) {
        youtubeEnabled = changes.youtube_enabled.newValue !== false;
        console.log('[AdBlocker-YT] Setting changed, enabled:', youtubeEnabled);
      }
    });
  } catch (e) {
    console.log('[AdBlocker-YT] storage.onChanged error:', e.message);
  }

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
    try {
      chrome.runtime.sendMessage({ action: 'blocked', count: blockedCount }).catch((err) => {
        // Ignore: extension context invalidated setelah reload
      });
    } catch (e) {
      // Extension context invalid, silent fail
    }
  }

  function clickSkipButton() {
    if (!youtubeEnabled || !isContextValid()) return;
    for (const sel of SKIP_SELECTORS) {
      const btns = document.querySelectorAll(sel);
      for (const btn of btns) {
        // Check if button is actually visible and clickable
        const rect = btn.getBoundingClientRect?.();
        const isVisible = rect && rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight;
        
        if (isVisible) {
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

  // Aggressive skip — simulate mashing button for videos that require waiting
  function aggressiveSkip() {
    if (!youtubeEnabled) return;
    // Check for "Skip Ad" button and press it repeatedly
    for (const sel of SKIP_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn) {
        try {
          // Multiple clicks to ensure it registers
          btn.click();
          btn.click();
          notifyBlocked();
          return true;
        } catch (e) {}
      }
    }
  }

  // Detect if ad is currently playing
  function isAdPlaying() {
    // Method 1: Check for ad indicator in player
    const adIndicator = document.querySelector('.ad-showing, .ytp-ad-module[style*="block"]');
    if (adIndicator) return true;
    
    // Method 2: Check for skip button visibility (means ad is playing)
    for (const sel of SKIP_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) return true;
    }
    
    // Method 3: Check video title contains "Ad" or "Iklan"
    const titleEl = document.querySelector('h1.title yt-formatted-string, h1 yt-formatted-string');
    if (titleEl && (titleEl.textContent?.includes('Ad') || titleEl.textContent?.includes('Iklan'))) {
      return true;
    }
    
    return false;
  }

  // Speed up ad video (if possible) and force skip faster
  function speedUpAd() {
    if (!youtubeEnabled) return;
    if (!isAdPlaying()) return;
    
    try {
      const video = document.querySelector('video');
      if (video) {
        // DISABLED: playbackRate causes flickering + Google detects it
        // Just mute instead
        video.muted = true;
      }
    } catch (e) {}
    
    // Mash the skip button harder (only if available)
    aggressiveSkip();
  }

  // Black out ad display using overlay (safer than modifying video element)
  function blackoutAd() {
    if (!youtubeEnabled) return;
    if (!isAdPlaying()) return;
    
    try {
      // Just mute + speed up, no visual overlay (avoid flickering conflict with YouTube)
      const video = document.querySelector('video');
      if (video) {
        video.muted = true;
        // Don't change playback rate for locked ads (Google may detect)
        log('Muted non-skippable ad');
      }
    } catch (e) {}
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
      try {
        o.style.display = 'none';
        o.style.visibility = 'hidden';
        o.style.pointerEvents = 'none';
      } catch (e) {}
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
    aggressiveSkip();

    // Periodic (aggressive - 100ms for rapid skip button click)
    const interval = setInterval(() => {
      if (!youtubeEnabled || !isContextValid()) {
        clearInterval(interval);
        return;
      }
      aggressiveSkip();
      tick();
    }, 100);

    // MutationObserver (detect new ad elements)
    try {
      observer = new MutationObserver((mutations) => {
        if (!isContextValid()) {
          observer?.disconnect();
          return;
        }
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

      observer.observe(document.documentElement, {
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
      if (isContextValid()) {
        log('Page navigated, tick');
        tick();
      }
    });

    // Page load
    window.addEventListener('load', () => {
      if (isContextValid()) {
        log('Window load, tick');
        setTimeout(tick, 1000);
      }
    });

    log('Init complete');
  }

  // Jangan tunggu async, langsung trigger init kalau enabled
  if (youtubeEnabled && !initDone && isContextValid()) {
    init();
    initDone = true;
  }

  // Monitor extension context validity every 5 seconds
  setInterval(() => {
    isExtensionValid = isContextValid();
    if (!isExtensionValid) {
      log('Extension context invalidated, stopping');
      try {
        observer?.disconnect();
      } catch (e) {}
    }
  }, 5000);
})();
