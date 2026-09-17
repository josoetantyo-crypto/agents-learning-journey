// Database utama: Upstash Redis (free tier, via Vercel Marketplace).
// Data lama di Vercel Blob (agents-journey-db) dipindahkan otomatis sekali jalan — lihat ensureMigrated().
// File berawalan _ tidak di-deploy sebagai endpoint.
import { Redis } from '@upstash/redis';
import { get, list } from '@vercel/blob';

let _redis = null;
export function redis() {
  if (!_redis) {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error('Database belum terhubung');
    // automaticDeserialization off: ID agent yang kebetulan angka semua tidak boleh berubah jadi number
    _redis = new Redis({ url, token, automaticDeserialization: false });
  }
  return _redis;
}

export const K = {
  leader: (id) => 'ig:leader:' + id,
  leaders: 'ig:leaders', // set ID leader
  agent: (id) => 'ig:agent:' + id, // JSON {id,name,wa,leaderId,createdAt}
  agentData: (id) => 'ig:agentdata:' + id, // JSON {p1,state,updatedAt}
  agents: 'ig:agents', // set ID agent
  activated: 'ig:activated', // hash id -> ISO tanggal pertama buka link
  p1stats: 'ig:p1stats', // hash id -> JSON {t,m,u}
  migrated: 'ig:migrated',
  migrating: 'ig:migrating',
  blobRetryAfter: 'ig:blob-retry-after',
};

export const parse = (s) => {
  if (s === null || s === undefined) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

// HGETALL mentah (automaticDeserialization off) berupa array datar [field, value, ...]
export const hashObj = (x) => {
  if (!Array.isArray(x)) return x || {};
  const o = {};
  for (let i = 0; i < x.length; i += 2) o[x[i]] = x[i + 1];
  return o;
};

export const validId = (id) => /^[a-z0-9._-]{1,40}$/.test(String(id || ''));

export function cors(res, methods) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Leader-Token');
  res.setHeader('Cache-Control', 'no-store');
}

export const PENDING_MSG =
  'Database sedang dipindahkan ke server baru. Data lama akan kembali otomatis paling lambat 5 Okt 2026 — progress tetap tersimpan di HP.';

// ── Migrasi sekali jalan dari Vercel Blob ──
let migratedMemo = false;

export async function isMigrated(r) {
  if (migratedMemo) return true;
  migratedMemo = !!(await r.get(K.migrated));
  return migratedMemo;
}

async function readBlobJson(pathname) {
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return JSON.parse(await new Response(result.stream).text());
}

async function listAll(prefix) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);
  return blobs;
}

async function mapLimit(items, limit, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    })
  );
}

// Kembalikan { done, blocked?, error? }. Aman dipanggil berkali-kali: tidak pernah menimpa data yang sudah ada di Redis
// dan tidak pernah menghapus Blob (tetap jadi backup).
export async function ensureMigrated(r, { force = false } = {}) {
  if (await isMigrated(r)) return { done: true };
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { done: false, error: 'Blob tidak terhubung' };
  if (!force && (await r.get(K.blobRetryAfter))) return { done: false, blocked: true };

  // Probe: store Blob yang diblokir melempar 403 (dan list() diam-diam kosong), jadi cek dulu sebelum percaya hasil list
  try {
    await readBlobJson('leaders/__probe__.json');
  } catch (e) {
    await r.set(K.blobRetryAfter, '1', { ex: 1800 });
    return { done: false, blocked: true, error: e.message };
  }

  if (!(await r.set(K.migrating, '1', { nx: true, ex: 240 }))) return { done: false, busy: true };
  try {
    const leaderBlobs = (await listAll('leaders/')).filter((b) => b.pathname.endsWith('.json'));
    const agentBlobs = await listAll('agents/');
    if (!leaderBlobs.length && !agentBlobs.length) {
      // Store berisi 111 file saat diblokir — kosong berarti belum benar-benar terbaca, jangan tandai selesai
      await r.set(K.blobRetryAfter, '1', { ex: 1800 });
      return { done: false, blocked: true, error: 'Blob kosong' };
    }

    let leaders = 0;
    await mapLimit(leaderBlobs, 8, async (b) => {
      const l = await readBlobJson(b.pathname);
      if (!l || !l.id || !validId(l.id)) return;
      const p = r.pipeline();
      p.set(K.leader(l.id), JSON.stringify(l), { nx: true });
      p.sadd(K.leaders, l.id);
      await p.exec();
      leaders++;
    });

    const markers = {};
    for (const b of agentBlobs) {
      if (b.pathname.endsWith('.activated')) {
        markers[b.pathname.slice('agents/'.length, -'.activated'.length)] = new Date(b.uploadedAt).toISOString();
      }
    }
    let agents = 0;
    await mapLimit(
      agentBlobs.filter((b) => b.pathname.endsWith('.json')),
      8,
      async (b) => {
        const a = await readBlobJson(b.pathname);
        if (!a || !a.id || !validId(a.id)) return;
        const p1 = Array.isArray(a.p1) ? a.p1 : [];
        const p = r.pipeline();
        p.set(
          K.agent(a.id),
          JSON.stringify({ id: a.id, name: a.name, wa: a.wa, leaderId: a.leaderId || null, createdAt: a.createdAt }),
          { nx: true }
        );
        p.set(K.agentData(a.id), JSON.stringify({ p1, state: a.state || null, updatedAt: a.updatedAt || null }), {
          nx: true,
        });
        p.sadd(K.agents, a.id);
        p.hsetnx(K.p1stats, a.id, JSON.stringify({ t: p1.length, m: p1.filter((x) => x.met).length, u: a.updatedAt }));
        const act = a.activatedAt || markers[a.id];
        if (act) p.hsetnx(K.activated, a.id, act);
        await p.exec();
        agents++;
      }
    );

    await r.set(K.migrated, JSON.stringify({ at: new Date().toISOString(), leaders, agents }));
    migratedMemo = true;
    return { done: true, leaders, agents };
  } finally {
    await r.del(K.migrating);
  }
}
