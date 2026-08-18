// Pembersih data dari sumber eksternal — output scraper selalu lewat sini
// supaya data yang dikembalikan bersih: URL cuma http(s), teks tanpa tag HTML.

/** URL javascript:, data:, vbscript: dan sejenisnya → kosongkan. */
export function sanitizeUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (/^\s*(javascript|data|vbscript):/i.test(trimmed)) return '';
  return trimmed;
}

/** Amankan nilai agar aman dipakai di atribut href/src (paksa http/https saja). */
export function safeHttpUrl(rawUrl) {
  const cleaned = sanitizeUrl(rawUrl);
  if (!cleaned) return '';
  try {
    const url = new URL(cleaned);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.href;
  } catch {
    return '';
  }
}

/** Buang tag HTML dan normalisasi spasi — untuk teks dari sumber eksternal. */
export function stripHtml(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
