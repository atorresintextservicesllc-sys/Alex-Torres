// Vercel Routing Middleware: owner-only pages need a valid staff session (the same signed cookie /admin sets).
// Checked on the server before the static page is served, so the page can't be opened by anyone who finds the URL.
// /admin and /admin-project stay open: they're only the login screen + a shell, and every API behind them checks the cookie.
export const config = { matcher: ['/billing', '/billing.html', '/billing/:path*'] };

const COOKIE = 'bpr_admin';
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

async function validSession(token, secret) {
  if (!token || !secret || secret.length < 32 || !token.includes('.')) return false;
  const [body, mac] = token.split('.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = b64u(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  if (expected.length !== mac.length) return false;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff) return false;
  try {
    const p = JSON.parse(decodeURIComponent(escape(fromB64u(body))));
    return p.t === 'admin' && (!p.exp || Date.now() < p.exp);
  } catch (_) { return false; }
}

export default async function middleware(request) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  if (await validSession(m && m[1], process.env.APP_SECRET)) return; // continue to the page
  const url = new URL(request.url);
  return Response.redirect(`${url.origin}/admin?next=${encodeURIComponent('/billing')}`, 307);
}
