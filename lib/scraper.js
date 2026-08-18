// Scraper untuk Doujindesu.XXX (SPA + API terenkripsi)
//
// Situs doujin.desu.xxx sekarang adalah React SPA. Konten dimuat dari API
// /api/* dan response-nya dienkripsi (_enc_resp_) dengan algoritma XOR +
// key turunan waktu. Scraper ini meniru persis apa yang dilakukan bundle JS
// situs: kirim X-App-Secret + x-device-id, lalu dekripsi response-nya.
//
// Semua URL eksternal & teks dari API dibersihkan (lib/clean.js) supaya
// output selalu data mentah yang aman dipakai.
import { safeHttpUrl, stripHtml } from './clean.js';

const API_BASE = 'https://doujin.desu.xxx';
const APP_SECRET = process.env.DOUJIN_APP_SECRET || '';
const SALT = process.env.DOUJIN_SALT || '';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

if (!APP_SECRET || !SALT) {
  console.warn('[scraper] DOUJIN_APP_SECRET / DOUJIN_SALT belum diset di environment.');
}

// ── Dekripsi (port persis dari bundle situs) ──────────────────────────────

// Key generator: hash string ke 32 karakter printable.
// Diekspor untuk keperluan testing (lihat test/run.js).
export function generateKey(s) {
  let hash = 0;
  for (let n = 0; n < s.length; n++) {
    hash = (hash << 5) - hash + s.charCodeAt(n);
    hash |= 0;
  }
  let out = '';
  let x = Math.abs(hash) || 123456789;
  for (let n = 0; n < 32; n++) {
    x = (x * 1664525 + 1013904223) % 4294967296;
    out += String.fromCharCode(33 + (x % 93));
  }
  return out;
}

// Dekripsi XOR berantai. Diekspor untuk keperluan testing.
export function decryptHex(hex, key) {
  const bytes = [];
  for (let d = 0; d < hex.length; d += 2) {
    const w = hex.substring(d, d + 2);
    if (!w) break;
    bytes.push(parseInt(w, 16));
  }
  const out = [];
  const keyLen = key.length;
  let n = 42;
  for (let d = 0; d < bytes.length; d++) {
    const w = bytes[d];
    const p = key.charCodeAt(d % keyLen);
    const ch = w ^ p ^ (d * 13) ^ n;
    out.push(String.fromCharCode(ch & 255));
    n = (n + w) % 256;
  }
  return out.join('');
}

// Key rotation: 1 bucket per jam, coba bucket sekarang ± 1.
function candidateKeys() {
  const bucket = Math.floor(Date.now() / 3600000);
  return [bucket, bucket - 1, bucket + 1].map((b) => generateKey(`${SALT}_${b}`));
}

function decryptResponse(enc) {
  for (const key of candidateKeys()) {
    try {
      const decrypted = decryptHex(enc, key);
      return JSON.parse(decodeURIComponent(decrypted));
    } catch {
      // coba key berikutnya
    }
  }
  throw new Error('Gagal mendekripsi response server');
}

// ── HTTP ──────────────────────────────────────────────────────────────────

function deviceId() {
  return 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      'X-App-Secret': APP_SECRET,
      'x-app-secret': APP_SECRET,
      'x-device-id': deviceId(),
      'x-device-name': 'Desktop',
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} untuk ${path}`);
  }

  const text = await res.text();
  if (text.includes('_enc_resp_')) {
    return decryptResponse(JSON.parse(text)._enc_resp_);
  }
  return JSON.parse(text);
}

// ── Mapping data ──────────────────────────────────────────────────────────

// Item list → bentuk yang dipakai komponen (slug, thumb, rating, latestChapter)
function mapListItem(item) {
  if (!item || typeof item !== 'object') return null;
  const latestChapter = Array.isArray(item.chapters) ? item.chapters[0] : null;
  return {
    title: typeof item.title === 'string' ? item.title.slice(0, 500) : '',
    slug: typeof item.slug === 'string' ? item.slug.slice(0, 200) : '',
    thumb: safeHttpUrl(item.cover_url) || (typeof item.cover_url === 'string' && item.cover_url.startsWith('/') ? `https://doujin.desu.xxx${item.cover_url}` : ''),
    rating: item.rating != null ? item.rating : null,
    type: typeof item.type === 'string' ? item.type.slice(0, 50) : 'manga',
    status: typeof item.status === 'string' ? item.status.slice(0, 50) : null,
    latestChapter:
      latestChapter && latestChapter.chapter_number != null
        ? latestChapter.chapter_number
        : null,
  };
}

