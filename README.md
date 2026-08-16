# Doujin Scraper

Scraper ringan tanpa dependensi untuk mengambil data manga/doujin dan video, dengan keamanan built-in.

- **doujin.desu.xxx** — scraping dari API terenkripsi (XOR + key turunan waktu), pagination via `offset`, output bersih
- **nekopoi.care** — parsing HTML WordPress (home, kategori, detail post, iframe player), sanitasi ketat

## Fitur

- **Tanpa dependensi runtime** — murni `fetch` + regex, bisa jalan di Node.js 18+, Edge runtime, maupun Vercel serverless
- **Keamanan bawaan**:
  - Anti-SSRF: blokir IP private/loopback/link-local, DNS rebinding, port non-80/443
  - Sanitasi URL: tolak `javascript:`, `data:`, `vbscript:`
  - Strip HTML dari konten eksternal (sinopsis, judul)
  - Allowlist host player (iframe) & host gambar
- **Cache in-memory** dengan TTL (untuk detail yang fetch-nya lambat)

## Instalasi

```bash
npm install
# atau tanpa package manager — tidak ada dependensi
```

## Konfigurasi

Salin `.env.example` ke `.env` dan isi:

```env
DOUJIN_APP_SECRET=isi_dari_sumber
DOUJIN_SALT=isi_dari_sumber
```

Kedua nilai dipakai untuk dekripsi response API doujin.desu.xxx. Tanpa keduanya, scraper doujin tidak akan berfungsi (muncul warning).

## Penggunaan

### CommonJS

```js
const { scrapeMangaList, scrapeMangaDetail, scrapeChapterImages, scrapeGenres, searchManga } = require('./lib/scraper');

// Daftar manga (pagination pakai page, diubah ke offset di dalam)
const list = await scrapeMangaList({ page: 1, limit: 24, type: 'manga' });

// Detail + daftar chapter
const detail = await scrapeMangaDetail('slug-manga');

// Gambar chapter (URL signed, valid ±24 jam)
const chapter = await scrapeChapterImages(12345);

// Genre beserta jumlah komik
const genres = await scrapeGenres();
```

### ES Modules

```js
import { scrapeMangaList } from './lib/scraper.js';
// atau
import { scrapeNekoList, scrapeNekoCategory, scrapeNekoDetail, scrapeNekoCategories } from './lib/nekoScraper.js';

// NekoPoi — video terbaru
const { videos, hasNext } = await scrapeNekoList(1);

// Detail post: judul, thumbnail, sinopsis, daftar iframe player
const detail = await scrapeNekoDetail('slug-video');
```

### Environment di serverless (Vercel/Next.js)

File scraper membaca `process.env` langsung, jadi di Next.js cukup:

```js
// app/api/manga/route.js
import { scrapeMangaList } from '@/lib/scraper';
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const data = await scrapeMangaList({ page: 1 });
  return Response.json({ results: data });
}
```

## API Ringkas

| Fungsi | Sumber | Deskripsi |
|---|---|---|
| `scrapeMangaList({page, query, type, genre, sort, limit})` | doujindesu | Daftar manga dengan filter |
| `scrapeMangaDetail(slug)` | doujindesu | Detail manga + chapter |
| `scrapeChapterImages(id)` | doujindesu | URL gambar chapter |
| `scrapeGenres()` | doujindesu | Daftar genre + jumlah |
| `searchManga(query)` | doujindesu | Pencarian |
| `scrapeNekoList(page)` | nekopoi | Video terbaru (pagination) |
| `scrapeNekoCategory(category, page)` | nekopoi | Video per kategori |
| `scrapeNekoDetail(slug)` | nekopoi | Detail post + player iframe |
| `scrapeNekoCategories()` | nekopoi | Daftar kategori |

## Keamanan

- Semua URL eksternal (cover, gambar chapter, thumbnail, iframe player) divalidasi `safeHttpUrl()` — hanya `http(s)` yang lolos
- Anti-SSRF `isSafeExternalUrl()` dipakai untuk fetch — menolak alamat internal (127.0.0.1, 10.x, 192.168.x, 169.254.x, ::1, metadata cloud) dan port non-standar
- Konten HTML dari sumber di-strip (`stripHtml`) sebelum dipakai
- **Catatan:** `isSafeExternalUrl` mengimpor `node:dns/promises` secara dinamis — hanya berjalan di runtime Node.js, bukan Edge

## Lisensi

MIT — pakai, fork, dan modifikasi bebas.
