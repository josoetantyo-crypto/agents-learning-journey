// Dipanggil Vercel Cron tiap hari: pindahkan data lama dari Vercel Blob ke Redis begitu Blob bisa dibaca lagi.
// Aman dipanggil siapa saja — idempotent, tidak menimpa data baru, dan dibatasi cooldown saat Blob masih terblokir.
import { redis, cors, ensureMigrated } from './_db.js';

export default async function handler(req, res) {
  cors(res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const mig = await ensureMigrated(redis());
    return res.status(200).json({ done: mig.done, blocked: !!mig.blocked, busy: !!mig.busy });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
