// Helper auth bersama — file berawalan _ tidak di-deploy sebagai endpoint
import crypto from 'node:crypto';
import { K, parse, validId, isMigrated } from './_db.js';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // sesi leader berlaku 30 hari

export function secret() {
  return process.env.ADMIN_KEY || '';
}

export function isAdmin(req) {
  const key = secret();
  return !!key && req.headers['x-admin-key'] === key;
}

export function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString('hex');
}

// Token sesi stateless: "<leaderId>.<expiryMs>.<hmac>" — ditandatangani pakai ADMIN_KEY
export function signToken(leaderId) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const sig = crypto.createHmac('sha256', secret()).update(leaderId + '.' + exp).digest('hex');
  return leaderId + '.' + exp + '.' + sig;
}

function tokenLeaderId(req) {
  const token = req.headers['x-leader-token'];
  if (!token || !secret()) return null;
  const parts = String(token).split('.');
  if (parts.length < 3) return null;
  // ID leader boleh mengandung titik — exp & sig selalu dua bagian terakhir
  const sig = parts.pop();
  const exp = parts.pop();
  const id = parts.join('.');
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  const expect = crypto.createHmac('sha256', secret()).update(id + '.' + exp).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return id;
}

export async function readLeader(r, id) {
  if (!validId(id)) return null;
  return parse(await r.get(K.leader(id)));
}

// Leader dari token request — null kalau token invalid/kedaluwarsa atau leader sudah dihapus.
// Selama data lama belum selesai dipindahkan, token yang sah tetap diterima supaya leader tidak ter-logout.
export async function leaderFromReq(r, req) {
  const id = tokenLeaderId(req);
  if (!id) return null;
  const leader = await readLeader(r, id);
  if (leader) return leader;
  if (validId(id) && !(await isMigrated(r))) return { id, name: id, pending: true };
  return null;
}
