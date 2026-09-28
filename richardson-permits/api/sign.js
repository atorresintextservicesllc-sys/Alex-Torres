// E-signature API.
//  POST ?action=prepare&id=  {fileId, title, signerName, signerEmail, fields:[{page,x,y,w,h,type}]}  staff -> { url }
//  POST ?action=link&id=&s=                                                              staff -> { url } (re-send)
//  POST ?action=void&id=&s=                                                              staff
//  GET  ?action=get&id=&s=      signer/client/staff -> request details (logs first view)
//  GET  ?action=pdf&id=&s=      the PDF to sign (or the signed copy once complete)
//  POST ?action=submit&id=&s=   {name, email, signature (PNG data URL), initials?, consent:true}
'use strict';
const { route, json, query, ok, fail, clientIp, httpError } = require('./_lib/http');
const auth = require('./_lib/auth');
const store = require('./_lib/store');
const P = require('./_lib/projects');
const E = require('./_lib/esign');
const Signing = require('./_lib/signing');

const BUSINESS = () => process.env.BUSINESS_NAME || 'Best Permit Runners';
const origin = (req) => `${req.headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http')}://${req.headers.host}`;

module.exports = route(['GET', 'POST'], async (req, res) => {
  const { action, id, s } = query(req);
  const p = await P.load(id);

  if (action === 'prepare') {
    const a = auth.requireAdmin(req);
    const b = await json(req);
    const r0 = await Signing.createRequest(p, { ...b, by: a.name });
    await P.save(p);
    return ok(res, { signing: r0, url: Signing.signUrl(origin(req), p, r0) });
  }

  const r = p.signing.find((x) => x.id === s);
  if (!r) throw httpError(404, 'Signing request not found');

  if (action === 'link') { auth.requireAdmin(req); return ok(res, { url: `${origin(req)}/sign#t=${auth.clientToken(p, { s: r.id })}&p=${p.id}&s=${r.id}` }); }
  if (action === 'void') {
    const a = auth.requireAdmin(req);
    if (r.status === 'signed') throw httpError(400, 'Already signed');
    r.status = 'void'; r.events.push({ type: 'void', at: P.now(), by: a.name });
    P.timeline(p, `Signature request cancelled: ${r.title}`, a.name);
    await P.save(p);
    return ok(res);
  }

  const who = auth.signerAccess(req, p, r.id);

  if (action === 'get') {
    if (!who.admin && r.status === 'sent' && !r.viewedAt) {
      r.viewedAt = P.now(); r.events.push({ type: 'viewed', at: r.viewedAt, ip: clientIp(req), ua: String(req.headers['user-agent'] || '').slice(0, 300) });
      await P.save(p);
    }
    return ok(res, { title: r.title, status: r.status, signer: r.signer, fields: r.fields, pages: r.pages, signedAt: r.signedAt,
      business: BUSINESS(), consent: E.CONSENT, project: { address: p.job.address, city: p.job.city } });
  }

  if (action === 'pdf') {
    const fileId = r.status === 'signed' ? r.signedFileId : r.fileId;
    const file = p.files.find((f) => f.id === fileId);
    const { stream, mime } = await store.openStream(file.ref);
    res.statusCode = 200;
    res.setHeader('Content-Type', mime || 'application/pdf');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${(r.status === 'signed' ? 'SIGNED-' : '') + file.name.replace(/"/g, '')}"`);
    stream.pipe(res);
    return;
  }

  if (action === 'submit') {
    if (r.status !== 'sent') throw httpError(400, r.status === 'signed' ? 'This document is already signed' : 'This request was cancelled');
    const b = await json(req);
    if (b.consent !== true) throw httpError(400, 'Please accept the electronic signature consent');
    const name = String(b.name || '').trim().slice(0, 120);
    if (name.length < 2) throw httpError(400, 'Type your full name');
    const signature = E.pngFromDataUrl(b.signature);
    if (!signature) throw httpError(400, 'Draw your signature');
    const initials = E.pngFromDataUrl(b.initials || '');
    const file = p.files.find((f) => f.id === r.fileId);
    const { buf } = await store.readFile(file.ref);
    if (E.sha256(buf) !== r.originalSha) throw httpError(409, 'The document changed after it was sent. Ask for a new signing link.');

    const signedAt = P.now(); const ip = clientIp(req); const ua = String(req.headers['user-agent'] || '').slice(0, 300);
    const ref = r.id;
    const out = await E.signPdf(buf, { fields: r.fields, signaturePng: signature, initialsPng: initials, name, signedAt, ref, business: BUSINESS(),
      audit: { title: r.title, ref, business: BUSINESS(), name, email: String(b.email || r.signer.email || '').slice(0, 200), sentAt: r.sentAt,
        viewedAt: r.viewedAt, signedAt, ip, ua, originalSha: r.originalSha, fieldCount: r.fields.length,
        pages: [...new Set(r.fields.map((f) => f.page + 1))].join(', ') } });

    const fileId = P.id('F');
    const signedName = `SIGNED - ${file.name.replace(/\.pdf$/i, '')}.pdf`.slice(0, 150);
    const refSigned = await store.writeFile(`projects/${p.id}/signeds/${fileId}-${signedName.replace(/[^\w.\- ()]+/g, '_')}`, out.buf, 'application/pdf');
    p.files.push({ id: fileId, name: signedName, size: out.buf.length, mime: 'application/pdf', kind: 'signed', ref: refSigned, by: name, byRole: 'signer', at: signedAt, internal: false });
    const audit = { ...r, signedAt, signedBy: { name, email: b.email || r.signer.email, ip, ua }, signedSha: out.sha, consent: E.CONSENT };
    await store.writeJSON(`projects/${p.id}/signeds/${r.id}-audit.json`, audit);
    Object.assign(r, { status: 'signed', signedAt, signedFileId: fileId, signedSha: out.sha, signedBy: { name, ip } });
    r.events.push({ type: 'signed', at: signedAt, ip, ua });
    P.timeline(p, `Signed: ${r.title} (by ${name})`, name);
    await P.save(p);
    return ok(res, { ok: true, signedAt });
  }
  return fail(res, 400, 'Unknown action');
});
