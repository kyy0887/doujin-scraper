# Doujin Scraper

Library scraping **tanpa dependensi runtime** untuk mengambil data manga/doujin dan video, siap dipakai di Node.js 18+ maupun serverless.

- **doujin.desu.xxx** — manga/doujin/manhwa via API terenkripsi (dekripsi otomatis, XOR + key turunan waktu)
- **nekopoi.care** — video via parse HTML WordPress (home, kategori, pencarian, detail, player iframe)

## Quickstart

```bash
npm run get-secret     # ekstrak & isi DOUJIN_APP_SECRET/DOUJIN_SALT otomatis dari situs
npm run demo           # lihat contoh hasil scrape manga + video
npm test               # unit test offline
```

## Konfigurasi

Cukup satu perintah — script mengambil halaman doujin.desu.xxx, menemukan bundle JS (`/assets/index-*.js`), mengekstrak kedua nilai, memverifikasi ke API asli, lalu mengisi `.env`:

```bash
npm run get-secret
```

```env
DOUJIN_APP_SECRET=   # string 32-hex di dekat "x-app-secret" di bundle situs
DOUJIN_SALT=         # string "super-secret-salt" di bundle situs
```

> Nilai ini bukan rahasia server — di-embed di bundle karena browser klien harus bisa mendekripsi response API sendiri. Kalau scraper tiba-tiba gagal dekripsi (situs ganti kunci), jalankan ulang `npm run get-secret`. Scraper nekopoi (video) **tidak butuh** env.

## Penggunaan

```js
// Manga (butuh .env terisi)
import { scrapeMangaList, scrapeMangaDetail, scrapeChapterImages, scrapeGenres, searchManga } from './lib/scraper.js';

const list = await scrapeMangaList({ page: 1, limit: 24, type: 'manga', genre: 'netorare', sort: 'views' });
const detail = await scrapeMangaDetail('slug-manga');          // sinopsis, genre, daftar chapter
const chapter = await scrapeChapterImages(detail.chapters[0].id); // URL gambar chapter
const genres = await scrapeGenres();
const hasil = await searchManga('kata kunci');

// Video Neko (tanpa env)
import { scrapeNekoList, scrapeNekoCategory, scrapeNekoSearch, scrapeNekoDetail, scrapeNekoCategories } from './lib/nekoScraper.js';

const { videos, hasNext } = await scrapeNekoList(1);           // terbaru + pagination
const kategori = await scrapeNekoCategory('jav', 1);           // per kategori
const cari = await scrapeNekoSearch('one piece', 1);           // pencarian
const watch = await scrapeNekoDetail('slug-video');            // detail + daftar player iframe
```

## Struktur Project

```
lib/
  scraper.js      # doujindesu: dekripsi API + list/detail/chapter/genre/search
  nekoScraper.js  # nekopoi: parse HTML (list, kategori, search, detail, player)
  clean.js        # pembersih data: URL http(s) saja + strip tag HTML
  cache.js        # cache in-memory (Map, TTL) untuk detail neko
scripts/
  get-secret.js   # ekstrak & isi key otomatis dari bundle situs
  demo.js         # contoh pemakaian semua fungsi
test/
  scraper.test.js     # dekripsi + mapping doujindesu
  nekoScraper.test.js # parse HTML nekopoi
  clean.test.js       # pembersih data
.github/
  workflows/ci.yml    # unit test Node 18/20/22 + smoke test live
.agent/
  skill/agent.md      # panduan untuk AI agent (baca sebelum coding)
```

## Bentuk data

### Manga (doujin.desu.xxx)

| Fungsi | Hasil |
|---|---|
| `scrapeMangaList({page, query, type, genre, sort, limit})` | `[{title, slug, thumb, rating, type, status, latestChapter}]` — pagination pakai `offset` di dalam |
| `scrapeMangaDetail(slug)` | `{title, altTitle, thumb, rating, status, type, synopsis, author, artist, genres[], chapters[], views}` |
| `scrapeChapterImages(id)` | `{images[], mangaSlug, mangaTitle, title, number}` — URL signed, valid ±24 jam, butuh header `Referer` saat di-fetch |
| `scrapeGenres()` | `[{slug, name, count}]` — diurutkan jumlah terbanyak |
| `searchManga(query)` | sama dengan `scrapeMangaList` |

### Video (nekopoi.care)

| Fungsi | Hasil |
|---|---|
| `scrapeNekoList(page)` | `{videos: [{title, slug, url, thumb, date, synopsis}], hasNext}` |
| `scrapeNekoCategory(category, page)` | sama — `category`: `hentai`, `jav`, `2d-animation`, `3d-hentai`, `jav-cosplay` |
| `scrapeNekoSearch(query, page)` | sama — format hasil seperti kategori |
| `scrapeNekoDetail(slug)` | `{title, slug, thumb, players[], synopsis}` — `players` = iframe embed (`playmogo.com`/`yandex.ru`), 1–2 server per video |
| `scrapeNekoCategories()` | `[{slug, name}]` |

## Catatan penting

- **Pagination manga:** API doujin.desu.xxx **mengabaikan parameter `page`** — halaman 1 & 2 selalu identik. Scraper sudah otomatis memakai `offset` = `(page-1) * limit`.
- **Gambar chapter:** URL signed butuh header `Referer: https://doujin.desu.xxx/` — kalau dipakai di website, developer perlu proxy sendiri untuk menambahkan Referer (di luar scope repo ini).
- **Player neko:** embed iframe `playmogo.com/e/{id}` — tinggal ditampilkan sebagai `<iframe>`, server alternatif ada di `players[1]`.
- **Cache:** `scrapeNekoDetail()` di-cache 10 menit (fetch nekopoi lambat).

## Test & CI

```bash
npm test
```

Unit test offline (fetch di-mock, tanpa env, tanpa network) — otomatis dijalankan GitHub Actions untuk Node 18/20/22 + smoke test `get-secret` ke API live.

## Dukungan

Suka project ini? Traktir kopi untuk pengembang:

[![Trakteer](https://img.shields.io/badge/Trakteer-Dukung%20Pengembang-ff5e5b)](https://trakteer.id/hengki_tamvan1233/tip)



## Lisensi

MIT — pakai, fork, dan modifikasi bebas.
