// Scraper untuk NekoPoi (https://nekopoi.care/) — WordPress site.
// Konten: daftar post video (home/kategori), detail post dengan iframe player.
import { getCache, setCache } from './cache.js';
import { safeHttpUrl, stripHtml } from './clean.js';

const BASE = 'https://nekopoi.care';
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

// Hanya embed player dari host ini yang diizinkan masuk ke <iframe>.
const ALLOWED_PLAYER_HOSTS = ['playmogo.com', 'yandex.ru'];

async function getHtml(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${path}`);
  return res.text();
}

// Decode entity HTML dasar (&amp;, &#8211;, &#8217;, dll)
function decodeEntities(s) {
  return s
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8230;/g, '…')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// ── Ambil daftar kartu post dari HTML ────────────────────────────────────
// Struktur home: <div class="nk-post-card">...<h2><a href="...">judul</a></h2>
// Struktur kategori: <a class="nk-search-item"><div class="nk-search-thumb"
// style="background-image:url('...')">...<h2>judul</h2><p class="nk-search-desc">
function parseCards(html) {
  const cards = [];
  const push = (url, rawTitle, thumb, desc) => {
    const title = decodeEntities(stripHtml(rawTitle));
    if (!url || !title) return;
    // Hanya tautan internal nekopoi yang jadi kartu (cegah link eksternal/abusive)
    const cleanUrl = safeHttpUrl(url);
    if (!cleanUrl.startsWith(BASE)) return;
    cards.push({
      title,
      slug: cleanUrl.split('/').filter(Boolean).pop() || '',
      url: cleanUrl,
      thumb: safeHttpUrl(thumb.startsWith('http') ? thumb : `https:${thumb}`),
      date: '',
      synopsis: desc ? decodeEntities(stripHtml(desc)) : '',
    });
  };

  // Format 1: nk-post-card (home)
  const parts = html.split('class="nk-post-card"');
  for (let i = 1; i < parts.length; i++) {
    const blk = parts[i];
    const linkMatch = blk.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;
    const thumbMatch = blk.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/);
    const dateMatch = blk.match(/Minggu|Senin|Selasa|Rabu|Kamis|Jumat|Sabtu[^<]*/);
    push(linkMatch[1], linkMatch[2], thumbMatch ? thumbMatch[1] : '', '');
    if (dateMatch) cards[cards.length - 1].date = dateMatch[0].trim();
  }

  // Format 2: nk-search-item (kategori/list)
  const items = html.split('class="nk-search-item"');
  for (let i = 1; i < items.length; i++) {
    const blk = items[i];
    const urlMatch = blk.match(/href="([^"]+)"/);
    const thumbMatch = blk.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/);
    const titleMatch = blk.match(/<h2>([\s\S]*?)<\/h2>/);
    const descMatch = blk.match(/<p[^>]*class="nk-search-desc"[^>]*>([\s\S]*?)<\/p>/);
    push(
      urlMatch ? urlMatch[1] : '',
      titleMatch ? titleMatch[1] : '',
      thumbMatch ? thumbMatch[1] : '',
      descMatch ? descMatch[1] : ''
    );
  }

  return cards;
}

/** Ambil daftar video terbaru. @param {number} page - halaman (1 = home) */
export async function scrapeNekoList(page = 1) {
  const path = page <= 1 ? '/' : `/page/${page}/`;
  const html = await getHtml(path);
  const cards = parseCards(html);
  // Deteksi ada halaman berikutnya: cari link /page/(n+1)/
  const hasNext = html.includes(`/page/${page + 1}/`);
  return { videos: cards, hasNext };
}

/** Ambil daftar berdasarkan kategori (mis. hentai, jav, 2d-animation). */
export async function scrapeNekoCategory(category, page = 1) {
  const path = page <= 1 ? `/category/${category}/` : `/category/${category}/page/${page}/`;
  const html = await getHtml(path);
  return { videos: parseCards(html), hasNext: html.includes(`/page/${page + 1}/`) };
}

/** Cari video berdasarkan kata kunci (format hasil sama dengan kategori). */
export async function scrapeNekoSearch(query, page = 1) {
  const path = page <= 1 ? `/search/${query}/` : `/search/${query}/page/${page}/`;
  const html = await getHtml(path);
  return { videos: parseCards(html), hasNext: html.includes(`/page/${page + 1}/`) };
}

/** Ambil daftar kategori dari halaman genre-list/hentai-list. */
export async function scrapeNekoCategories() {
  try {
    const html = await getHtml('/hentai-list/');
    const cats = [];
    // Link kategori: /category/{slug}/
    const re = /href="https?:\/\/nekopoi\.care\/category\/([^"/]+)\/"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      if (!cats.some((c) => c.slug === m[1])) cats.push({ slug: m[1], name: m[1].replace(/-/g, ' ') });
    }
    return cats;
  } catch {
    return [];
  }
}

/** Ambil detail post: judul, thumbnail, iframe player, dan info lain. */
export async function scrapeNekoDetail(slug) {
  // Cache 10 menit — penting karena generateMetadata + page memanggil
  // fungsi ini 2x dalam satu request; fetch ke nekopoi.care lambat.
  const cacheKey = `neko-detail-${slug}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const html = await getHtml(`/${slug}/`);
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  const title = titleMatch
    ? decodeEntities(stripHtml(titleMatch[1].replace(/&#8211;.*$/, '')))
    : slug;

  // Thumbnail: og:image atau featured image
  const ogMatch = html.match(/property="og:image"\s+content="([^"]+)"/);
  const thumb = safeHttpUrl(ogMatch ? ogMatch[1] : '');

  // Player: hanya iframe dari host player yang dikenal (playmogo/yandex)
  // yang dikembalikan; iframe lain (tracker, iklan) dibuang.
  const players = [];
  const iframeRe = /<iframe[^>]+src="([^"]+)"/g;
  let m;
  while ((m = iframeRe.exec(html)) !== null) {
    const raw = m[1].startsWith('http') ? m[1] : `https:${m[1]}`;
    const clean = safeHttpUrl(raw);
    if (!clean) continue;
    let host;
    try {
      host = new URL(clean).hostname;
    } catch {
      continue;
    }
    if (ALLOWED_PLAYER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
      players.push(clean);
    }
  }

  // Sinopsis: cari paragraf setelah konten (approksimasi)
  const synopsisMatch = html.match(/<p>([\s\S]{40,600}?)<\/p>/);
  const synopsis = synopsisMatch ? decodeEntities(stripHtml(synopsisMatch[1])) : '';

  const detail = { title, slug, thumb, players, synopsis };
  setCache(cacheKey, detail, 600);
  return detail;
}
