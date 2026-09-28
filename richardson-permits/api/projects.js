// Projects API. Staff (session cookie) can do everything; a client link can read its own project and post messages.
//  GET  ?action=list                        staff
//  POST ?action=create      {client, job}   staff
//  GET  ?action=get&id=                     staff -> full record · client -> client view
//  POST ?action=update&id=  {client?, job?, status?}          staff
//  POST ?action=request&id= {label, note}                     staff: ask the client for a document
//  POST ?action=request-status&id= {requestId, status}        staff
//  POST ?action=note&id=    {text, internal}                  staff: timeline note
//  POST ?action=link&id=    {revoke?}                         staff: client portal link (revoke = invalidate old links)
//  POST ?action=message&id= {text}                            client: message to staff
'use strict';
const { route, json, query, ok, fail, httpError } = require('./_lib/http');
const auth = require('./_lib/auth');
const P = require('./_lib/projects');

const origin = (req) => `${req.headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http')}://${req.headers.host}`;

module.exports = route(['GET', 'POST'], async (req, res) => {
  const { action, id } = query(req);

  if (action === 'list') { auth.requireAdmin(req); return ok(res, { projects: await P.list(), statuses: P.STATUSES }); }

  if (action === 'create') {
    const a = auth.requireAdmin(req);
    const body = await json(req);
    if (!body.client?.company && !body.client?.name) throw httpError(400, 'Client company or name is required');
    const p = P.create(body, a.name);
    await P.save(p);
    return ok(res, { project: p });
  }

  const p = await P.load(id);
  const who = auth.access(req, p);

  if (action === 'get') {
    if (who.role === 'admin') return ok(res, { project: p, statuses: P.STATUSES });
    return ok(res, { project: P.clientView(p) });
  }

  if (action === 'message') {
    if (who.role !== 'client') throw httpError(403, 'Clients only');
    const { text } = await json(req);
    if (!text || !String(text).trim()) throw httpError(400, 'Message is empty');
    P.timeline(p, `Message: ${String(text).trim()}`, p.client.name || p.client.company || 'Client', { fromClient: true });
    await P.save(p);
    return ok(res, { project: P.clientView(p) });
  }

  // ---- staff-only below ----
  if (who.role !== 'admin') throw httpError(403, 'Staff only');
  const body = req.method === 'POST' ? await json(req) : {};

  if (action === 'update') {
    if (body.client) Object.assign(p.client, P.pick(body.client, ['company', 'name', 'email', 'phone', 'license', 'qualifier', 'address', 'city', 'state', 'zip']));
    if (body.job) Object.assign(p.job, P.pick(body.job, ['address', 'city', 'county', 'zip', 'type', 'owner', 'ownerPhone', 'pcn', 'legal', 'value', 'permitNo', 'notes']));
    if (body.status && body.status !== p.status) {
      if (!P.STATUS_KEYS.includes(body.status)) throw httpError(400, 'Unknown status');
      p.status = body.status;
      P.timeline(p, `Status: ${P.STATUSES.find((s) => s[0] === body.status)[1]}`, who.name);
    }
    await P.save(p);
    return ok(res, { project: p });
  }
  if (action === 'request') {
    if (!body.label) throw httpError(400, 'What document do you need?');
    const r = { id: P.id('R'), label: String(body.label).slice(0, 200), note: String(body.note || '').slice(0, 500), status: 'open', fileIds: [], at: P.now() };
    p.requests.push(r);
    P.timeline(p, `Requested: ${r.label}`, who.name);
    await P.save(p);
    return ok(res, { project: p });
  }
  if (action === 'request-status') {
    const r = p.requests.find((x) => x.id === body.requestId);
    if (!r) throw httpError(404, 'Request not found');
    r.status = body.status === 'open' ? 'open' : 'received';
    P.timeline(p, `${r.label}: ${r.status === 'open' ? 'reopened' : 'marked received'}`, who.name);
    await P.save(p);
    return ok(res, { project: p });
  }
  if (action === 'note') {
    if (!body.text) throw httpError(400, 'Note is empty');
    P.timeline(p, body.text, who.name, body.internal ? { internal: true } : {});
    await P.save(p);
    return ok(res, { project: p });
  }
  if (action === 'link') {
    if (body.revoke) { p.tokenVersion = (p.tokenVersion || 1) + 1; P.timeline(p, 'Client links reset', who.name, { internal: true }); await P.save(p); }
    return ok(res, { url: `${origin(req)}/portal#t=${auth.clientToken(p)}` });
  }
  return fail(res, 400, 'Unknown action');
});
