import express from "express";
import cors from "cors";
import animeRouter from "./routes/anime.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Izinkan frontend memanggil API ini. Ganti origin sesuai domain frontend kamu saat deploy.
app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    name: "ANIMEZONE API",
    status: "ok",
    endpoints: [
      "GET /api/anime/search?q=<judul>&page=1",
      "GET /api/anime/seasonal",
      "GET /api/anime/top?page=1",
      "GET /api/anime/genre/:genreId?page=1",
      "GET /api/anime/:id",
    ],
  });
});

app.use("/api/anime", animeRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint tidak ditemukan." });
});

app.listen(PORT, () => {
  console.log(`ANIMEZONE API berjalan di http://localhost:${PORT}`);
});
