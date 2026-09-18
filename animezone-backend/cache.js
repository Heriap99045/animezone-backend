// Cache in-memory sederhana dengan TTL (time-to-live).
// Untuk produksi skala besar, ganti dengan Redis — tapi untuk mulai, Map bawaan sudah cukup
// dan mengurangi jumlah panggilan ke Jikan API secara signifikan (hemat kuota rate limit).

const store = new Map();

/**
 * Ambil nilai dari cache. Mengembalikan null kalau tidak ada atau sudah kedaluwarsa.
 */
export function getCache(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * Simpan nilai ke cache dengan masa berlaku (ttlMs, default 10 menit).
 */
export function setCache(key, value, ttlMs = 10 * 60 * 1000) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Bersihkan seluruh cache (berguna untuk endpoint admin/debug). */
export function clearCache() {
  store.clear();
}
