# ANIMEZONE Backend

API sederhana yang menjadi perantara ("proxy") antara frontend ANIMEZONE dan
[Jikan API](https://jikan.moe/) — API publik gratis yang menyediakan data
MyAnimeList (judul, sinopsis, genre, skor, poster). Semua data yang
dikembalikan adalah metadata publik, bukan file video, jadi legal digunakan.

## Menjalankan secara lokal

```bash
cd animezone-backend
npm install
npm start
```

Server akan berjalan di `http://localhost:3000`.

## Endpoint yang tersedia

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/anime/search?q=naruto&page=1` | Cari anime berdasarkan judul |
| GET | `/api/anime/seasonal` | Daftar anime musim ini |
| GET | `/api/anime/top?page=1` | Anime top/populer sepanjang masa |
| GET | `/api/anime/genre/:genreId?page=1` | Anime berdasarkan ID genre Jikan |
| GET | `/api/anime/:id` | Detail satu anime (sinopsis lengkap, dll) |

Contoh respons `/api/anime/search?q=naruto`:

```json
{
  "results": [
    {
      "id": 20,
      "title": "Naruto",
      "synopsis": "...",
      "genres": ["Action", "Adventure"],
      "episodes": 220,
      "score": 7.99,
      "image": "https://...",
      "url": "https://myanimelist.net/anime/20/Naruto"
    }
  ],
  "page": 1,
  "hasMore": true
}
```

## Kenapa ada cache & antrian permintaan?

Jikan API membatasi sekitar 3 permintaan/detik dan 60/menit per alamat IP.
Kalau setiap pengunjung frontend langsung memanggil Jikan, backend ini akan
cepat kena batas (`429 Too Many Requests`). Dua mekanisme di sini mengatasinya:

1. **Cache in-memory** (`cache.js`) — hasil pencarian/detail disimpan
   sementara (10–60 menit) supaya permintaan yang sama tidak berulang kali
   memanggil Jikan.
2. **Antrian permintaan** (`services/jikan.js`) — semua panggilan ke Jikan
   dijalankan berurutan dengan jeda ~400ms, bukan ditembak bersamaan.

Untuk trafik lebih besar, cache in-memory bisa diganti Redis, dan/atau
pertimbangkan menyimpan salinan data di database sendiri (PostgreSQL/MongoDB)
supaya tidak bergantung penuh pada Jikan saat trafik tinggi.

## Menghubungkan ke frontend

Frontend ANIMEZONE (file `animezone.html`) memanggil backend ini lewat
variabel `API_BASE` di bagian `<script>`. Saat menjalankan backend secara
lokal, buka `animezone.html` langsung di browser — secara default ia akan
mencoba `http://localhost:3000/api/anime`. Kalau backend tidak terjangkau,
frontend otomatis jatuh ke "mode demo" dengan data contoh, supaya halaman
tetap bisa ditampilkan.

## Deploy backend ke internet

Server Express seperti ini butuh proses yang terus berjalan (bukan file
statis), jadi tidak bisa dihosting sebagai halaman biasa. Opsi hosting
gratis/murah yang cocok:

- [Render](https://render.com) (Web Service, free tier)
- [Railway](https://railway.app)
- [Fly.io](https://fly.io)

Setelah backend live (misalnya di `https://animezone-api.onrender.com`),
ubah `API_BASE` di frontend ke URL tersebut, lalu publish ulang frontend-nya.

## Catatan lisensi

- Data dari Jikan API adalah data publik metadata (bukan streaming), sesuai
  [ketentuan penggunaan Jikan](https://docs.api.jikan.moe/).
- Backend ini **tidak** meng-hosting, menyimpan, atau mem-proxy file video
  anime apa pun — hanya metadata teks dan gambar poster resmi.
