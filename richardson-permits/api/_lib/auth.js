// Auth without a user database:
//  - Staff: one ADMIN_PASSWORD (per deployment/tenant) -> signed, HttpOnly session cookie.
//  - Clients: signed capability links scoped to one project (and optionally one signing request).
//    Each project has a tokenVersion; bumping it revokes every link issued for that project.
//  - Worker: WORKER_TOKEN bearer for the packet/takeoff worker.
'use strict';
const crypto = require('crypto');
const { httpError } = require('./http');

const SECRET = () => {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw httpError(503, 'The client portal is being set up. Please call or text us for now.');
  return s;
};
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const hmac = (data) => crypto.createHmac('sha256', SECRET()).update(data).digest('base64url');
const safeEq = (a, b) => {
  const A = Buffer.from(String(a)); const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  return `${body}.${hmac(body)}`;
}
function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  if (!safeEq(mac, hmac(body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch (_) { return null; }
}

// ---- staff session ----
const COOKIE = 'bpr_admin';
const SESSION_MS = 12 * 3600 * 1000;
function checkPassword(pw) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected.length < 10) throw httpError(503, 'Staff login is being set up (ADMIN_PASSWORD not configured).');
  return safeEq(pw || '', expected);
}
function sessionCookie(name) {
  const token = sign({ t: 'admin', name: name || 'Staff', exp: Date.now() + SESSION_MS });
  const secure = process.env.VERCEL ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure}`;
}
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
function readCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? m[1] : null;
}
function admin(req) {
  const p = verify(readCookie(req, COOKIE));
  return p && p.t === 'admin' ? p : null;
}
function requireAdmin(req) {
  const a = admin(req);
  if (!a) throw httpError(401, 'Staff login required');
  return a;
}

// ---- client capability tokens ----
function clientToken(project, extra = {}) {
  return sign({ t: 'client', p: project.id, v: project.tokenVersion || 1, ...extra });
}
function readClientToken(req) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Client ') ? h.slice(7) : (new URL(req.url, 'http://x').searchParams.get('t'));
  const p = verify(tok);
  return p && p.t === 'client' ? p : null;
}
// Returns { role: 'admin'|'client', ...} if the caller may access project `project`.
function access(req, project) {
  const a = admin(req);
  if (a) return { role: 'admin', name: a.name };
  const c = readClientToken(req);
  // Signing-only links (c.s) can't open the project portal.
  if (c && !c.s && c.p === project.id && c.v === (project.tokenVersion || 1)) return { role: 'client', token: c };
  throw httpError(403, 'This link is not valid for this project');
}

// ---- worker ----
function requireWorker(req) {
  const expected = process.env.WORKER_TOKEN;
  const h = req.headers.authorization || '';
  if (!expected || !h.startsWith('Bearer ') || !safeEq(h.slice(7), expected)) throw httpError(401, 'Worker token required');
  return true;
}

// ---- invoice links ----
const invoiceMac = (i) => hmac(`invoice:${i}`).slice(0, 27); // 160 bits, keeps the link short
const checkInvoiceMac = (i, s) => safeEq(s, invoiceMac(i));

// A signing link: valid for exactly one signing request on one project.
function signerAccess(req, project, signId) {
  const c = readClientToken(req);
  if (c && c.p === project.id && c.v === (project.tokenVersion || 1) && (c.s === signId || !c.s)) return c;
  if (admin(req)) return { admin: true };
  throw httpError(403, 'This signing link is not valid');
}

module.exports = { signerAccess, sign, verify, checkPassword, sessionCookie, clearCookie, admin, requireAdmin, clientToken, readClientToken, access, requireWorker, safeEq, invoiceMac, checkInvoiceMac };
