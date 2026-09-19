// Dipanggil Vercel Cron tiap hari: pindahkan data lama dari Vercel Blob ke Redis begitu Blob bisa dibaca lagi.
// Selama Blob masih disuspend, link lama tetap dihidupkan dari daftar nama file (recoverFromListing).
// Aman dipanggil siapa saja — idempotent, tidak menimpa data baru, dan dibatasi cooldown saat Blob masih terblokir.
import { redis, cors, ensureMigrated, recoverFromListing } from './_db.js';

export default async function handler(req, res) {
  cors(res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const r = redis();
    const mig = await ensureMigrated(r);
    // Selama Blob masih disuspend, tetap pastikan semua link lama hidup sebagai placeholder
    const rec = mig.done ? { done: true } : await recoverFromListing(r);
    return res.status(200).json({
      done: mig.done,
      blocked: !!mig.blocked,
      busy: !!mig.busy,
      recovered: !!rec.done,
      recoveredAgents: rec.agents,
      recoveredLeaders: rec.leaders,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
