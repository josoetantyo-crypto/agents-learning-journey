// API P1 — simpan name list / progress P1 + state dashboard milik satu agent
import { redis, K, parse, validId, cors, ensureMigrated, PENDING_MSG } from './_db.js';

export default async function handler(req, res) {
  cors(res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { agentId, p1, state } = req.body || {};
    const aid = String(agentId || '');
    if (!validId(aid) || !Array.isArray(p1)) {
      return res.status(400).json({ error: 'agentId dan p1 (array) wajib' });
    }

    const r = redis();
    if (!(await r.exists(K.agent(aid)))) {
      const mig = await ensureMigrated(r);
      if (!mig.done) return res.status(503).json({ error: PENDING_MSG, pending: true });
      if (!(await r.exists(K.agent(aid)))) return res.status(404).json({ error: 'Agent tidak ditemukan' });
    }

    // Sanitasi: hanya field yang dikenal, maks 200 entri
    const cleanP1 = p1.slice(0, 200).map((x) => ({
      id: Number(x.id) || Date.now(),
      name: String(x.name || '').slice(0, 60),
      cat: ['R1', 'R2', 'R3'].includes(x.cat) ? x.cat : 'R1',
      date: String(x.date || '').slice(0, 20),
      met: !!x.met,
      metDate: x.metDate ? String(x.metDate).slice(0, 20) : null,
    }));
    // State tambahan: modul selesai + goal setting (cap 30KB)
    let cleanState = null;
    if (state && typeof state === 'object') {
      const raw = JSON.stringify(state);
      if (raw.length <= 30000) cleanState = JSON.parse(raw);
    }
    if (!cleanState) {
      // Tidak ada state baru — pertahankan state yang sudah tersimpan
      const old = parse(await r.get(K.agentData(aid)));
      cleanState = (old && old.state) || null;
    }
    const updatedAt = new Date().toISOString();

    const p = r.pipeline();
    p.set(K.agentData(aid), JSON.stringify({ p1: cleanP1, state: cleanState, updatedAt }));
    p.hset(K.p1stats, {
      [aid]: JSON.stringify({ t: cleanP1.length, m: cleanP1.filter((x) => x.met).length, u: updatedAt }),
    });
    await p.exec();
    return res.status(200).json({ ok: true, updatedAt });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
