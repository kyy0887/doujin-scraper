// Unit test lib/scraper.js — dekripsi doujindesu + mapping data.
// Berjalan offline: fetch di-mock, tidak butuh env.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKey, decryptHex, scrapeMangaList, scrapeMangaDetail, scrapeChapterImages, scrapeGenres, searchManga } from '../lib/scraper.js';

// ── generateKey ──────────────────────────────────────────────────────────

test('generateKey: deterministik untuk input sama', () => {
  assert.equal(generateKey('salt_123'), generateKey('salt_123'));
});

test('generateKey: panjang 32 karakter printable', () => {
  const key = generateKey('salt_123');
  assert.equal(key.length, 32);
  assert.match(key, /^[\x21-\x7e]{32}$/);
});

test('generateKey: input berbeda menghasilkan key berbeda', () => {
  assert.notEqual(generateKey('salt_124'), generateKey('salt_123'));
});

// ── decryptHex ───────────────────────────────────────────────────────────

// Enkripsi ulang (kebalikan decryptHex) untuk membuat vector test.
function encryptHex(plain, key) {
  const bytes = Buffer.from(plain, 'utf8');
  const out = [];
  const keyLen = key.length;
  let n = 42;
  for (let d = 0; d < bytes.length; d++) {
    const p = key.charCodeAt(d % keyLen);
    const w = (bytes[d] ^ p ^ (d * 13) ^ n) & 255;
    out.push(w.toString(16).padStart(2, '0'));
    n = (n + w) % 256;
  }
  return out.join('');
}

test('decryptHex: roundtrip mengembalikan teks asli', () => {
  const key = generateKey('salt_123');
  const msg = '{"hello":"world","n":42}';
  assert.equal(decryptHex(encryptHex(msg, key), key), msg);
});

test('decryptHex: key salah menghasilkan output yang bukan JSON', () => {
  const key = generateKey('salt_123');
  const wrong = decryptHex(encryptHex('{"a":1}', key), generateKey('salt_999'));
  assert.throws(() => JSON.parse(wrong));
});

test('decryptHex: roundtrip unicode via jalur decryptResponse (encodeURIComponent)', () => {
  const key = generateKey('salt_123');
  const msg = '{"title":"Nakadashi ♥ 日本語 — Café"}';
  // Jalur server asli: plaintext di-encodeURIComponent dulu (non-ASCII jadi
  // %XX ASCII), baru dienkripsi byte-per-byte. decryptResponse membaliknya:
  // decryptHex → decodeURIComponent → JSON.parse.
  const enc = encryptHex(encodeURIComponent(msg), key);
  const decrypted = decodeURIComponent(decryptHex(enc, key));
  assert.equal(decrypted, msg);
  assert.deepEqual(JSON.parse(decrypted), { title: 'Nakadashi ♥ 日本語 — Café' });
});

// ── Mapping data (fetch di-mock, response JSON langsung) ─────────────────

