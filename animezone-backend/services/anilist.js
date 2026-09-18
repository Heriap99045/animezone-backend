import fetch from "node-fetch";
import { getCache, setCache } from "../cache.js";

const ANILIST_URL = "https://graphql.anilist.co";

// AniList membatasi ~90 request/menit per IP (jauh lebih longgar dari Jikan).
// Tetap kita antre + cache supaya aman dan hemat kuota.
let queue = Promise.resolve();
const MIN_GAP_MS = 250;

function enqueue(task) {
  const result = queue.then(async () => {
    const res = await task();
    await new Promise((r) => setTimeout(r, MIN_GAP_MS));
    return res;
  });
  queue = result.catch(() => {});
  return result;
}

const MEDIA_FIELDS = `
  idMal
  id
  title { romaji english }
  description(asHtml: false)
  genres
  episodes
  status
  averageScore
  coverImage { extraLarge large }
  siteUrl
  externalLinks { site url type }
`;

async function gqlFetch(query, variables, cacheKey, ttlMs) {
  const cached = getCache(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  const data = await enqueue(() => fetchWithRetry(query, variables));
  setCache(cacheKey, data, ttlMs);
  return { ...data, fromCache: false };
}

async function fetchWithRetry(query, variables, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("RATE_LIMITED");
    const isTransient = res.status === 502 || res.status === 503 || res.status === 504;
    if (isTransient && attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, attempt * 1000));
      return fetchWithRetry(query, variables, attempt + 1);
    }
    throw new Error(`AniList API error: ${res.status}`);
  }
  const json = await res.json();
  if (json.errors?.length) throw new Error(`AniList error: ${json.errors[0].message}`);
  return json.data;
}

// Ubah 1 item Media dari AniList jadi bentuk "raw" yang mirip Jikan,
// supaya routes/anime.js (fungsi simplify) tidak perlu diubah sama sekali.
function toJikanShape(m) {
  const plainSynopsis = (m.description || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&mdash;/g, "—")
    .replace(/&hellip;/g, "…")
    .trim();

  return {
    mal_id: m.idMal || m.id,
    title: m.title?.romaji,
    title_english: m.title?.english,
    synopsis: plainSynopsis,
    genres: (m.genres || []).map((g) => ({ name: g })),
    episodes: m.episodes,
    status: m.status,
    score: m.averageScore ? Math.round(m.averageScore) / 10 : null,
    images: { jpg: { large_image_url: m.coverImage?.extraLarge || m.coverImage?.large } },
    url: m.siteUrl,
    streaming: (m.externalLinks || [])
      .filter((l) => l.type === "STREAMING")
      .map((l) => ({ name: l.site, url: l.url })),
  };
}

/** Musim & tahun anime saat ini (dihitung dari tanggal server). */
function currentSeason(date = new Date()) {
  const month = date.getUTCMonth() + 1;
  let year = date.getUTCFullYear();
  let season;
  if ([12, 1, 2].includes(month)) season = "WINTER";
  else if ([3, 4, 5].includes(month)) season = "SPRING";
  else if ([6, 7, 8].includes(month)) season = "SUMMER";
  else season = "FALL";
  if (month === 12) year += 1; // Desember masuk musim WINTER tahun berikutnya
  return { season, year };
}

/** Cari anime berdasarkan judul/kata kunci. */
export async function searchAnime(query, page = 1) {
  const gql = `
    query ($search: String, $page: Int) {
      Page(page: $page, perPage: 20) {
        pageInfo { hasNextPage }
        media(search: $search, type: ANIME, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }
  `;
  const data = await gqlFetch(gql, { search: query, page }, `search:${query}:${page}`, 10 * 60 * 1000);
  return {
    data: (data.Page?.media || []).map(toJikanShape),
    pagination: { has_next_page: !!data.Page?.pageInfo?.hasNextPage },
    fromCache: data.fromCache,
  };
}

/** Detail satu anime berdasarkan ID MyAnimeList. */
export async function getAnimeById(id) {
  const gql = `
    query ($idMal: Int) {
      Media(idMal: $idMal, type: ANIME) { ${MEDIA_FIELDS} }
    }
  `;
  const data = await gqlFetch(gql, { idMal: Number(id) }, `detail:${id}`, 30 * 60 * 1000);
  return { data: toJikanShape(data.Media || {}), fromCache: data.fromCache };
}

/** Anime musim ini. */
export async function getSeasonalAnime() {
  const { season, year } = currentSeason();
  const gql = `
    query ($season: MediaSeason, $year: Int) {
      Page(page: 1, perPage: 20) {
        media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }
  `;
  const data = await gqlFetch(gql, { season, year }, `seasonal:${season}:${year}`, 60 * 60 * 1000);
  return { data: (data.Page?.media || []).map(toJikanShape), fromCache: data.fromCache };
}

/** Anime top/populer sepanjang masa. */
export async function getTopAnime(page = 1) {
  const gql = `
    query ($page: Int) {
      Page(page: $page, perPage: 20) {
        media(type: ANIME, sort: SCORE_DESC, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }
  `;
  const data = await gqlFetch(gql, { page }, `top:${page}`, 60 * 60 * 1000);
  return { data: (data.Page?.media || []).map(toJikanShape), fromCache: data.fromCache };
}

/** Anime berdasarkan genre (nama genre, mis. "Action", "Romance"). */
export async function getAnimeByGenre(genreName, page = 1) {
  const gql = `
    query ($genre: String, $page: Int) {
      Page(page: $page, perPage: 20) {
        media(genre: $genre, type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }
  `;
  const data = await gqlFetch(gql, { genre: genreName, page }, `genre:${genreName}:${page}`, 30 * 60 * 1000);
  return { data: (data.Page?.media || []).map(toJikanShape), fromCache: data.fromCache };
}
