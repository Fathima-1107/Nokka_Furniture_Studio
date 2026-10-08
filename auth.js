// NOKKA — signed tokens + password hashing (no extra dependencies)
import crypto from 'crypto';
import fs from 'fs';

const SECRET_FILE = './data/db/.secret';
let SECRET = process.env.NOKKA_SECRET;
if (!SECRET) {
  try { SECRET = fs.readFileSync(SECRET_FILE, 'utf8'); }
  catch { SECRET = crypto.randomBytes(32).toString('hex'); try { fs.writeFileSync(SECRET_FILE, SECRET); } catch {} }
}
const b64 = (s) => Buffer.from(s).toString('base64url');
const mac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

export function signToken(payload, ttlHours = 12) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + ttlHours * 3600e3 }));
  return `${body}.${mac(body)}`;
}
export function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const good = mac(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
}
export function checkPassword(pw, stored) {
  if (!stored) return false;
  if (!stored.startsWith('scrypt$')) return pw === stored; // legacy plaintext (upgraded on next login)
  const [, salt, hash] = stored.split('$');
  const test = crypto.scryptSync(pw, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(test), Buffer.from(hash));
}
export const isHashed = (s) => typeof s === 'string' && s.startsWith('scrypt$');
export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer /, '');
