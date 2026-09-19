// API Agents — buat, baca, list, hapus agent (data di Upstash Redis)
// Buat/list/hapus butuh login leader (token) atau admin; tiap agent tercatat leaderId pembuatnya
import crypto from 'node:crypto';
import { redis, K, parse, hashObj, validId, cors, ensureRestored, PENDING_MSG } from './_db.js';
import { isAdmin, leaderFromReq } from './_auth.js';

async function listAgents(r) {
  const ids = await r.smembers(K.agents);
  if (!ids.length) return [];
  const p = r.pipeline();
  p.mget(...ids.map(K.agent));
  p.hgetall(K.activated);
  p.hgetall(K.p1stats);
  const [metas, activatedRaw, statsRaw] = await p.exec();
  const activated = hashObj(activatedRaw);
  const stats = hashObj(statsRaw);
  return metas
    .map((s) => parse(s))
    .filter(Boolean)
    .map((a) => {
      const st = parse(stats[a.id]) || {};
      return {
        id: a.id,
        name: a.name,
        wa: a.wa,
        leaderId: a.leaderId || null,
        recovered: !!a.recovered,
        activatedAt: activated[a.id] || null,
        createdAt: a.createdAt,
        updatedAt: st.u || a.createdAt,
        p1Total: st.t || 0,
        p1Met: st.m || 0,
      };
    });
}

export default async function handler(req, res) {
  cors(res, 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const r = redis();

    if (req.method === 'POST') {
      // Buat agent baru — wajib login leader (atau admin)
      const admin = isAdmin(req);
      const leader = admin ? null : await leaderFromReq(r, req);
      if (!admin && !leader) return res.status(401).json({ error: 'Login leader dulu untuk membuat link agent' });

      const { name, wa } = req.body || {};
      const cleanName = String(name || '').trim().slice(0, 60);
      let cleanWa = String(wa || '').replace(/[^0-9]/g, '');
      if (cleanWa.startsWith('0')) cleanWa = '62' + cleanWa.slice(1);
      if (!cleanName) return res.status(400).json({ error: 'Nama agent wajib diisi' });
      if (cleanWa.length < 9) return res.status(400).json({ error: 'No WA tidak valid' });

      // Isi nama & no WA link lama yang identitasnya masih terkunci di database lama.
      // Flag `recovered` sengaja dipertahankan supaya data asli tetap menimpa ini saat database lama pulih.
      if (String(req.query.action || '') === 'label') {
        const aid = String(req.body.id || '');
        if (!validId(aid)) return res.status(400).json({ error: 'id agent wajib' });
        const agent = parse(await r.get(K.agent(aid)));
        if (!agent) return res.status(404).json({ error: 'Agent tidak ditemukan' });
        if (!admin && agent.leaderId !== leader.id) return res.status(403).json({ error: 'Agent ini bukan milikmu' });
        await r.set(K.agent(aid), JSON.stringify({ ...agent, name: cleanName, wa: cleanWa }));
        return res.status(200).json({ ok: true });
      }

      const now = new Date().toISOString();
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      const agent = { id, name: cleanName, wa: cleanWa, leaderId: leader ? leader.id : null, createdAt: now };
      if (!(await r.set(K.agent(id), JSON.stringify(agent), { nx: true }))) {
        return res.status(409).json({ error: 'Coba generate lagi' });
      }
      const p = r.pipeline();
      p.set(K.agentData(id), JSON.stringify({ p1: [], state: null, updatedAt: now }));
      p.sadd(K.agents, id);
      p.hset(K.p1stats, { [id]: JSON.stringify({ t: 0, m: 0, u: now }) });
      await p.exec();
      return res.status(200).json({ agent: { ...agent, activatedAt: null, updatedAt: now, p1: [] } });
    }

    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const aid = String(id);
        if (!validId(aid)) return res.status(404).json({ error: 'Agent tidak ditemukan' });
        let [metaS, dataS] = await r.mget(K.agent(aid), K.agentData(aid));
        if (!metaS) {
          // Belum ada di database baru — agent lama yang datanya belum selesai dipindahkan.
          // ensureRestored() memulihkan link lama walau isi Blob masih terkunci.
          const st = await ensureRestored(r);
          [metaS, dataS] = await r.mget(K.agent(aid), K.agentData(aid));
          if (!metaS) {
            if (!st.done && !st.recovered) return res.status(503).json({ error: PENDING_MSG, pending: true });
            return res.status(404).json({ error: 'Agent tidak ditemukan' });
          }
        }
        const meta = parse(metaS);
        const data = parse(dataS) || {};
        // Tandai aktivasi saat agent pertama kali membuka link dashboard-nya
        const p = r.pipeline();
        p.hsetnx(K.activated, aid, new Date().toISOString());
        p.hget(K.activated, aid);
        const [, activatedAt] = await p.exec();
        return res.status(200).json({
          agent: {
            ...meta,
            activatedAt,
            updatedAt: data.updatedAt || meta.createdAt,
            p1: Array.isArray(data.p1) ? data.p1 : [],
            state: data.state || null,
          },
        });
      }

      // List agent + ringkasan progress P1 — admin lihat semua, leader hanya miliknya
      const admin = isAdmin(req);
      const leader = admin ? null : await leaderFromReq(r, req);
      if (!admin && !leader) return res.status(401).json({ error: 'Login dulu untuk melihat daftar agent' });
      const mig = await ensureRestored(r);
      let agents = await listAgents(r);
      if (leader) agents = agents.filter((a) => a.leaderId === leader.id);
      agents.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return res.status(200).json({ agents, migrated: mig.done });
    }

    if (req.method === 'DELETE') {
      const aid = String(req.query.id || '');
      if (!validId(aid)) return res.status(400).json({ error: 'id wajib' });
      const admin = isAdmin(req);
      const agent = parse(await r.get(K.agent(aid)));
      if (!admin) {
        // Leader hanya boleh menghapus agent miliknya sendiri
        const leader = await leaderFromReq(r, req);
        if (!leader) return res.status(401).json({ error: 'Login dulu untuk menghapus agent' });
        if (!agent) return res.status(404).json({ error: 'Agent tidak ditemukan' });
        if (agent.leaderId !== leader.id) return res.status(403).json({ error: 'Agent ini bukan milikmu' });
      }
      const p = r.pipeline();
      p.del(K.agent(aid), K.agentData(aid));
      p.srem(K.agents, aid);
      p.hdel(K.activated, aid);
      p.hdel(K.p1stats, aid);
      await p.exec();
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
