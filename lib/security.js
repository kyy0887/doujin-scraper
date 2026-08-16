// Utilitas keamanan bersama: validasi URL eksternal (anti-SSRF), sanitasi
// HTML/URL, dan konfigurasi CSP.

const PRIVATE_IP_RE =
  /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d)|198\.18\.|198\.19\.)/;
const IPV6_PRIVATE_RE =
  /^(::1$|::|fe80:|fc00:|fd00:|fec0:|2001:db8:|::ffff:)/i;
const LOCAL_HOSTNAMES = new Set([
  'localhost',
  'local',
  'metadata.google.internal',
  'metadata',
]);

function looksLikeIp(hostname) {
  const cleaned = hostname.replace(/^\[|\]$/g, '');
  // IPv6 literal
  if (cleaned.includes(':')) {
    return IPV6_PRIVATE_RE.test(cleaned);
  }
  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(cleaned)) {
    return PRIVATE_IP_RE.test(cleaned) || cleaned === '0.0.0.0';
  }
  return false;
}

/**
 * Tolak URL yang menunjuk ke resource internal (SSRF): hostname lokal,
 * IP private/loopback/link-local, atau resolusi DNS ke IP tersebut.
 * Port non-standar (bukan 80/443) juga ditolak.
 *
 * Catatan: fungsi ini berjalan di runtime Node.js (bukan Edge) — route yang
 * memakainya wajib `export const runtime = 'nodejs'` supaya bisa impor
 * node:dns/promises.
 */
export async function isSafeExternalUrl(rawUrl, { allowPorts = [80, 443] } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  if (!allowPorts.includes(Number(port))) return false;

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (LOCAL_HOSTNAMES.has(hostname)) return false;
  if (looksLikeIp(hostname)) return false;

  // DNS rebinding protection: pastikan hasil resolve bukan IP internal.
  // node:dns hanya tersedia di runtime Node — jangan import di level atas
  // file karena bisa kena bundle ke Edge runtime.
  try {
    const { lookup } = await import('node:dns/promises');
    const addresses = await lookup(hostname, { all: true });
    if (addresses.some((a) => looksLikeIp(a.address))) return false;
  } catch {
    // Resolve gagal → biarkan fetch yang menangani error
  }

  return true;
}

/** URL javascript:, data:, vbscript: dan sejenisnya → kosongkan. */
export function sanitizeUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (/^\s*(javascript|data|vbscript):/i.test(trimmed)) return '';
  return trimmed;
}

/** Buang tag HTML dan normalisasi spasi — untuk teks yang berasal dari sumber eksternal. */
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

/** Amankan nilai agar aman ditaruh di atribut href/src (paksa http/https saja). */
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
