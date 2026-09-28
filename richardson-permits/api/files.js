// Files API (staff, clients with a project link, and the worker).
//  POST ?action=begin&id=   {name, size, mime, kind, requestId?, internal?}  -> { upload, chunkSize }
//  PUT  ?action=chunk&upload=<token>   header X-Start: <byte offset>, raw body (<= 4 MiB)  -> { done, file? }
//  GET  ?action=get&id=&f=<fileId>[&dl=1]    stream the file (clients: non-internal files only)
//  POST ?action=update&id=&f=  {internal?, name?}   staff
//  POST ?action=remove&id=&f=                      staff (hides from the project; the stored copy is kept)
'use strict';
const { route, json, query, ok, fail, rawBody, httpError } = require('./_lib/http');
const auth = require('./_lib/auth');
const store = require('./_lib/store');
const P = require('./_lib/projects');

const CHUNK = 4 * 1024 * 1024;           // multiple of 256 KiB (Drive) and under Vercel's 4.5 MB body limit
const MAX_SIZE = 250 * 1024 * 1024;
const TYPES = /\.(pdf|jpe?g|png|heic|heif|webp|gif|tiff?|docx?|xlsx?|csv|txt|dwg|dxf|zip)$/i;
const KINDS = ['document', 'drawing', 'photo', 'signed', 'packet', 'proposal', 'takeoff', 'report', 'other'];
const safeName = (n) => String(n || 'file').replace(/[^\w.\- ()]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';

async function callerFor(req, p) {
  try { return auth.access(req, p); } catch (e) {
    try { auth.requireWorker(req); return { role: 'worker', name: 'Worker' }; } catch (_) { throw e; }
  }
}

module.exports = route(['GET', 'POST', 'PUT'], async (req, res) => {
  const { action, id, f, upload, dl } = query(req);

  if (action === 'chunk') {
    const start = Number(req.headers['x-start']);
    if (!Number.isFinite(start) || start < 0) throw httpError(400, 'Missing X-Start');
    const buf = await rawBody(req, CHUNK + 1024);
    const r = await store.uploadChunk(upload, buf, start);
    if (!r.done) return ok(res, { done: false, received: start + buf.length });
    // Register the finished file on its project.
    const m = r.meta;
    const p = await P.load(m.projectId);
    const rec = { id: m.fileId, name: m.name, size: r.size, mime: r.mime, kind: m.kind, ref: r.ref, by: m.by, byRole: m.role, at: P.now(),
      internal: !!m.internal, requestId: m.requestId || undefined };
    p.files.push(rec);
    if (m.requestId) {
      const rq = p.requests.find((x) => x.id === m.requestId);
      if (rq) { rq.fileIds.push(rec.id); if (m.role === 'client') rq.status = 'received'; }
    }
    P.timeline(p, `${m.role === 'client' ? 'Uploaded' : 'Added'} ${rec.kind === 'drawing' ? 'drawing' : 'file'}: ${rec.name}`, m.by, rec.internal ? { internal: true } : {});
    await P.save(p);
    return ok(res, { done: true, file: P.fileView(rec) });
  }

  const p = await P.load(id);
  const who = await callerFor(req, p);

  if (action === 'begin') {
    const b = await json(req);
    const size = Number(b.size);
    const staffJson = who.role !== 'client' && /\.json$/i.test(b.name || ''); // takeoff drafts from the worker
    if (!b.name || !(TYPES.test(b.name) || staffJson)) throw httpError(400, 'That file type is not accepted (PDF, images, Office, DWG/DXF, ZIP).');
    if (!(size > 0) || size > MAX_SIZE) throw httpError(400, `Files must be under ${MAX_SIZE / 1024 / 1024} MB.`);
    const kind = KINDS.includes(b.kind) ? b.kind : 'document';
    if (who.role === 'client' && !['document', 'drawing', 'photo'].includes(kind)) throw httpError(403, 'Not allowed');
    if (b.requestId && !p.requests.find((x) => x.id === b.requestId)) throw httpError(404, 'Request not found');
    const fileId = P.id('F');
    const keyName = `${fileId}-${safeName(b.name)}`;
    const token = await store.beginUpload(`projects/${p.id}/${kind}s/${keyName}`, String(b.mime || 'application/octet-stream').slice(0, 100), size,
      { projectId: p.id, fileId, name: safeName(b.name), kind, requestId: b.requestId || null, internal: who.role !== 'client' && !!b.internal,
        role: who.role, by: who.role === 'client' ? (p.client.name || p.client.company || 'Client') : who.name });
    return ok(res, { upload: token, chunkSize: CHUNK });
  }

  const rec = p.files.find((x) => x.id === f && !x.removed);
  if (!rec) throw httpError(404, 'File not found');

  if (action === 'get') {
    if (who.role === 'client' && rec.internal) throw httpError(404, 'File not found');
    const { stream, mime, size } = await store.openStream(rec.ref);
    res.statusCode = 200;
    res.setHeader('Content-Type', mime || rec.mime || 'application/octet-stream');
    if (size) res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${dl ? 'attachment' : 'inline'}; filename="${rec.name.replace(/"/g, '')}"`);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
    return;
  }

  if (who.role !== 'admin') throw httpError(403, 'Staff only');
  if (action === 'update') {
    const b = await json(req);
    if (b.internal !== undefined) rec.internal = !!b.internal;
    if (b.name) rec.name = safeName(b.name);
    await P.save(p);
    return ok(res, { file: P.fileView(rec) });
  }
  if (action === 'remove') {
    rec.removed = true;
    P.timeline(p, `Removed file: ${rec.name}`, who.name, { internal: true });
    await P.save(p);
    return ok(res);
  }
  return fail(res, 400, 'Unknown action');
});
