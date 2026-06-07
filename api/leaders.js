// API Leaders — login leader + kelola akun leader (khusus admin), data di Vercel Blob privat
import { put, get, del, list } from '@vercel/blob';
import crypto from 'node:crypto';
import { LEADER_PREFIX, isAdmin, hashPassword, signToken, readLeader, leaderFromReq } from './_auth.js';

const AGENT_PREFIX = 'agents/';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Leader-Token');
  res.setHeader('Cache-Control', 'no-store');
}

async function writeLeader(leader, { overwrite }) {
  await put(LEADER_PREFIX + leader.id + '.json', JSON.stringify(leader), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: overwrite,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  });
}

async function listLeaders() {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: LEADER_PREFIX, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);
  const leaders = (
    await Promise.all(
      blobs
        .filter((b) => b.pathname.endsWith('.json'))
        .map(async (b) => {
          const lid = b.pathname.slice(LEADER_PREFIX.length, -'.json'.length);
          try {
            const l = await readLeader(lid);
            return l ? { id: l.id, name: l.name, createdAt: l.createdAt } : null;
          } catch {
            return null;
          }
        })
    )
  ).filter(Boolean);
  leaders.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return leaders;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const action = String(req.query.action || '');

    // ── Login leader (publik) ──
    if (req.method === 'POST' && action === 'login') {
      const { id, password } = req.body || {};
      const cleanId = String(id || '').trim().toLowerCase();
      if (!cleanId || !password) return res.status(400).json({ error: 'ID dan password wajib diisi' });
      const leader = await readLeader(cleanId).catch(() => null);
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
      const leader = await leaderFromReq(req);
      if (!leader) return res.status(401).json({ error: 'Sesi tidak valid, login ulang' });
      return res.status(200).json({ leader: { id: leader.id, name: leader.name } });
    }

    // ── Semua di bawah ini khusus admin ──
    if (!isAdmin(req)) return res.status(401).json({ error: 'Password admin salah' });

    // Pindahkan semua agent tanpa leader ke satu leader
    if (req.method === 'POST' && action === 'assign-orphans') {
      const { leaderId } = req.body || {};
      const cleanId = String(leaderId || '').trim().toLowerCase();
      const target = await readLeader(cleanId).catch(() => null);
      if (!target) return res.status(404).json({ error: 'Leader tujuan tidak ditemukan' });

      const blobs = [];
      let cursor;
      do {
        const page = await list({ prefix: AGENT_PREFIX, cursor, limit: 1000 });
        blobs.push(...page.blobs);
        cursor = page.cursor;
      } while (cursor);

      let moved = 0;
      for (const b of blobs) {
        if (!b.pathname.endsWith('.json')) continue;
        try {
          const result = await get(b.pathname, { access: 'private' });
          if (!result || result.statusCode !== 200 || !result.stream) continue;
          const agent = JSON.parse(await new Response(result.stream).text());
          if (agent.leaderId) continue;
          agent.leaderId = target.id;
          agent.updatedAt = new Date().toISOString();
          await put(b.pathname, JSON.stringify(agent), {
            access: 'private',
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: 'application/json',
            cacheControlMaxAge: 60,
          });
          moved++;
        } catch {
          /* lanjut agent berikutnya */
        }
      }
      return res.status(200).json({ ok: true, moved });
    }

    // Reset password leader
    if (req.method === 'POST' && action === 'reset-password') {
      const { id, password } = req.body || {};
      const cleanId = String(id || '').trim().toLowerCase();
      const pass = String(password || '');
      if (pass.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
      const leader = await readLeader(cleanId).catch(() => null);
      if (!leader) return res.status(404).json({ error: 'Leader tidak ditemukan' });
      leader.salt = crypto.randomBytes(16).toString('hex');
      leader.passHash = hashPassword(pass, leader.salt);
      leader.updatedAt = new Date().toISOString();
      await writeLeader(leader, { overwrite: true });
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
      const existing = await readLeader(cleanId).catch(() => null);
      if (existing) return res.status(409).json({ error: 'ID leader sudah dipakai' });

      const salt = crypto.randomBytes(16).toString('hex');
      const leader = {
        id: cleanId,
        name: cleanName,
        salt,
        passHash: hashPassword(pass, salt),
        createdAt: new Date().toISOString(),
      };
      await writeLeader(leader, { overwrite: false });
      return res.status(200).json({ leader: { id: leader.id, name: leader.name, createdAt: leader.createdAt } });
    }

    // List semua leader
    if (req.method === 'GET') {
      const leaders = await listLeaders();
      return res.status(200).json({ leaders });
    }

    // Hapus leader — agent miliknya TIDAK dihapus, jadi tanpa-leader (terlihat admin)
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id wajib' });
      await del(LEADER_PREFIX + String(id).toLowerCase() + '.json');
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
