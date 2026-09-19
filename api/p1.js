// API P1 — simpan name list / progress P1 + state dashboard milik satu agent
import { redis, K, parse, validId, cors, ensureRestored, PENDING_MSG } from './_db.js';

export default async function handler(req, res) {
  cors(res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { agentId, p1, state, name } = req.body || {};
    const aid = String(agentId || '');
    if (!validId(aid) || !Array.isArray(p1)) {
      return res.status(400).json({ error: 'agentId dan p1 (array) wajib' });
    }

    const r = redis();
    let meta = parse(await r.get(K.agent(aid)));
    if (!meta) {
      // Agent lama yang belum ada di database baru — pulihkan dulu sebelum menyerah
      const st = await ensureRestored(r);
      meta = parse(await r.get(K.agent(aid)));
      if (!meta) {
        if (!st.done && !st.recovered) return res.status(503).json({ error: PENDING_MSG, pending: true });
        return res.status(404).json({ error: 'Agent tidak ditemukan' });
      }
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
    // Link hasil pemulihan belum punya nama (isi Blob lama masih terkunci) — isi dari nama yang
    // diketik agent di HP-nya, sekali saja, tanpa pernah menimpa nama yang dibuat leader
    const cleanName = String(name || '').trim().slice(0, 60);
    if (meta.recovered && !meta.name && cleanName) {
      p.set(K.agent(aid), JSON.stringify({ ...meta, name: cleanName }));
    }
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
