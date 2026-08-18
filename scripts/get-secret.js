#!/usr/bin/env node
// Ekstrak DOUJIN_APP_SECRET & DOUJIN_SALT langsung dari bundle JS
// doujin.desu.xxx, lalu isi .env secara otomatis.
//
// Nilai ini bukan rahasia server — browser klien butuh nilai yang sama untuk
// mendekripsi response API, jadi nilainya di-embed di bundle situs.
//
// Cara pakai:
//   npm run get-secret            # isi .env (tidak menimpa nilai yang ada)
//   npm run get-secret -- --force # timpa nilai yang sudah ada di .env
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env');
const HOME_URL = 'https://doujin.desu.xxx/';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FORCE = process.argv.includes('--force');

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${url}`);
  return res.text();
}

async function extractKeys() {
  console.log('1. Mengambil halaman', HOME_URL);
  const home = await fetchText(HOME_URL);

  const scripts = [...home.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map((m) => m[1]);
  const bundlePath =
    scripts.find((s) => s.includes('/assets/index-')) ||
    scripts.find((s) => s.includes('/assets/'));
  if (!bundlePath) {
    throw new Error('Bundle JS tidak ditemukan di halaman home (struktur situs berubah?)');
  }
  const bundleUrl = new URL(bundlePath, HOME_URL).href;

  console.log('2. Mengambil bundle', bundleUrl);
  const bundle = await fetchText(bundleUrl);

  // App secret: string hex 32 karakter yang dipakai sebagai X-App-Secret.
  const secretMatch = bundle.match(/([0-9a-f]{32})[\s\S]{0,500}?X-App-Secret/);
  // Salt: string yang mengandung "super-secret-salt".
  const saltMatch = bundle.match(/"([^"]*super-secret-salt[^"]*)"/);

  if (!secretMatch || !saltMatch) {
    throw new Error('Secret/salt tidak ditemukan di bundle (struktur situs berubah?)');
  }
  return { appSecret: secretMatch[1], salt: saltMatch[1] };
}

function updateEnv(appSecret, salt) {
  const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8').split('\n') : [];
  const set = (key, value) => {
    const i = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (i >= 0) lines[i] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  };
  const hasValue = (key) =>
    lines.some((l) => l.startsWith(`${key}=`) && l.length > `${key}=`.length);

  if (!hasValue('DOUJIN_APP_SECRET') || FORCE) set('DOUJIN_APP_SECRET', appSecret);
  if (!hasValue('DOUJIN_SALT') || FORCE) set('DOUJIN_SALT', salt);

  const out = lines.join('\n').replace(/\n+$/, '') + '\n';
  writeFileSync(ENV_PATH, out);
}

async function verify(appSecret, salt) {
  console.log('3. Verifikasi dengan memanggil API sungguhan...');
  process.env.DOUJIN_APP_SECRET = appSecret;
  process.env.DOUJIN_SALT = salt;
  const { scrapeMangaList } = await import('../lib/scraper.js');
  const list = await scrapeMangaList({ limit: 1 });
  if (!list.length) throw new Error('API merespons tapi hasil kosong');
  console.log(`   OK — dekripsi berhasil, contoh judul: "${list[0].title}"`);
}

try {
  const { appSecret, salt } = await extractKeys();
  console.log(`   DOUJIN_APP_SECRET = ${appSecret}`);
  console.log(`   DOUJIN_SALT       = ${salt}`);

  await verify(appSecret, salt);

  updateEnv(appSecret, salt);
  console.log(`4. ${FORCE ? 'Ditimpa' : 'Diisi'} di ${ENV_PATH} (lewati jika sudah terisi)`);
} catch (err) {
  console.error(`Gagal: ${err.message}`);
  process.exit(1);
}
