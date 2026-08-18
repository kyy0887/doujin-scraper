# Agent Guide — Doujin Scraper

Konteks cepat untuk AI agent yang bekerja di project ini (membangun website, memperbaiki scraper, atau memakai library ini). Baca dulu sebelum mengubah kode.

## Apa project ini

Library scraper **tanpa dependensi runtime** — hanya menyediakan **data/kode mentah scraping**. Urusan keamanan web (CSP, anti-SSRF, proxy, rate limit) **bukan scope repo ini** — itu tanggung jawab developer yang memakai library.

- **doujin.desu.xxx** — manga/doujin/manhwa via API terenkripsi. File: `lib/scraper.js`.
- **nekopoi.care** — video via parse HTML WordPress. File: `lib/nekoScraper.js`.

Stack: JavaScript ESM (`"type": "module"`), Node.js ≥ 18, `fetch` bawaan. Tidak ada TypeScript, tidak ada dependensi runtime.

## Cara kerja & aturan wajib

### 1. doujin.desu.xxx (manga) — `lib/scraper.js`

- Response API **dienkripsi** (`_enc_resp_`): XOR berantai + key `generateKey(SALT + "_" + bucketJam)`, bucket = `Math.floor(Date.now()/3600000)`, dicoba bucket ±1. **Jangan ubah algoritma dekripsi/kandidat key** kecuali situs berubah.
- **⚠️ KRITIS: API mengabaikan parameter `page`** — halaman 1 & 2 selalu identik. Satu-satunya pagination yang benar: `offset` = `(page - 1) * limit`. Kalau ada bug pagination, cek dulu apakah ada yang mengirim `page`.
- Header wajib: `X-App-Secret`, `x-app-secret`, `x-device-id` (unik per request), `User-Agent` desktop Chrome.
- Secret/salt **bukan rahasia server** — di-embed di bundle JS situs (`/assets/index-*.js`). Ambil otomatis: `npm run get-secret` (ekstrak + verifikasi + isi `.env`). Kalau gagal, cari manual di bundle: `x-app-secret` (string 32-hex) dan `super-secret-salt`.
- `scrapeChapterImages(id)` → URL gambar signed dari `amz-ch.desu.pics` (valid ±24 jam), **butuh header `Referer: https://doujin.desu.xxx/`** saat fetch. URL ini yang dikembalikan apa adanya — urusan proxy untuk website ada di tangan developer.

### 2. nekopoi.care (video) — `lib/nekoScraper.js`

- WordPress, parse HTML langsung. 2 format kartu: `nk-post-card` (home) dan `nk-search-item` (kategori & hasil search `/search/{query}/`). `parseCards()` handle keduanya.
- Video = iframe `playmogo.com/e/{id}` (1–2 server/post) atau `yandex.ru`. **Host lain dibuang** (`ALLOWED_PLAYER_HOSTS`) supaya data bersih dari tracker/iklan.
- **⚠️ Fetch lambat** — `scrapeNekoDetail()` wajib pakai cache (`lib/cache.js`, TTL 600s) karena dipanggil 2x (generateMetadata + page); tanpa cache bisa timeout di serverless.
- Kategori: hentai, jav, 2d-animation, 3d-hentai, jav-cosplay (dari `/hentai-list/`).
- Neko **tidak butuh env** — hanya doujin yang butuh secret.

### 3. Pembersih data — `lib/clean.js`

- `safeHttpUrl()` — hanya URL `http(s)` yang lolos (buang `javascript:`, `data:`, dll).
- `stripHtml()` — buang tag HTML dari teks.
- Dipakai di kedua scraper supaya output selalu data bersih. Jangan hapus.

## Pola pemakaian untuk membangun website

```js
// 1. Setup env
//    npm run get-secret   (isi .env: DOUJIN_APP_SECRET + DOUJIN_SALT)

// 2. Ambil data (ESM)
import { scrapeMangaList, scrapeMangaDetail, scrapeChapterImages, scrapeGenres, searchManga } from './lib/scraper.js';
import { scrapeNekoList, scrapeNekoCategory, scrapeNekoSearch, scrapeNekoDetail, scrapeNekoCategories } from './lib/nekoScraper.js';

const list = await scrapeMangaList({ page: 1, limit: 24, type: 'manga', genre: 'netorare', sort: 'views' });
const detail = await scrapeMangaDetail('slug-manga');
const chapter = await scrapeChapterImages(detail.chapters[0].id); // → chapter.images[]
const neko = await scrapeNekoList(1);                 // → { videos, hasNext }
const cari = await scrapeNekoSearch('one piece', 1);  // → { videos, hasNext }
const watch = await scrapeNekoDetail('slug-video');   // → watch.players[] (iframe)
```

Catatan untuk developer web (di luar scope repo):
- Gambar chapter butuh proxy dengan `Referer` → buat route proxy sendiri.
- Player neko tinggal ditampilkan sebagai `<iframe src={players[0]}>`.
- Security headers, rate limit, dan proteksi lainnya urusan developer.

## Testing & CI

- `npm test` — `node --test test/*.test.js`, **unit test offline** (fetch di-mock, tanpa env): dekripsi, mapping, parse neko, pembersih data.
- `npm run get-secret` — ekstrak & verifikasi key dari situs live.
- `npm run demo` — demo end-to-end semua fungsi (butuh `.env` terisi; neko tanpa env).
- CI (`.github/workflows/ci.yml`): unit test Node 18/20/22 + smoke test `get-secret` ke API live. Jangan commit `.env` (sudah di `.gitignore`).

## Gotcha yang sudah pernah terjadi (jangan ulangi)

- ❌ Kirim `page` ke API doujindesu → halaman 1 & 2 sama persis. ✅ `offset = (page-1)*limit` (sudah otomatis di scraper).
- ❌ `decryptHex` mengubah byte-stream: untuk roundtrip unicode harus lewat `decodeURIComponent` (jalur `decryptResponse`), bukan langsung `decryptHex`.
- ❌ Scrape detail nekopoi tanpa cache → timeout di serverless. ✅ `setCache` 600s.
- ❌ Menampilkan gambar chapter langsung di `<img>` → diblokir hotlink (butuh Referer). ✅ Proxy di sisi developer.
- ❌ `'nekopoi.care'.endsWith('.nekopoi.care')` = false → host exact juga harus ada di `ALLOWED_HOSTS` (kalau developer bikin proxy sendiri).
- ❌ Jangan tambahkan fitur keamanan web (CSP, anti-SSRF, rate limit) ke repo ini — scope-nya hanya data.
