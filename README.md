# Simple Ad Blocker - Brave-like Architecture

Chrome extension Manifest V3 untuk memblokir iklan YouTube & web secara komprehensif.

## Arsitektur (4 Layers)

### Layer 1: Network Rules (declarativeNetRequest)
- **136 filter rules** blocking ad domains
- EasyList + YouTube-specific endpoints
- Blokir di level jaringan sebelum masuk browser

### Layer 2: API Response Patcher (youtube-api-patch.js)
- Intercept `window.fetch()` untuk YouTube API calls
- Strip `adPlacements`, `playerAds` dari playerResponse sebelum render
- **Cara Brave bekerja**: hapus iklan dari API response

### Layer 3: DOM Blocker (youtube-blocker.js)
- CSS injection (instant hide ad containers)
- Aggressive skip button clicking (100ms)
- Fallback DOM manipulation

### Layer 4: Player State Monitoring
- Deteksi video stuck (indikator ada playing)
- Force skip dengan seekTo()
- Monitor seekTo jumps

## Fitur

✓ Auto-skip ads  
✓ Mute non-skippable ads  
✓ Remove promoted videos  
✓ Counter iklan/hari  
✓ Settings page  
✓ Anti-detection hardening  

## Struktur

```
├── manifest.json              # MV3 config + content scripts
├── rules.json                 # 136 network blocking rules
├── youtube-api-patch.js       # API response stripping (MAIN world)
├── youtube-blocker.js         # DOM blocking (ISOLATED world)
├── service-worker.js          # Background service worker
├── popup.html/js/css          # Extension UI
├── options.html/js            # Settings page
└── icons/                     # Extension icons
```

## Setup & Testing

1. Clone repo ini
2. Buka `chrome://extensions` → Developer mode ON
3. Load unpacked → pilih folder ini
4. Buka YouTube → ads blocked

## License

MIT
