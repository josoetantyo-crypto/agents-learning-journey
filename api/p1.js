// API P1 — simpan name list / progress P1 milik satu agent
import { put, get } from '@vercel/blob';

const PREFIX = 'agents/';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { agentId, p1, state } = req.body || {};
    if (!agentId || !Array.isArray(p1)) {
      return res.status(400).json({ error: 'agentId dan p1 (array) wajib' });
    }

    const result = await get(PREFIX + String(agentId) + '.json', { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return res.status(404).json({ error: 'Agent tidak ditemukan' });
    }
    const agent = JSON.parse(await new Response(result.stream).text());

    // Sanitasi: hanya field yang dikenal, maks 200 entri
    agent.p1 = p1.slice(0, 200).map((x) => ({
      id: Number(x.id) || Date.now(),
      name: String(x.name || '').slice(0, 60),
      cat: ['R1', 'R2', 'R3'].includes(x.cat) ? x.cat : 'R1',
      date: String(x.date || '').slice(0, 20),
      met: !!x.met,
      metDate: x.metDate ? String(x.metDate).slice(0, 20) : null,
    }));
    // State tambahan: modul selesai + goal setting (cap 30KB)
    if (state && typeof state === 'object') {
      const raw = JSON.stringify(state);
      if (raw.length <= 30000) agent.state = JSON.parse(raw);
    }
    agent.updatedAt = new Date().toISOString();

    await put(PREFIX + agent.id + '.json', JSON.stringify(agent), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    });
    return res.status(200).json({ ok: true, updatedAt: agent.updatedAt });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
