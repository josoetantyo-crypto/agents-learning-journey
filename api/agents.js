// API Agents — buat, baca, list, hapus agent (data di Vercel Blob, private)
// Buat/list/hapus butuh login leader (token) atau admin; tiap agent tercatat leaderId pembuatnya
import { put, get, del, list } from '@vercel/blob';
import crypto from 'node:crypto';
import { isAdmin, leaderFromReq } from './_auth.js';

const PREFIX = 'agents/';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Leader-Token');
  res.setHeader('Cache-Control', 'no-store');
}

async function readAgent(id) {
  const result = await get(PREFIX + id + '.json', { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

async function writeAgent(agent, { overwrite }) {
  await put(PREFIX + agent.id + '.json', JSON.stringify(agent), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: overwrite,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'POST') {
      // Buat agent baru — wajib login leader (atau admin)
      const admin = isAdmin(req);
      const leader = admin ? null : await leaderFromReq(req);
      if (!admin && !leader) return res.status(401).json({ error: 'Login leader dulu untuk membuat link agent' });

      const { name, wa } = req.body || {};
      const cleanName = String(name || '').trim().slice(0, 60);
      let cleanWa = String(wa || '').replace(/[^0-9]/g, '');
      if (cleanWa.startsWith('0')) cleanWa = '62' + cleanWa.slice(1);
      if (!cleanName) return res.status(400).json({ error: 'Nama agent wajib diisi' });
      if (cleanWa.length < 9) return res.status(400).json({ error: 'No WA tidak valid' });

      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      const agent = {
        id,
        name: cleanName,
        wa: cleanWa,
        leaderId: leader ? leader.id : null,
        activatedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        p1: [],
      };
      await writeAgent(agent, { overwrite: false });
      return res.status(200).json({ agent });
    }

    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const agent = await readAgent(String(id));
        if (!agent) return res.status(404).json({ error: 'Agent tidak ditemukan' });
        // Tandai aktivasi saat agent membuka link dashboard-nya — pakai blob marker
        // terpisah agar JSON agent tidak pernah ditulis dari GET (hindari race dengan p1.js)
        if (!agent.activatedAt) {
          const markerPath = PREFIX + agent.id + '.activated';
          const page = await list({ prefix: markerPath, limit: 1 });
          const marker = page.blobs.find((b) => b.pathname === markerPath);
          if (marker) {
            agent.activatedAt = new Date(marker.uploadedAt).toISOString();
          } else {
            agent.activatedAt = new Date().toISOString();
            await put(markerPath, agent.activatedAt, {
              access: 'private',
              addRandomSuffix: false,
              allowOverwrite: true,
              contentType: 'text/plain',
              cacheControlMaxAge: 0,
            });
          }
        }
        return res.status(200).json({ agent });
      }
      // List agent + ringkasan progress P1 — admin lihat semua, leader hanya miliknya
      const admin = isAdmin(req);
      const leader = admin ? null : await leaderFromReq(req);
      if (!admin && !leader) return res.status(401).json({ error: 'Login dulu untuk melihat daftar agent' });
      const blobs = [];
      let cursor;
      do {
        const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
        blobs.push(...page.blobs);
        cursor = page.cursor;
      } while (cursor);

      // Marker aktivasi: agents/<id>.activated — tanggal aktivasi = uploadedAt marker
      const activatedMap = {};
      for (const b of blobs) {
        if (b.pathname.endsWith('.activated')) {
          const aid = b.pathname.slice(PREFIX.length, -'.activated'.length);
          activatedMap[aid] = new Date(b.uploadedAt).toISOString();
        }
      }

      const agents = (
        await Promise.all(
          blobs
            .filter((b) => b.pathname.endsWith('.json'))
            .map(async (b) => {
              const aid = b.pathname.slice(PREFIX.length, -'.json'.length);
              try {
                const a = await readAgent(aid);
                if (!a) return null;
                if (leader && a.leaderId !== leader.id) return null; // leader hanya lihat agent miliknya
                const p1 = Array.isArray(a.p1) ? a.p1 : [];
                return {
                  id: a.id,
                  name: a.name,
                  wa: a.wa,
                  leaderId: a.leaderId || null,
                  activatedAt: a.activatedAt || activatedMap[aid] || null,
                  createdAt: a.createdAt,
                  updatedAt: a.updatedAt,
                  p1Total: p1.length,
                  p1Met: p1.filter((x) => x.met).length,
                };
              } catch {
                return null;
              }
            })
        )
      ).filter(Boolean);
      agents.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return res.status(200).json({ agents });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id wajib' });
      const admin = isAdmin(req);
      if (!admin) {
        // Leader hanya boleh menghapus agent miliknya sendiri
        const leader = await leaderFromReq(req);
        if (!leader) return res.status(401).json({ error: 'Login dulu untuk menghapus agent' });
        const agent = await readAgent(String(id)).catch(() => null);
        if (!agent) return res.status(404).json({ error: 'Agent tidak ditemukan' });
        if (agent.leaderId !== leader.id) return res.status(403).json({ error: 'Agent ini bukan milikmu' });
      }
      await del(PREFIX + String(id) + '.json');
      await del(PREFIX + String(id) + '.activated').catch(() => {});
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
