# Simple Ad Blocker

Chrome extension Manifest V3 untuk memblokir iklan di web, termasuk YouTube.

## Fitur

- **Network-based blocking** — menggunakan `declarativeNetRequest` untuk memblokir request iklan (ads.google, doubleclick, analytics, dll)
- **YouTube ad removal** — content script menghapus overlay iklan YouTube dan auto-skip tombol skip
- **Toggle on/off** — enable/disable blocking dari popup extension
- **Counter** — hitung iklan yang diblokir per hari
- **Settings page** — kontrol YouTube blocking terpisah dari network blocking

## Struktur

```
├── manifest.json           # Konfigurasi extension MV3
├── popup.html/js/css      # UI popup toolbar
├── options.html/js        # Settings page
├── service-worker.js      # Background service worker
├── youtube-blocker.js     # Content script untuk YouTube
├── rules.json             # Blocking rules untuk declarativeNetRequest
└── icons/                 # Extension icons (16, 48, 128 px)
```

## Setup & Testing

1. Clone repo ini
2. Buka `chrome://extensions` → Developer mode ON
3. Load unpacked → pilih folder ini
4. Klik ikon extension → buka YouTube
5. Ads harus dihapus/di-skip otomatis

## Cara Kerja

### Blocking Rules (MV3 declarativeNetRequest)
- 7 aturan untuk memblokir request ad-related (network layer)
- Tidak perlu host permissions khusus
- Lebih cepat, less overhead dibanding MV2 webRequest

### YouTube Content Script
- Deteksi elemen iklan di DOM (.ytp-ad-*, ytd-promoted-*, dll)
- Click tombol "Skip Ad" otomatis
- Remove overlay ads yang menutupi video
- MutationObserver untuk elemen yang di-inject dinamis
- Interval 300ms + console logging buat debug

## Debug

Console buka F12 → filter `[AdBlocker-YT]` buat lihat log dari YouTube blocker.

## License

MIT