function mockFetch(routes) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    for (const [path, data] of routes) {
      if (u.includes(path)) {
        return new Response(JSON.stringify(data), {
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    throw new Error(`Mock fetch tidak mengenal URL: ${u}`);
  };
  return () => {
    globalThis.fetch = realFetch;
  };
}

test('scrapeMangaList: map item ke bentuk bersih; non-object dibuang', async () => {
  const restore = mockFetch([
    ['/api/manga', [
      {
        title: 'Judul <b>Bold</b>', slug: 'slug-a',
        cover_url: 'https://cdn.example.com/cover.jpg',
        rating: 8.8, type: 'manhwa', status: 'completed',
        chapters: [{ chapter_number: 55 }],
      },
      null,
      { title: 'Tanpa slug' },
    ]],
  ]);
  try {
    const list = await scrapeMangaList({ page: 1, limit: 24 });
    // null dibuang; object dengan slug kosong tetap di-map (slug: '')
    assert.equal(list.length, 2);
    assert.equal(list[0].slug, 'slug-a');
    assert.equal(list[0].rating, 8.8);
    assert.equal(list[0].latestChapter, 55);
    assert.equal(list[1].slug, '');
  } finally {
    restore();
  }
});

test('scrapeMangaList: page > 1 mengirim offset (bukan page)', async () => {
  let calledWith = '';
  const restore = mockFetch([
    ['/api/manga', []],
  ]);
  // Tangkap URL yang dipanggil
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calledWith = String(url);
    return new Response('[]', { headers: { 'content-type': 'application/json' } });
  };
  try {
    await scrapeMangaList({ page: 3, limit: 24 });
    assert.match(calledWith, /offset=48/);
    assert.doesNotMatch(calledWith, /[?&]page=/);
  } finally {
    globalThis.fetch = realFetch;
    restore();
  }
});

test('scrapeMangaDetail: map detail lengkap + sinopsis bersih', async () => {
  const restore = mockFetch([
    ['/api/manga/slug-x', {
      title: 'Judul', alt_titles: 'Judul Alternatif',
      cover_url: 'https://cdn.example.com/cover.jpg',
      rating: 9.1, status: 'publishing', type: 'manga',
      description: '<p>Sinopsis &hellip; &hearts;</p><p>Baris kedua</p>',
      author: { name: 'Penulis' }, artist: 'Artis',
      views: 12345,
      manga_genres: [{ genres: { name: 'MILF', slug: 'milf' } }, { genres: { name: '', slug: '' } }],
      chapters: [{ id: 1, chapter_number: 1, title: 'Ch 1', created_at: '2026-01-01T00:00:00Z' }],
    }],
  ]);
  try {
    const d = await scrapeMangaDetail('slug-x');
    assert.equal(d.title, 'Judul');
    assert.equal(d.author, 'Penulis'); // author object → name
    assert.equal(d.artist, 'Artis');   // artist string
    assert.equal(d.genres.length, 1);  // genre kosong dibuang
    assert.equal(d.genres[0].name, 'MILF');
    assert.equal(d.chapters.length, 1);
    assert.equal(d.chapters[0].id, 1);
    assert.match(d.synopsis, /Sinopsis … ♥/);
    assert.match(d.synopsis, /Baris kedua/);
    assert.doesNotMatch(d.synopsis, /<p>/);
  } finally {
    restore();
  }
});

test('scrapeChapterImages: hanya URL http(s) yang lolos', async () => {
  const restore = mockFetch([
    ['/api/chapters/999', {
      content_urls: [
        'https://amz-ch.desu.pics/ch/1.webp',
        'javascript:alert(1)',
        'not-a-url',
      ],
      manga_slug: 'slug-x', manga_title: 'Judul',
      title: 'Chapter Satu', chapter_number: 1,
    }],
  ]);
  try {
    const ch = await scrapeChapterImages(999);
    assert.equal(ch.images.length, 1);
    assert.equal(ch.images[0], 'https://amz-ch.desu.pics/ch/1.webp');
    assert.equal(ch.title, 'Chapter Satu');
  } finally {
    restore();
  }
});

test('scrapeChapterImages: chapter tanpa gambar melempar error', async () => {
  const restore = mockFetch([['/api/chapters/1', { content_urls: [] }]]);
  try {
    await assert.rejects(() => scrapeChapterImages(1), /belum punya gambar/);
  } finally {
    restore();
  }
});

test('scrapeGenres: sortir berdasarkan jumlah menurun', async () => {
  const restore = mockFetch([
    ['/api/genres', [
      { slug: 'a', name: 'A', manga_count: 5 },
      { slug: 'b', name: 'B', _count: { manga_genres: 50 } },
    ]],
  ]);
  try {
    const genres = await scrapeGenres();
    assert.equal(genres[0].slug, 'b');
    assert.equal(genres[0].count, 50);
  } finally {
    restore();
  }
});

test('searchManga: delegasi ke scrapeMangaList dengan query', async () => {
  const restore = mockFetch([['/api/manga?q=netorare', []]]);
  const realFetch = globalThis.fetch;
  let calledWith = '';
  globalThis.fetch = async (url) => {
    calledWith = String(url);
    return new Response('[]', { headers: { 'content-type': 'application/json' } });
  };
  try {
    await searchManga('netorare');
    assert.match(calledWith, /q=netorare/);
  } finally {
    globalThis.fetch = realFetch;
    restore();
  }
});
