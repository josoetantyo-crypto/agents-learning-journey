// Dipanggil Vercel Cron tiap hari: pindahkan data lama dari Vercel Blob ke Redis begitu Blob bisa dibaca lagi.
// Selama Blob masih disuspend, link lama tetap dihidupkan dari daftar nama file (recoverFromListing).
// Aman dipanggil siapa saja — idempotent, tidak menimpa data baru, dan dibatasi cooldown saat Blob masih terblokir.
import { redis, cors, ensureMigrated, recoverFromListing } from './_db.js';
import { takeSnapshot } from './backup.js';

export default async function handler(req, res) {
  cors(res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const r = redis();
    const mig = await ensureMigrated(r);
    // Selama Blob masih disuspend, tetap pastikan semua link lama hidup sebagai placeholder
    const rec = mig.done ? { done: true } : await recoverFromListing(r);
    // Snapshot harian — pelindung kalau ada data terhapus tidak sengaja
    let snapshot = null;
    try {
      snapshot = await takeSnapshot(r);
    } catch (e) {
      snapshot = { error: e.message };
    }
    return res.status(200).json({
      snapshot,
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
