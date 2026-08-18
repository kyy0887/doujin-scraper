// Unit test lib/nekoScraper.js — parse HTML WordPress nekopoi.
// Berjalan offline: fetch di-mock dengan fixture yang meniru struktur asli.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scrapeNekoList,
  scrapeNekoCategory,
  scrapeNekoSearch,
  scrapeNekoDetail,
  scrapeNekoCategories,
} from '../lib/nekoScraper.js';

// Struktur home asli: <div class="nk-post-card"> → nk-post-thumb →
// nk-thumb-crop (background-image) → nk-post-meta → h2>a + span tanggal.
const FAKE_HOME = `<html><body>
<div class="nk-post-card">
<div class="nk-post-thumb"><div class="nk-thumb-crop" style="background-image: url('https://nekopoi.care/wp-content/uploads/thumb1.jpg')">
</div></div>
<div class="nk-post-meta">
<h2><a href="https://nekopoi.care/one-piece-hentai-sub-indo/">One Piece Hentai Sub Indo</a></h2>
<span><span class="dashicons dashicons-calendar-alt"></span>Senin, 10 Agustus 2026</span>
</div>
</div>
<div class="nk-post-card">
<div class="nk-post-thumb"><div class="nk-thumb-crop" style="background-image: url('https://nekopoi.care/wp-content/uploads/thumb2.jpg')">
</div></div>
<div class="nk-post-meta">
<h2><a href="https://nekopoi.care/naruto-xxx-sub-indo/">Naruto XXX Sub Indo</a></h2>
<span><span class="dashicons dashicons-calendar-alt"></span>Minggu, 9 Agustus 2026</span>
</div>
</div>
<a href="https://nekopoi.care/page/2/">Next</a>
</body></html>`;

// Struktur kategori asli: <a class="nk-search-item">…</a>
const FAKE_CATEGORY = `<html><body>
<a class="nk-search-item" href="https://nekopoi.care/jav-video-1/">
<div class="nk-search-thumb" style="background-image:url('https://nekopoi.care/wp-content/uploads/jav1.jpg')"></div>
<h2>JAV Video Satu</h2>
<p class="nk-search-desc">Deskripsi singkat video jav pertama</p>
</a>
<a class="nk-search-item" href="https://nekopoi.care/jav-video-2/">
<div class="nk-search-thumb" style="background-image:url('https://nekopoi.care/wp-content/uploads/jav2.jpg')"></div>
<h2>JAV Video Dua</h2>
<p class="nk-search-desc">Deskripsi singkat video jav kedua</p>
</a>
</body></html>`;

const FAKE_DETAIL = `<html><head><title>One Piece Hentai Sub Indo &#8211; NekoPoi</title></head>
<body>
<meta property="og:image" content="https://nekopoi.care/wp-content/uploads/thumb1.jpg" />
<iframe src="https://playmogo.com/e/abc123" width="100%" height="400"></iframe>
<iframe src="https://yandex.ru/video/preview/xyz"></iframe>
<iframe src="https://evil.example.com/tracker"></iframe>
<p>Sinopsis cerita panjang tentang petualangan di Grand Line dan seterusnya minimal empat puluh karakter.</p>
</body></html>`;

const FAKE_CATS =
  '<a href="https://nekopoi.care/category/hentai/">Hentai</a>' +
  '<a href="https://nekopoi.care/category/jav/">JAV</a>' +
  '<a href="https://nekopoi.care/category/jav/">JAV duplikat</a>';

function mockNeko(routes) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    for (const [path, body] of routes) {
      if (u.includes(path)) return { ok: true, text: async () => body };
    }
    throw new Error(`Mock fetch tidak mengenal URL: ${u}`);
  };
  return () => {
    globalThis.fetch = realFetch;
  };
}

test('scrapeNekoList: parse kartu home + deteksi halaman berikutnya', async () => {
  const restore = mockNeko([
    ['nekopoi.care/', FAKE_HOME],
    ['/page/2/', FAKE_HOME],
  ]);
  try {
    const { videos, hasNext } = await scrapeNekoList(1);
    assert.equal(videos.length, 2);
    assert.equal(hasNext, true);
    assert.equal(videos[0].title, 'One Piece Hentai Sub Indo');
    assert.equal(videos[0].slug, 'one-piece-hentai-sub-indo');
    assert.equal(videos[0].date, 'Senin');
    assert.match(videos[0].thumb, /^https:\/\/nekopoi\.care\//);
  } finally {
    restore();
  }
});

test('scrapeNekoList: halaman 2 memakai path /page/2/', async () => {
  const restore = mockNeko([['/page/2/', FAKE_HOME]]);
  try {
    const { videos } = await scrapeNekoList(2);
    assert.equal(videos.length, 2);
  } finally {
    restore();
  }
});

test('scrapeNekoCategory: parse format nk-search-item', async () => {
  const restore = mockNeko([['/category/hentai/', FAKE_CATEGORY]]);
  try {
    const { videos } = await scrapeNekoCategory('hentai', 1);
    assert.equal(videos.length, 2);
    assert.equal(videos[0].title, 'JAV Video Satu');
    assert.equal(videos[0].slug, 'jav-video-1');
    assert.match(videos[0].synopsis, /Deskripsi singkat/);
  } finally {
    restore();
  }
});

test('scrapeNekoSearch: parse hasil pencarian (format nk-search-item)', async () => {
  const restore = mockNeko([['/search/jav/', FAKE_CATEGORY]]);
  try {
    const { videos } = await scrapeNekoSearch('jav', 1);
    assert.equal(videos.length, 2);
    assert.equal(videos[0].title, 'JAV Video Satu');
  } finally {
    restore();
  }
});

test('scrapeNekoCategories: daftar kategori unik', async () => {
  const restore = mockNeko([['/hentai-list/', FAKE_CATS]]);
  try {
    const cats = await scrapeNekoCategories();
    assert.deepEqual(cats.map((c) => c.slug), ['hentai', 'jav']);
    assert.equal(cats[1].name, 'jav');
  } finally {
    restore();
  }
});

test('scrapeNekoDetail: judul entity ter-decode, player difilter, sinopsis bersih', async () => {
  const restore = mockNeko([['/one-piece-hentai-sub-indo/', FAKE_DETAIL]]);
  try {
    const detail = await scrapeNekoDetail('one-piece-hentai-sub-indo');
    assert.equal(detail.title, 'One Piece Hentai Sub Indo');
    assert.equal(detail.thumb, 'https://nekopoi.care/wp-content/uploads/thumb1.jpg');
    // playmogo + yandex lolos, evil.example.com dibuang
    assert.equal(detail.players.length, 2);
    assert.ok(detail.players.every((p) => !p.includes('evil')));
    assert.ok(detail.synopsis.length > 40);
  } finally {
    restore();
  }
});

test('scrapeNekoDetail: hasil di-cache (fetch hanya dipanggil sekali)', async () => {
  let fetchCount = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount++;
    return { ok: true, text: async () => FAKE_DETAIL };
  };
  try {
    await scrapeNekoDetail('slug-cache-test');
    await scrapeNekoDetail('slug-cache-test');
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});
