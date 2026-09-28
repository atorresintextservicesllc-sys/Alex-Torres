// End-to-end API smoke test against a running local server: node tests/api-smoke.js [baseUrl]
// Uses ADMIN_PASSWORD from .env.local. Creates a throwaway project in the local store.
'use strict';
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const BASE = process.argv[2] || 'http://localhost:4322';
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
let cookie = '';
let passed = 0;
const check = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); passed++; console.log('  ✓', msg); };

async function call(url, opts = {}) {
  const r = await fetch(BASE + url, { ...opts, headers: { ...(opts.headers || {}), ...(cookie && !opts.noCookie ? { cookie } : {}) } });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
}
const post = (url, body, opts = {}) => call(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: JSON.stringify(body), noCookie: opts.noCookie });

async function upload(pid, name, buf, kind, auth) {
  const headers = auth ? { Authorization: auth } : {};
  const b = await call(`/api/files?action=begin&id=${pid}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ name, size: buf.length, mime: 'application/pdf', kind }), noCookie: !!auth });
  if (b.status !== 200) throw new Error('begin failed ' + JSON.stringify(b.body));
  let r; for (let s = 0; s < buf.length; s += b.body.chunkSize) {
    r = await call(`/api/files?action=chunk&upload=${encodeURIComponent(b.body.upload)}`, { method: 'PUT', headers: { 'X-Start': String(s), 'Content-Type': 'application/octet-stream' }, body: buf.slice(s, s + b.body.chunkSize), noCookie: true });
  }
  return r.body.file;
}

(async () => {
  console.log('API smoke test →', BASE);
  check((await post('/api/admin?action=login', { password: 'wrong-password' }, { noCookie: true })).status === 401, 'wrong password rejected');
  check((await call('/api/projects?action=list', { noCookie: true })).status === 401, 'project list needs staff login');
  check((await post('/api/admin?action=login', { password: env.ADMIN_PASSWORD, name: 'Natasha' })).status === 200 && cookie, 'staff login sets session cookie');

  const c = await post('/api/projects?action=create', { client: { company: 'Test Roofing Co', name: 'Pat Owner', email: 'pat@example.com', phone: '5615550100', license: 'CCC0000000' }, job: { address: '123 Palm Way', city: 'Boca Raton', county: 'Palm Beach', type: 'Re-roof' } });
  check(c.status === 200 && c.body.project.id, 'project created');
  const pid = c.body.project.id;
  check((await post(`/api/projects?action=request&id=${pid}`, { label: 'Signed contract' })).status === 200, 'document request added');
  check((await post(`/api/projects?action=update&id=${pid}`, { status: 'docs' })).body.project.status === 'docs', 'status updated');

  // A 2-page PDF to sign
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 2; i++) doc.addPage([612, 792]).drawText(`Test contract page ${i}`, { x: 60, y: 700, size: 18, font });
  const pdf = Buffer.from(await doc.save());
  const f = await upload(pid, 'Contract.pdf', pdf, 'document');
  check(f && f.id, 'staff uploaded a PDF (chunked)');

  // Big-ish upload to exercise multi-chunk path (9 MB)
  const big = Buffer.concat([pdf, Buffer.alloc(9 * 1024 * 1024, 7)]);
  const fb = await upload(pid, 'Big drawings.pdf', big, 'drawing');
  check(fb && fb.size === big.length, 'multi-chunk 9 MB drawing upload reassembled');

  const link = await post(`/api/projects?action=link&id=${pid}`, {});
  const token = decodeURIComponent(link.body.url.split('#t=')[1]);
  check(token, 'client portal link issued');
  const cv = await call(`/api/projects?action=get&id=${pid}`, { headers: { Authorization: `Client ${token}` }, noCookie: true });
  check(cv.status === 200 && cv.body.project.client.company === 'Test Roofing Co' && !('email' in cv.body.project.client), 'client sees project without private fields');
  check((await call(`/api/projects?action=update&id=${pid}`, { method: 'POST', headers: { Authorization: `Client ${token}`, 'Content-Type': 'application/json' }, body: '{"status":"closed"}', noCookie: true })).status === 403, 'client cannot change status');
  const reqId = cv.body.project.requests[0].id;

  // client uploads against the request
  const b2 = await call(`/api/files?action=begin&id=${pid}`, { method: 'POST', headers: { Authorization: `Client ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'contract-signed.pdf', size: pdf.length, mime: 'application/pdf', kind: 'document', requestId: reqId }), noCookie: true });
  const r2 = await call(`/api/files?action=chunk&upload=${encodeURIComponent(b2.body.upload)}`, { method: 'PUT', headers: { 'X-Start': '0' }, body: pdf, noCookie: true });
  check(r2.body.done, 'client uploaded a file against the request');
  const cv2 = await call(`/api/projects?action=get&id=${pid}`, { headers: { Authorization: `Client ${token}` }, noCookie: true });
  check(cv2.body.project.requests[0].status === 'received', 'request auto-marked received');

  // internal files hidden from client
  await post(`/api/files?action=update&id=${pid}&f=${fb.id}`, { internal: true });
  const cv3 = await call(`/api/projects?action=get&id=${pid}`, { headers: { Authorization: `Client ${token}` }, noCookie: true });
  check(!cv3.body.project.files.find((x) => x.id === fb.id), 'internal file hidden from client list');
  check((await call(`/api/files?action=get&id=${pid}&f=${fb.id}`, { headers: { Authorization: `Client ${token}` }, noCookie: true })).status === 404, 'internal file download blocked for client');
  check((await call(`/api/files?action=get&id=${pid}&f=${f.id}`, { headers: { Authorization: `Client ${token}` }, noCookie: true })).body.slice(0, 5).toString() === '%PDF-', 'client can download shared file');

  // e-sign
  const prep = await post(`/api/sign?action=prepare&id=${pid}`, { fileId: f.id, title: 'Service agreement', signerName: 'Pat Owner', signerEmail: 'pat@example.com',
    fields: [{ page: 1, x: 60, y: 600, w: 200, h: 50, type: 'signature' }, { page: 1, x: 300, y: 610, w: 150, h: 20, type: 'date' }, { page: 0, x: 60, y: 650, w: 180, h: 20, type: 'name' }] });
  check(prep.status === 200, 'document sent for signature');
  const sid = prep.body.signing.id;
  const stoken = decodeURIComponent(prep.body.url.split('#t=')[1].split('&')[0]);
  check((await call(`/api/projects?action=get&id=${pid}`, { headers: { Authorization: `Client ${stoken}` }, noCookie: true })).status === 403, 'signing link cannot open the project portal');
  const g = await call(`/api/sign?action=get&id=${pid}&s=${sid}`, { headers: { Authorization: `Client ${stoken}` }, noCookie: true });
  check(g.status === 200 && g.body.fields.length === 3, 'signer can load the request');
  const png = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'sig.png')).toString('base64');
  check((await post(`/api/sign?action=submit&id=${pid}&s=${sid}`, { name: 'Pat Owner', signature: png, consent: false }, { noCookie: true, headers: { Authorization: `Client ${stoken}` } })).status === 400, 'signing without consent refused');
  const sub = await post(`/api/sign?action=submit&id=${pid}&s=${sid}`, { name: 'Pat Owner', email: 'pat@example.com', signature: png, consent: true }, { noCookie: true, headers: { Authorization: `Client ${stoken}` } });
  check(sub.status === 200, 'document signed');
  check((await post(`/api/sign?action=submit&id=${pid}&s=${sid}`, { name: 'Pat Owner', signature: png, consent: true }, { noCookie: true, headers: { Authorization: `Client ${stoken}` } })).status === 400, 'cannot sign twice');
  const signed = await call(`/api/sign?action=pdf&id=${pid}&s=${sid}`, { headers: { Authorization: `Client ${stoken}` }, noCookie: true });
  const sdoc = await PDFDocument.load(signed.body);
  check(sdoc.getPageCount() === 3, 'signed PDF has original pages + audit certificate');
  const full = await call(`/api/projects?action=get&id=${pid}`);
  const srec = full.body.project.signing[0];
  check(srec.status === 'signed' && srec.signedSha && srec.events.some((e) => e.type === 'viewed'), 'audit trail recorded (viewed + signed + hash)');

  // revoke
  await post(`/api/projects?action=link&id=${pid}`, { revoke: true });
  check((await call(`/api/projects?action=get&id=${pid}`, { headers: { Authorization: `Client ${token}` }, noCookie: true })).status === 403, 'revoked client link no longer works');
  fs.writeFileSync(path.join(__dirname, 'last-signed.pdf'), signed.body);
  console.log(`\nAll ${passed} checks passed. Project ${pid}. Signed PDF → tests/last-signed.pdf`);
})().catch((e) => { console.error(e.message); process.exit(1); });
