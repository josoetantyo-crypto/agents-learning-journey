// API Leaders — login leader + kelola akun leader (khusus admin), data di Upstash Redis
import crypto from 'node:crypto';
import { redis, K, parse, validId, cors, ensureMigrated } from './_db.js';
import { isAdmin, hashPassword, signToken, readLeader, leaderFromReq } from './_auth.js';

async function writeLeader(r, leader, { overwrite }) {
  const ok = await r.set(K.leader(leader.id), JSON.stringify(leader), overwrite ? undefined : { nx: true });
  if (ok) await r.sadd(K.leaders, leader.id);
  return !!ok;
}

async function listLeaders(r) {
  const ids = await r.smembers(K.leaders);
  if (!ids.length) return [];
  const leaders = (await r.mget(...ids.map(K.leader)))
    .map((s) => parse(s))
    .filter(Boolean)
    .map((l) => ({ id: l.id, name: l.name, createdAt: l.createdAt }));
  leaders.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return leaders;
}

export default async function handler(req, res) {
  cors(res, 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const r = redis();
    const action = String(req.query.action || '');

    // ── Login leader (publik) ──
    if (req.method === 'POST' && action === 'login') {
      const { id, password } = req.body || {};
      const cleanId = String(id || '').trim().toLowerCase();
      if (!cleanId || !password) return res.status(400).json({ error: 'ID dan password wajib diisi' });
      let leader = await readLeader(r, cleanId);
      if (!leader && validId(cleanId)) {
        // Mungkin akun lama yang belum selesai dipindahkan dari database lama
        const mig = await ensureMigrated(r);
        if (!mig.done) {
          return res.status(503).json({
            error:
              'Akun leader lama sedang dipindahkan ke database baru (aktif lagi otomatis paling lambat 5 Okt 2026). Kalau butuh sekarang, minta admin buatkan akun sementara.',
            pending: true,
          });
        }
        leader = await readLeader(r, cleanId);
      }
      if (!leader) return res.status(401).json({ error: 'ID atau password salah' });
      const hash = hashPassword(password, leader.salt);
      const a = Buffer.from(hash);
      const b = Buffer.from(leader.passHash);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ error: 'ID atau password salah' });
      }
      return res.status(200).json({ token: signToken(leader.id), leader: { id: leader.id, name: leader.name } });
    }

    // ── Profil sendiri dari token (untuk auto-login) ──
    if (req.method === 'GET' && action === 'me') {
      const leader = await leaderFromReq(r, req);
      if (!leader) return res.status(401).json({ error: 'Sesi tidak valid, login ulang' });
      return res.status(200).json({ leader: { id: leader.id, name: leader.name } });
    }

    // ── Semua di bawah ini khusus admin ──
    if (!isAdmin(req)) return res.status(401).json({ error: 'Password admin salah' });

    // Status / jalankan migrasi dari database lama
    if (action === 'migrate') {
      const mig = await ensureMigrated(r, { force: req.method === 'POST' });
      return res.status(200).json({ migration: mig, info: parse(await r.get(K.migrated)) });
    }

    // Pindahkan semua agent tanpa leader ke satu leader
    if (req.method === 'POST' && action === 'assign-orphans') {
      const { leaderId } = req.body || {};
      const target = await readLeader(r, String(leaderId || '').trim().toLowerCase());
      if (!target) return res.status(404).json({ error: 'Leader tujuan tidak ditemukan' });

      const ids = await r.smembers(K.agents);
      const metas = ids.length ? await r.mget(...ids.map(K.agent)) : [];
      const p = r.pipeline();
      let moved = 0;
      for (const s of metas) {
        const agent = parse(s);
        if (!agent || agent.leaderId) continue;
        agent.leaderId = target.id;
        p.set(K.agent(agent.id), JSON.stringify(agent));
        moved++;
      }
      if (moved) await p.exec();
      return res.status(200).json({ ok: true, moved });
    }

    // Reset password leader
    if (req.method === 'POST' && action === 'reset-password') {
      const { id, password } = req.body || {};
      const pass = String(password || '');
      if (pass.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
      const leader = await readLeader(r, String(id || '').trim().toLowerCase());
      if (!leader) return res.status(404).json({ error: 'Leader tidak ditemukan' });
      leader.salt = crypto.randomBytes(16).toString('hex');
      leader.passHash = hashPassword(pass, leader.salt);
      leader.updatedAt = new Date().toISOString();
      await writeLeader(r, leader, { overwrite: true });
      return res.status(200).json({ ok: true });
    }

    // Buat leader baru
    if (req.method === 'POST') {
      const { id, name, password } = req.body || {};
      const cleanId = String(id || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30);
      const cleanName = String(name || '').trim().slice(0, 60);
      const pass = String(password || '');
      if (cleanId.length < 3) return res.status(400).json({ error: 'ID leader minimal 3 karakter (huruf/angka, tanpa spasi)' });
      if (!cleanName) return res.status(400).json({ error: 'Nama leader wajib diisi' });
      if (pass.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });

      const salt = crypto.randomBytes(16).toString('hex');
      const leader = {
        id: cleanId,
        name: cleanName,
        salt,
        passHash: hashPassword(pass, salt),
        createdAt: new Date().toISOString(),
      };
      if (!(await writeLeader(r, leader, { overwrite: false }))) {
        return res.status(409).json({ error: 'ID leader sudah dipakai' });
      }
      return res.status(200).json({ leader: { id: leader.id, name: leader.name, createdAt: leader.createdAt } });
    }

    // List semua leader
    if (req.method === 'GET') {
      const mig = await ensureMigrated(r);
      return res.status(200).json({ leaders: await listLeaders(r), migrated: mig.done });
    }

    // Hapus leader — agent miliknya TIDAK dihapus, jadi tanpa-leader (terlihat admin)
    if (req.method === 'DELETE') {
      const lid = String(req.query.id || '').toLowerCase();
      if (!validId(lid)) return res.status(400).json({ error: 'id wajib' });
      const p = r.pipeline();
      p.del(K.leader(lid));
      p.srem(K.leaders, lid);
      await p.exec();
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
