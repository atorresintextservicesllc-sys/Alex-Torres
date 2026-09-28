// Staff session: POST ?action=login {password, name} · POST ?action=logout · GET ?action=me
'use strict';
const { route, json, query, ok, fail } = require('./_lib/http');
const auth = require('./_lib/auth');
const store = require('./_lib/store');

module.exports = route(['GET', 'POST'], async (req, res) => {
  const { action } = query(req);
  if (action === 'login' && req.method === 'POST') {
    const { password, name } = await json(req);
    // Slow down guessing a little (serverless has no shared memory for real rate limiting).
    await new Promise((r) => setTimeout(r, 400));
    if (!auth.checkPassword(password)) return fail(res, 401, 'Wrong password');
    res.setHeader('Set-Cookie', auth.sessionCookie(String(name || 'Staff').slice(0, 40)));
    return ok(res, { ok: true });
  }
  if (action === 'logout') { res.setHeader('Set-Cookie', auth.clearCookie()); return ok(res); }
  if (action === 'me') {
    const a = auth.admin(req);
    return ok(res, { admin: !!a, name: a?.name || null, storage: store.mode() });
  }
  // Invoice links carry their details in the URL (#i=...). Staff-issued links get a server signature (&s=...),
  // and /invoice only shows links whose signature checks out, so nobody can hand-craft an invoice in our name.
  if (action === 'invoice-sign' && req.method === 'POST') {
    auth.requireAdmin(req);
    const { i } = await json(req);
    if (!i || typeof i !== 'string' || i.length > 20000) return fail(res, 400, 'Missing invoice');
    return ok(res, { s: auth.invoiceMac(i) });
  }
  if (action === 'invoice-check' && req.method === 'POST') {
    const { i, s } = await json(req);
    return ok(res, { valid: !!(i && s && typeof i === 'string' && auth.checkInvoiceMac(i, s)) });
  }
  return fail(res, 400, 'Unknown action');
});
