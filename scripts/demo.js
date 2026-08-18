#!/usr/bin/env node
// Demo pemakaian semua fungsi scraper — jalankan: npm run demo
//
// Doujin (manga) butuh DOUJIN_APP_SECRET & DOUJIN_SALT di .env (lihat
// `npm run get-secret`). Neko (video) tidak butuh env.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env sederhana (tanpa dependensi dotenv)
const ENV_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const SECTION = (t) => console.log(`\n=== ${t} ===`);

try {
  SECTION('Manga: daftar terbaru (doujindesu)');
  const { scrapeMangaList, scrapeMangaDetail, scrapeChapterImages, scrapeGenres } =
    await import('../lib/scraper.js');
  const list = await scrapeMangaList({ page: 1, limit: 3 });
  console.log(`${list.length} judul. Contoh:`);
  for (const m of list) {
    console.log(`  - ${m.title} (${m.type}, rating ${m.rating}, ch. ${m.latestChapter})`);
  }

  if (list.length) {
    SECTION('Manga: detail + chapter pertama');
    const detail = await scrapeMangaDetail(list[0].slug);
    console.log(`Judul: ${detail.title}`);
    console.log(`Chapter: ${detail.chapters.length}, genre: ${detail.genres.map((g) => g.name).join(', ')}`);
    console.log(`Sinopsis: ${(detail.synopsis || '').slice(0, 100)}...`);

    if (detail.chapters.length) {
      SECTION('Manga: gambar chapter (URL signed)');
      const ch = await scrapeChapterImages(detail.chapters[0].id);
      console.log(`${ch.images.length} gambar. Contoh URL:`);
      console.log(`  ${ch.images[0]}`);
      console.log('Catatan: URL signed valid ±24 jam dan butuh header Referer saat di-fetch.');
    }
  }

  SECTION('Manga: genre');
  const genres = await scrapeGenres();
  console.log(`${genres.length} genre. Teratas: ${genres.slice(0, 5).map((g) => `${g.name} (${g.count})`).join(', ')}`);

  SECTION('Neko: video terbaru (nekopoi.care)');
  const { scrapeNekoList, scrapeNekoSearch, scrapeNekoDetail, scrapeNekoCategories } =
    await import('../lib/nekoScraper.js');
  const { videos, hasNext } = await scrapeNekoList(1);
  console.log(`${videos.length} video, halaman berikutnya: ${hasNext}`);
  console.log(`  - ${videos[0]?.title}`);

  SECTION('Neko: pencarian');
  const { videos: hasil } = await scrapeNekoSearch('jav', 1);
  console.log(`${hasil.length} hasil untuk "jav":`);
  for (const v of hasil.slice(0, 3)) console.log(`  - ${v.title}`);

  SECTION('Neko: kategori');
  const cats = await scrapeNekoCategories();
  console.log(`Kategori: ${cats.map((c) => c.slug).join(', ')}`);

  if (videos.length) {
    SECTION('Neko: detail + player');
    const detail = await scrapeNekoDetail(videos[0].slug);
    console.log(`Judul: ${detail.title}`);
    console.log(`Player iframe (${detail.players.length}):`);
    for (const p of detail.players) console.log(`  ${p}`);
  }
} catch (err) {
  console.error(`\nError: ${err.message}`);
  console.error('Untuk data doujin: jalankan `npm run get-secret` dulu, lalu ulangi.');
  process.exit(1);
}
