# Snake Neo

Game ular (snake) browser sederhana dengan papan peringkat, rekor pribadi per tingkat kesulitan, dan pengembangan state. Dibangun dengan HTML, CSS, dan JavaScript murni, di-deploy sebagai Cloudflare Worker melalui Freebuff Sites dengan database D1 untuk penyimpanan skor.

## Fitur utama

- **Permainan snake** dengan canvas, efek partikel, dan flash saat mati
- **Tiga tingkat kesulitan**: Mudah, Sedang, Sulit (berbeda kecepatan dan langkah percepatan)
- **Papan peringkat per tingkat** (10 teratas) + riwayat skor lengkap (100 terbaru)
- **Rekor pribadi per tingkat** tersimpan di `localStorage`
- **Nama pemain terakhir** diingat otomatis
- **Tema warna** yang bisa diganti (hijau, biru, ungu, merah, kuning)
- **Mode gelap** tersimpan di `localStorage`
- **Suara** (Web Audio) dengan toggle on/off
- **Kontrol**: panah keyboard, tombol layar (DPAD), geser (swipe) pada canvas, dan gamepad (stick kiri / D-pad)
- **PWA**: service worker dan manifest untuk instalasi di perangkat
- **Simpan & lanjutkan**: state permainan tersimpan setiap 3 detik dan saat jeda, dapat dilanjutkan kembali
- **Bagikan skor** via Web Share API atau clipboard
- **Anti-cheat server-side**: batas skor maksimal per tingkat, rate limiter per IP (10 kirim/menit), validasi payload, dan cek duplikasi

## Struktur file

```
snake-game/     # Sumber utama (app.js, index.html, style.css, sw.js, site.webmanifest)
public/         # Salinan aset yang di-deploy (app.js, index.html, style.css, sw.js, site.webmanifest)
worker.js       # Cloudflare Worker + Score API (D1)
manifest.json   # Manifest deploy Freebuff Sites
README.md       # File ini
```

## Menjalankan secara lokal

Buka `snake-game/index.html` atau `public/index.html` langsung di browser (tidak perlu build step karena tidak menggunakan bundler). Untuk pengembangan Worker, gunakan Wrangler dengan `manifest.json` yang tertera.

## Teknologi

- HTML5 Canvas API
- Web Audio API (suara)
- Gamepad API
- Service Worker + Web App Manifest (PWA)
- Cloudflare Workers + D1 (via Freebuff Sites)

## Pengembang

**KerangRendang**

## Lisensi

Tidak ada lisensi spesifik — gunakan dan modifikasi sesuai kebutuhan.