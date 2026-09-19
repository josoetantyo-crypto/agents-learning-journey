// Database utama: Upstash Redis (free tier, via Vercel Marketplace).
// Data lama di Vercel Blob (agents-journey-db) dipindahkan otomatis sekali jalan — lihat ensureMigrated().
// Selama store Blob disuspend, isi file tidak bisa dibaca (403) tapi daftar nama file masih bisa —
// dari daftar itu semua link agent lama dihidupkan kembali sebagai placeholder — lihat recoverFromListing().
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
  recovered: 'ig:recovered', // JSON {at,agents,leaders} — hasil recoverFromListing
  recovering: 'ig:recovering',
  recoverRetryAfter: 'ig:recover-retry-after',
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
  'Database sedang dipulihkan. Progress kamu aman tersimpan di HP dan akan tersambung lagi otomatis — coba buka lagi beberapa menit lagi.';

// ── Migrasi sekali jalan dari Vercel Blob ──
let migratedMemo = false;

export async function isMigrated(r) {
  if (migratedMemo) return true;
  migratedMemo = !!(await r.get(K.migrated));
  return migratedMemo;
}

async function readBlobText(pathname) {
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return await new Response(result.stream).text();
}

async function readBlobJson(pathname) {
  const text = await readBlobText(pathname);
  return text === null ? null : JSON.parse(text);
}

