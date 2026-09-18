import fetch from "node-fetch";
import { getCache, setCache } from "../cache.js";

const BASE_URL = "https://api.jikan.moe/v4";

// Jikan API (v4) dibatasi ~3 request/detik dan ~60 request/menit per IP.
// Kita pakai antrian sederhana supaya semua request dari banyak pengguna frontend
// tetap dijalankan berurutan dengan jeda aman, bukan langsung ditembak bersamaan.
let queue = Promise.resolve();
const MIN_GAP_MS = 400; // ~2.5 request/detik, di bawah batas 3/detik Jikan

function enqueue(task) {
  const result = queue.then(async () => {
    const res = await task();
    await new Promise((r) => setTimeout(r, MIN_GAP_MS));
    return res;
  });
  // Pastikan antrian tetap jalan meski satu task gagal
  queue = result.catch(() => {});
  return result;
}

async function jikanFetch(path, cacheKey, ttlMs) {
  const cached = getCache(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  const data = await enqueue(async () => fetchWithRetry(path));

  setCache(cacheKey, data, ttlMs);
  return { ...data, fromCache: false };
}

// Jikan (API gratis pihak ketiga) kadang timeout sesaat (504) meski jaringan kita normal.
// Kita coba ulang beberapa kali dengan jeda yang makin panjang sebelum benar-benar menyerah.
async function fetchWithRetry(path, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const res = await fetch(`${BASE_URL}${path}`, { signal: AbortSignal.timeout(15000) });

  if (!res.ok) {
    if (res.status === 429) throw new Error("RATE_LIMITED");

    const isTransient = res.status === 502 || res.status === 503 || res.status === 504;
    if (isTransient && attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, attempt * 1000)); // 1s, lalu 2s
      return fetchWithRetry(path, attempt + 1);
    }
    throw new Error(`Jikan API error: ${res.status}`);
  }
  return res.json();
}

/** Cari anime berdasarkan judul/kata kunci. */
export async function searchAnime(query, page = 1) {
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    limit: "20",
    sfw: "true", // filter konten dewasa
  });
  return jikanFetch(`/anime?${params}`, `search:${query}:${page}`, 10 * 60 * 1000);
}

/** Detail satu anime berdasarkan ID MyAnimeList. */
export async function getAnimeById(id) {
  return jikanFetch(`/anime/${id}/full`, `detail:${id}`, 30 * 60 * 1000);
}

/** Anime musim ini. */
export async function getSeasonalAnime() {
  return jikanFetch(`/seasons/now?sfw=true`, `seasonal`, 60 * 60 * 1000);
}

/** Anime top/populer sepanjang masa. */
export async function getTopAnime(page = 1) {
  return jikanFetch(`/top/anime?page=${page}&sfw=true`, `top:${page}`, 60 * 60 * 1000);
}

/** Anime berdasarkan genre (id genre Jikan, mis. 1 = Action). */
export async function getAnimeByGenre(genreId, page = 1) {
  const params = new URLSearchParams({
    genres: String(genreId),
    page: String(page),
    limit: "20",
    sfw: "true",
    order_by: "popularity",
    sort: "asc",
  });
  return jikanFetch(`/anime?${params}`, `genre:${genreId}:${page}`, 30 * 60 * 1000);
}