// Decode HTML entities lalu buang tag HTML — sisakan teks bersih untuk sinopsis.
// API mengirim HTML yang di-encode 2x (mis. &amp;gt; = "&gt;" literal), jadi decode
// dua pass agar entity yang muncul sebagai teks ikut beres.
const ENTITY_MAP = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&nbsp;': ' ',
  '&amp;': '&',
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
  '&lsquo;': '‘',
  '&rsquo;': '’',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&apos;': "'",
  '&hearts;': '♥',
  '&spades;': '♠',
  '&clubs;': '♣',
  '&diams;': '♦',
  '&star;': '★',
  '&bull;': '•',
  '&middot;': '·',
};
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const n = parseInt(code, 16);
      return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/&(lt|gt|quot|nbsp|amp|hellip|mdash|ndash|lsquo|rsquo|ldquo|rdquo|apos|hearts|spades|clubs|diams|star|bull|middot);/g, (m) => ENTITY_MAP[m]);
}
function cleanSynopsis(html) {
  if (!html) return '';
  let decoded = decodeEntities(html);
  if (decoded.includes('&lt;') || decoded.includes('&gt;') || decoded.includes('&quot;')) {
    decoded = decodeEntities(decoded);
  }
  return decoded
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '') // buang tag lain
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mapDetail(detail) {
  if (!detail || typeof detail !== 'object') return null;

  const genres = (Array.isArray(detail.manga_genres) ? detail.manga_genres : [])
    .map((g) => ({
      name: typeof g?.genres?.name === 'string' ? g.genres.name.slice(0, 100) : '',
      slug: typeof g?.genres?.slug === 'string' ? g.genres.slug.slice(0, 100) : '',
    }))
    .filter((g) => g.name);

  const chapters = (Array.isArray(detail.chapters) ? detail.chapters : [])
    .map((ch) => ({
      id: ch?.id,
      number: ch?.chapter_number,
      title: typeof ch?.title === 'string' ? ch.title.slice(0, 300) : '',
      date: ch?.created_at ? new Date(ch.created_at).toLocaleDateString('id-ID') : '',
    }))
    .filter((ch) => ch.id != null);

  return {
    title: typeof detail.title === 'string' ? detail.title.slice(0, 500) : '',
    altTitle:
      typeof detail.alt_titles === 'string' ? detail.alt_titles.slice(0, 500) : null,
    thumb: safeHttpUrl(detail.cover_url) || (typeof detail.cover_url === 'string' && detail.cover_url.startsWith('/') ? `https://doujin.desu.xxx${detail.cover_url}` : ''),
    rating: detail.rating != null ? detail.rating : null,
    status: typeof detail.status === 'string' ? detail.status.slice(0, 50) : null,
    type: typeof detail.type === 'string' ? detail.type.slice(0, 50) : 'manga',
    synopsis: cleanSynopsis(detail.description),
    author:
      typeof detail.author === 'string'
        ? detail.author.slice(0, 200)
        : typeof detail.author?.name === 'string'
          ? detail.author.name.slice(0, 200)
          : null,
    artist:
      typeof detail.artist === 'string'
        ? detail.artist.slice(0, 200)
        : typeof detail.artist?.name === 'string'
          ? detail.artist.name.slice(0, 200)
          : null,
    genres,
    chapters,
    views: Number.isFinite(detail.views) ? detail.views : 0,
  };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Ambil daftar manga dengan filter lengkap.
 *
 * Catatan: API doujin.desu.xxx mengabaikan parameter `page` — hasil halaman
 * 1 dan 2 selalu identik. Satu-satunya cara pagination yang benar adalah
 * parameter `offset`. `offset` = (page - 1) * limit.
 *
 * @param {object} opts
 * @param {number} [opts.page=1] - halaman (bisa dalam, sampai ratusan)
 * @param {string} [opts.query=''] - kata kunci pencarian
 * @param {string} [opts.type=''] - 'manga' | 'doujinshi' | 'manhwa'
 * @param {string} [opts.genre=''] - slug genre (mis. 'netorare')
 * @param {string} [opts.sort='latest_chapter'] - 'latest_chapter' | 'views' | 'rating'
 * @param {number} [opts.limit=24] - jumlah per halaman
 */
export async function scrapeMangaList({
  page = 1,
  query = '',
  type = '',
  genre = '',
  sort = 'latest_chapter',
  limit = 24,
} = {}) {
  const safePage = Math.max(1, parseInt(page) || 1);
  const params = new URLSearchParams({ limit: String(limit), sort });
  if (query) params.set('q', query);
  if (type) params.set('type', type);
  if (genre) params.set('genre', genre);
  // API tidak mendukung `page` — pakai `offset` supaya pagination beneran jalan.
  if (safePage > 1) params.set('offset', String((safePage - 1) * limit));

  const data = await apiGet(`/manga?${params.toString()}`);
  const list = Array.isArray(data) ? data : data.data || data.results || [];
  return list.map(mapListItem).filter(Boolean);
}

/** Ambil daftar genre beserta jumlah komiknya. */
export async function scrapeGenres() {
  const data = await apiGet('/genres?limit=200');
  const list = Array.isArray(data) ? data : data.data || data.results || [];
  return list
    .map((g) => ({
      slug: g.slug,
      name: g.name,
      count: g.manga_count || g._count?.manga_genres || 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function scrapeMangaDetail(slug) {
  const detail = await apiGet(`/manga/${slug}`);
  return mapDetail(detail);
}

export async function scrapeChapterImages(id) {
  const chapter = await apiGet(`/chapters/${id}`);
  if (!chapter.content_urls || chapter.content_urls.length === 0) {
    throw new Error('Chapter ini belum punya gambar');
  }
  const images = (Array.isArray(chapter.content_urls) ? chapter.content_urls : [])
    .map((u) => safeHttpUrl(u))
    .filter(Boolean);
  if (images.length === 0) {
    throw new Error('Chapter ini belum punya gambar');
  }
  return {
    images,
    mangaSlug:
      typeof chapter.manga_slug === 'string' ? chapter.manga_slug.slice(0, 200) : '',
    mangaTitle:
      typeof chapter.manga_title === 'string' ? chapter.manga_title.slice(0, 500) : '',
    title:
      typeof chapter.title === 'string'
        ? chapter.title.slice(0, 500)
        : `Chapter ${chapter.chapter_number || ''}`.trim(),
    number: chapter.chapter_number || null,
  };
}

export async function searchManga(query) {
  return scrapeMangaList({ query, limit: 24 });
}
