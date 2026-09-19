// API Leaders — login leader + kelola akun leader (khusus admin), data di Upstash Redis
import crypto from 'node:crypto';
import { redis, K, parse, validId, cors, ensureMigrated, ensureRestored, recoverFromListing } from './_db.js';
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
    .map((l) => ({ id: l.id, name: l.name, createdAt: l.createdAt, needsReset: !l.salt || !l.passHash }));
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
        const st = await ensureRestored(r);
        leader = await readLeader(r, cleanId);
        if (!leader && !st.done && !st.recovered) {
          return res.status(503).json({
            error:
              'Akun leader sedang dipulihkan dari database lama. ID & password kamu tidak diubah — coba lagi beberapa menit lagi, atau minta admin kirimkan Link Masuk.',
            pending: true,
          });
        }
      }
      if (!leader) return res.status(401).json({ error: 'ID atau password salah' });
      if (!leader.salt || !leader.passHash) {
        // Akun hasil pemulihan: ID-nya kembali, tapi password lama masih terkunci di database lama
        return res.status(409).json({
          error:
            'Akun kamu sedang dipulihkan — database lama terkunci sampai sekitar 4 Okt. ID kamu tidak berubah. Minta Jeremy klik "Pulihkan Akun" di panel admin, lalu login seperti biasa.',
          needsReset: true,
        });
      }
      const hash = hashPassword(password, leader.salt);
      const a = Buffer.from(hash);
      const b = Buffer.from(leader.passHash);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ error: 'ID atau password salah' });
      }
      return res.status(200).json({ token: signToken(leader.id), leader: { id: leader.id, name: leader.name } });
    }

    // ── Leader ganti passwordnya sendiri (butuh sesi login + password lama) ──
    if (req.method === 'POST' && action === 'change-password') {
      const me = await leaderFromReq(r, req);
      if (!me) return res.status(401).json({ error: 'Sesi tidak valid, login ulang' });
      const leader = await readLeader(r, me.id);
      if (!leader || !leader.salt || !leader.passHash) {
        return res.status(409).json({ error: 'Akun belum aktif — minta admin mengaktifkannya dulu' });
      }
      const { current, next } = req.body || {};
      const baru = String(next || '');
      if (baru.length < 6) return res.status(400).json({ error: 'Password baru minimal 6 karakter' });

      const now = Buffer.from(hashPassword(String(current || ''), leader.salt));
      const want = Buffer.from(leader.passHash);
      if (now.length !== want.length || !crypto.timingSafeEqual(now, want)) {
        return res.status(401).json({ error: 'Password lama salah' });
      }

      leader.salt = crypto.randomBytes(16).toString('hex');
      leader.passHash = hashPassword(baru, leader.salt);
      leader.updatedAt = new Date().toISOString();
      // Password pilihan leader sendiri — jangan ditimpa lagi saat database lama pulih
      if (leader.recovered) leader.pwKeep = true;
      await writeLeader(r, leader, { overwrite: true });
      return res.status(200).json({ ok: true, token: signToken(leader.id) });
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
      const force = req.method === 'POST';
      const mig = await ensureMigrated(r, { force });
      // Blob masih disuspend — minimal hidupkan lagi semua link lama dari daftar nama file
      const rec = mig.done ? { done: true, already: true } : await recoverFromListing(r, { force });
      return res.status(200).json({
        migration: mig,
        recovery: rec,
        info: parse(await r.get(K.migrated)),
        recoveryInfo: parse(await r.get(K.recovered)),
      });
    }

    // Link masuk sekali-klik untuk satu leader (khusus admin — lihat gerbang isAdmin di atas).
    // Dipakai selama password lama masih terkunci di database lama yang diblokir Vercel.
    // Password leader TIDAK disentuh: begitu database lama terbaca lagi, ID + password lama
    // mereka berlaku persis seperti semula.
    if (req.method === 'POST' && action === 'login-link') {
      const lid = String((req.body || {}).id || '').trim().toLowerCase();
      const leader = await readLeader(r, lid);
      if (!leader) return res.status(404).json({ error: 'Leader tidak ditemukan' });
      return res.status(200).json({ token: signToken(leader.id), leader: { id: leader.id, name: leader.name } });
    }

    // Pindahkan satu agent ke leader tertentu (dipakai saat merapikan agent hasil pemulihan)
    if (req.method === 'POST' && action === 'assign') {
      const { agentId, leaderId } = req.body || {};
      const aid = String(agentId || '');
      if (!validId(aid)) return res.status(400).json({ error: 'agentId wajib' });
      const agent = parse(await r.get(K.agent(aid)));
      if (!agent) return res.status(404).json({ error: 'Agent tidak ditemukan' });
      const lid = String(leaderId || '').trim().toLowerCase();
      if (lid) {
        const target = await readLeader(r, lid);
        if (!target) return res.status(404).json({ error: 'Leader tujuan tidak ditemukan' });
      }
      agent.leaderId = lid || null;
      await r.set(K.agent(aid), JSON.stringify(agent));
      return res.status(200).json({ ok: true, leaderId: agent.leaderId });
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

    // Set password leader. Selama database lama diblokir ini dipakai untuk MEMULIHKAN akun:
    // admin mengetik ulang password yang dulu ia berikan, jadi dari sisi leader tidak ada yang berubah.
    if (req.method === 'POST' && action === 'reset-password') {
      const { id, password, name } = req.body || {};
      const pass = String(password || '');
      if (pass.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
      const leader = await readLeader(r, String(id || '').trim().toLowerCase());
      if (!leader) return res.status(404).json({ error: 'Leader tidak ditemukan' });
      leader.salt = crypto.randomBytes(16).toString('hex');
      leader.passHash = hashPassword(pass, leader.salt);
      leader.updatedAt = new Date().toISOString();
      const cleanName = String(name || '').trim().slice(0, 60);
      if (cleanName) leader.name = cleanName;
      // Password ini yang berlaku seterusnya — saat database lama pulih, nama & tanggal asli tetap
      // dikembalikan tapi passwordnya tidak ditimpa lagi (lihat pwKeep di ensureMigrated).
      if (leader.recovered) leader.pwKeep = true;
      await writeLeader(r, leader, { overwrite: true });
      return res.status(200).json({ ok: true, leader: { id: leader.id, name: leader.name } });
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
      const mig = await ensureRestored(r);
      return res.status(200).json({ leaders: await listLeaders(r), migrated: !!mig.done });
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
