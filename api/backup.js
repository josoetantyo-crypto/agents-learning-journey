// API Backup — ekspor & pulihkan seluruh database (khusus admin).
// Tujuannya satu: apa pun yang terjadi pada database, data tidak pernah hilang untuk selamanya.
//  - GET                     → unduh seluruh isi database sebagai satu file JSON
//  - GET  ?action=list       → daftar snapshot otomatis yang tersimpan (harian, disimpan 8 hari)
//  - POST ?action=snapshot   → ambil snapshot sekarang (dipanggil juga oleh cron harian)
//  - POST ?action=restore    → pulihkan dari file JSON (body) atau dari snapshot (body: {snapshot:"YYYY-MM-DD"})
//                              mode "merge" (default) tidak pernah menimpa/menghapus data yang ada;
//                              mode "overwrite" menimpa data yang namanya sama.
import { redis, K, parse, hashObj, validId, cors } from './_db.js';
import { isAdmin } from './_auth.js';

const SNAP = (day) => 'ig:snap:' + day;
const SNAP_DAYS = 8;
const today = () => new Date().toISOString().slice(0, 10);

// Kumpulkan seluruh isi database jadi satu objek
export async function dump(r) {
  const [leaderIds, agentIds] = await Promise.all([r.smembers(K.leaders), r.smembers(K.agents)]);

  const leaders = leaderIds.length
    ? (await r.mget(...leaderIds.map(K.leader))).map(parse).filter(Boolean)
    : [];

  let agents = [];
  if (agentIds.length) {
    const p = r.pipeline();
    p.mget(...agentIds.map(K.agent));
    p.mget(...agentIds.map(K.agentData));
    p.hgetall(K.activated);
    p.hgetall(K.p1stats);
    const [metas, datas, activatedRaw, statsRaw] = await p.exec();
    const activated = hashObj(activatedRaw);
    const stats = hashObj(statsRaw);
    agents = agentIds
      .map((id, i) => {
        const meta = parse(metas[i]);
        if (!meta) return null;
        return {
          meta,
          data: parse(datas[i]) || { p1: [], state: null, updatedAt: null },
          activatedAt: activated[id] || null,
          stats: parse(stats[id]) || null,
        };
      })
      .filter(Boolean);
  }

  return { v: 1, at: new Date().toISOString(), leaders, agents };
}

// Tulis kembali isi backup. merge (default) tidak pernah menghapus atau menimpa apa pun yang sudah ada.
export async function restore(r, data, { overwrite = false } = {}) {
  if (!data || !Array.isArray(data.leaders) || !Array.isArray(data.agents)) {
    throw new Error('File backup tidak dikenali');
  }
  const opt = overwrite ? undefined : { nx: true };
  let leaders = 0;
  let agents = 0;

  for (const l of data.leaders) {
    if (!l || !validId(l.id)) continue;
    const p = r.pipeline();
    p.set(K.leader(l.id), JSON.stringify(l), opt);
    p.sadd(K.leaders, l.id);
    await p.exec();
    leaders++;
  }

  for (const a of data.agents) {
    const meta = a && a.meta;
    if (!meta || !validId(meta.id)) continue;
    const id = meta.id;
    const p = r.pipeline();
    p.set(K.agent(id), JSON.stringify(meta), opt);
    p.set(K.agentData(id), JSON.stringify(a.data || { p1: [], state: null, updatedAt: null }), opt);
    p.sadd(K.agents, id);
    if (a.activatedAt) {
      if (overwrite) p.hset(K.activated, { [id]: a.activatedAt });
      else p.hsetnx(K.activated, id, a.activatedAt);
    }
    if (a.stats) {
      const s = JSON.stringify(a.stats);
      if (overwrite) p.hset(K.p1stats, { [id]: s });
      else p.hsetnx(K.p1stats, id, s);
    }
    await p.exec();
    agents++;
  }

  return { leaders, agents };
}

// Snapshot harian, disimpan di dalam database itu sendiri dan kedaluwarsa sendiri setelah 8 hari.
// Melindungi dari penghapusan tidak sengaja; untuk perlindungan penuh, unduh file backup secara berkala.
export async function takeSnapshot(r) {
  const day = today();
  const key = SNAP(day);
  const data = await dump(r);
  if (!data.leaders.length && !data.agents.length) return { skipped: 'database kosong' };
  await r.set(key, JSON.stringify(data), { ex: SNAP_DAYS * 24 * 60 * 60 });
  return { day, leaders: data.leaders.length, agents: data.agents.length };
}

async function listSnapshots(r) {
  const days = [];
  for (let i = 0; i < SNAP_DAYS; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push(d);
  }
  const vals = await r.mget(...days.map(SNAP));
  return days
    .map((day, i) => {
      const d = parse(vals[i]);
      return d ? { day, at: d.at, leaders: d.leaders.length, agents: d.agents.length } : null;
    })
    .filter(Boolean);
}

export default async function handler(req, res) {
  cors(res, 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!isAdmin(req)) return res.status(401).json({ error: 'Khusus admin' });

  try {
    const r = redis();
    const action = String(req.query.action || '');

    if (req.method === 'GET' && action === 'list') {
      return res.status(200).json({ snapshots: await listSnapshots(r) });
    }

    if (req.method === 'GET') {
      const data = await dump(r);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="learning-journey-backup-' + today() + '.json"'
      );
      return res.status(200).end(JSON.stringify(data));
    }

    if (req.method === 'POST' && action === 'snapshot') {
      return res.status(200).json({ ok: true, snapshot: await takeSnapshot(r) });
    }

    if (req.method === 'POST' && action === 'restore') {
      const body = req.body || {};
      let data = body;
      if (body.snapshot) {
        data = parse(await r.get(SNAP(String(body.snapshot))));
        if (!data) return res.status(404).json({ error: 'Snapshot tidak ditemukan' });
      }
      // File backup dikirim apa adanya sebagai body, jadi mode juga boleh lewat query
      const overwrite = body.mode === 'overwrite' || String(req.query.mode || '') === 'overwrite';
      const result = await restore(r, data, { overwrite });
      return res.status(200).json({ ok: true, ...result });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
