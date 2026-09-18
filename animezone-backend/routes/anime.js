import { Router } from "express";
import {
  searchAnime,
  getAnimeById,
  getSeasonalAnime,
  getTopAnime,
  getAnimeByGenre,
} from "../services/jikan.js";

const router = Router();

// Bentuk ulang data mentah Jikan menjadi bentuk ringkas yang dipakai frontend
function simplify(item) {
  return {
    id: item.mal_id,
    title: item.title,
    titleEnglish: item.title_english,
    synopsis: item.synopsis,
    genres: (item.genres || []).map((g) => g.name),
    episodes: item.episodes,
    status: item.status,
    score: item.score,
    image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url,
    url: item.url, // tautan resmi ke halaman MyAnimeList (bukan streaming)
    // Tautan platform streaming legal — hanya terisi lengkap saat memanggil
    // endpoint detail (/api/anime/:id), karena butuh data "full" dari Jikan.
    streaming: (item.streaming || []).map((s) => ({ name: s.name, url: s.url })),
  };
}

router.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const page = Number(req.query.page) || 1;
    if (!q) return res.json({ results: [], page, hasMore: false });

    const data = await searchAnime(q, page);
    res.json({
      results: (data.data || []).map(simplify),
      page,
      hasMore: !!data.pagination?.has_next_page,
      fromCache: data.fromCache,
    });
  } catch (err) {
    handleError(res, err);
  }
});

router.get("/seasonal", async (_req, res) => {
  try {
    const data = await getSeasonalAnime();
    res.json({ results: (data.data || []).map(simplify), fromCache: data.fromCache });
  } catch (err) {
    handleError(res, err);
  }
});

router.get("/top", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const data = await getTopAnime(page);
    res.json({ results: (data.data || []).map(simplify), page, fromCache: data.fromCache });
  } catch (err) {
    handleError(res, err);
  }
});

router.get("/genre/:genreId", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const data = await getAnimeByGenre(req.params.genreId, page);
    res.json({ results: (data.data || []).map(simplify), page, fromCache: data.fromCache });
  } catch (err) {
    handleError(res, err);
  }
});

router.get("/:id", async (req, res) => {
  try {
    const data = await getAnimeById(req.params.id);
    res.json({ result: simplify(data.data), fromCache: data.fromCache });
  } catch (err) {
    handleError(err instanceof Error && err.message === "RATE_LIMITED" ? res.status(429) : res, err);
  }
});

function handleError(res, err) {
  const rateLimited = err instanceof Error && err.message === "RATE_LIMITED";
  console.error("[ANIMEZONE API error]", err.message);
  res.status(rateLimited ? 429 : 502).json({
    error: rateLimited
      ? "Terlalu banyak permintaan ke Jikan API, coba lagi sebentar lagi."
      : "Gagal mengambil data dari Jikan API.",
  });
}

export default router;
