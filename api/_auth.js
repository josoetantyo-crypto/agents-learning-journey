// Helper auth bersama — file berawalan _ tidak di-deploy sebagai endpoint
import { get } from '@vercel/blob';
import crypto from 'node:crypto';

export const LEADER_PREFIX = 'leaders/';
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
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  const expect = crypto.createHmac('sha256', secret()).update(id + '.' + exp).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return id;
}

export async function readLeader(id) {
  const result = await get(LEADER_PREFIX + id + '.json', { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

// Leader dari token request — null kalau token invalid/kedaluwarsa atau leader sudah dihapus
export async function leaderFromReq(req) {
  const id = tokenLeaderId(req);
  if (!id) return null;
  try {
    return await readLeader(id);
  } catch {
    return null;
  }
}