// Apakah isi Blob sudah bisa dibaca lagi?
// Harus diprobe dengan file yang BENAR-BENAR ADA: path karangan menjawab 404 dan dulu salah
// dikira "store diblokir", sehingga migrasi tidak pernah jalan walau blokirnya sudah dibuka.
// Store yang diblokir menjawab 403 "Your store is blocked" untuk file apa pun, padahal list() tetap jalan.
async function probeBlobReadable() {
  let page;
  try {
    page = await list({ limit: 1 });
  } catch (e) {
    return { ok: false, reason: e.message };
  }
  if (!page.blobs.length) return { ok: false, reason: 'Daftar Blob kosong' };
  try {
    const text = await readBlobText(page.blobs[0].pathname);
    if (text === null) return { ok: false, reason: 'Blob tidak terbaca' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
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

// Gabung dua name list P1 berdasarkan id — entri yang sudah ada di Redis (progress terbaru dari HP) menang
function mergeP1(older, newer) {
  const byId = new Map();
  for (const x of Array.isArray(older) ? older : []) byId.set(String(x && x.id), x);
  for (const x of Array.isArray(newer) ? newer : []) byId.set(String(x && x.id), x);
  return [...byId.values()].filter(Boolean);
}

// Kembalikan { done, blocked?, error? }. Aman dipanggil berkali-kali: tidak pernah menghapus progress yang
// sudah masuk Redis dan tidak pernah menghapus Blob (tetap jadi backup). Record placeholder hasil
// recoverFromListing() ditimpa data asli begitu Blob bisa dibaca lagi.
export async function ensureMigrated(r, { force = false } = {}) {
  if (await isMigrated(r)) return { done: true };
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { done: false, error: 'Blob tidak terhubung' };
  if (!force && (await r.get(K.blobRetryAfter))) return { done: false, blocked: true };

  const probe = await probeBlobReadable();
  if (!probe.ok) {
    await r.set(K.blobRetryAfter, '1', { ex: 900 });
    return { done: false, blocked: true, error: probe.reason };
  }

  if (!(await r.set(K.migrating, '1', { nx: true, ex: 240 }))) return { done: false, busy: true };
  try {
    const leaderBlobs = (await listAll('leaders/')).filter((b) => b.pathname.endsWith('.json'));
    const agentBlobs = await listAll('agents/');
    if (!leaderBlobs.length && !agentBlobs.length) {
      // Store berisi 111 file saat disuspend — kosong berarti belum benar-benar terbaca, jangan tandai selesai
      await r.set(K.blobRetryAfter, '1', { ex: 1800 });
      return { done: false, blocked: true, error: 'Blob kosong' };
    }

    let leaders = 0;
    await mapLimit(leaderBlobs, 8, async (b) => {
      const l = await readBlobJson(b.pathname);
      if (!l || !l.id || !validId(l.id)) return;
      const cur = parse(await r.get(K.leader(l.id)));
      const p = r.pipeline();
      // Akun asli (termasuk password lama) menimpa placeholder; akun yang dibuat ulang admin tidak diganggu
      if (!cur || cur.recovered) p.set(K.leader(l.id), JSON.stringify(l));
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
        const [curMetaS, curDataS] = await r.mget(K.agent(a.id), K.agentData(a.id));
        const curMeta = parse(curMetaS);
        const cur = parse(curDataS) || {};
        const p = r.pipeline();
        if (!curMeta || curMeta.recovered) {
          p.set(
            K.agent(a.id),
            JSON.stringify({ id: a.id, name: a.name, wa: a.wa, leaderId: a.leaderId || null, createdAt: a.createdAt })
          );
        }
        // Name list lama + progress yang sudah tersimpan di Redis digabung, tidak ada yang hilang
        const p1 = mergeP1(a.p1, cur.p1);
        p.set(
          K.agentData(a.id),
          JSON.stringify({
            p1,
            state: cur.state || a.state || null,
            updatedAt: cur.updatedAt || a.updatedAt || null,
          })
        );
        p.sadd(K.agents, a.id);
        p.hset(K.p1stats, {
          [a.id]: JSON.stringify({ t: p1.length, m: p1.filter((x) => x.met).length, u: cur.updatedAt || a.updatedAt }),
        });
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

// ── Pemulihan darurat: hidupkan kembali link lama tanpa membaca isi Blob ──
// Store yang disuspend menolak download (403) tapi masih mengizinkan list(), dan nama file = ID agent.
// Dari situ semua link lama dibuat ulang sebagai record placeholder ({recovered:true}) supaya tidak
// lagi muncul "Link Tidak Aktif": agent buka link -> progress di HP-nya tersambung lagi dan ikut tersimpan.
// Nama, no WA, dan leader-nya menyusul otomatis begitu Blob aktif lagi (ensureMigrated menimpa placeholder).
export async function recoverFromListing(r, { force = false } = {}) {
  if (await isMigrated(r)) return { done: true, already: true };
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { done: false, error: 'Blob tidak terhubung' };
  const info = parse(await r.get(K.recovered));
  if (info && !force) return { done: true, already: true, ...info };
  if (!force && (await r.get(K.recoverRetryAfter))) return { done: false, blocked: true };
  if (!(await r.set(K.recovering, '1', { nx: true, ex: 120 }))) return { done: false, busy: true };

  try {
    const agentBlobs = await listAll('agents/');
    const leaderBlobs = await listAll('leaders/');
    if (!agentBlobs.length && !leaderBlobs.length) {
      await r.set(K.recoverRetryAfter, '1', { ex: 900 });
      return { done: false, blocked: true, error: 'Daftar Blob kosong' };
    }

    const created = {}; // id -> ISO createdAt (dari file .json)
    const markers = {}; // id -> ISO activatedAt (dari file .activated)
    for (const b of agentBlobs) {
      const rest = b.pathname.slice('agents/'.length);
      const at = new Date(b.uploadedAt).toISOString();
      if (rest.endsWith('.json')) created[rest.slice(0, -'.json'.length)] = at;
      else if (rest.endsWith('.activated')) markers[rest.slice(0, -'.activated'.length)] = at;
    }

    let agents = 0;
    await mapLimit(Object.keys(created).filter(validId), 8, async (id) => {
      const p = r.pipeline();
      p.set(
        K.agent(id),
        JSON.stringify({ id, name: '', wa: '', leaderId: null, createdAt: created[id], recovered: true }),
        { nx: true } // nx: agent yang sudah punya data asli tidak boleh dikosongkan
      );
      p.set(K.agentData(id), JSON.stringify({ p1: [], state: null, updatedAt: null }), { nx: true });
      p.sadd(K.agents, id);
      p.hsetnx(K.p1stats, id, JSON.stringify({ t: 0, m: 0, u: created[id] }));
      if (markers[id]) p.hsetnx(K.activated, id, markers[id]);
      await p.exec();
      agents++;
    });

    let leaders = 0;
    await mapLimit(
      leaderBlobs.filter((b) => b.pathname.endsWith('.json')),
      8,
      async (b) => {
        const id = b.pathname.slice('leaders/'.length, -'.json'.length);
        if (!validId(id)) return;
        const p = r.pipeline();
        // Tanpa salt/passHash: login ditolak sampai admin set ulang password (lihat api/leaders.js)
        p.set(
          K.leader(id),
          JSON.stringify({ id, name: id, createdAt: new Date(b.uploadedAt).toISOString(), recovered: true }),
          { nx: true }
        );
        p.sadd(K.leaders, id);
        await p.exec();
        leaders++;
      }
    );

    const result = { at: new Date().toISOString(), agents, leaders };
    await r.set(K.recovered, JSON.stringify(result));
    return { done: true, ...result };
  } finally {
    await r.del(K.recovering);
  }
}

// Dipakai endpoint yang perlu memastikan agent/leader lama ada sebelum menyerah 404:
// coba migrasi penuh dulu, kalau Blob masih disuspend jatuh ke pemulihan dari daftar file.
export async function ensureRestored(r) {
  const mig = await ensureMigrated(r);
  if (mig.done) return mig;
  const rec = await recoverFromListing(r);
  return { ...mig, recovered: rec.done, recoverError: rec.error };
}
