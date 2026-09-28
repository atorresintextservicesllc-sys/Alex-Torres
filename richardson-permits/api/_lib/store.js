// Storage: Vercel Blob (private) or Google Drive in production; local disk for development / tests.
// Everything is addressed by a path-like key ("projects/<id>/project.json").
// Files return an opaque `ref` (Drive file id, or the local key) that is stored in project records.
//
// Drive auth (pick one):
//   GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN   (OAuth as the Drive owner; works with personal Gmail)
//   GOOGLE_SA_JSON (raw or base64)                                  (service account; folder must be in a Shared Drive)
// DRIVE_ROOT_ID = the Drive folder that holds all platform data.
// Vercel Blob: BLOB_STORE_ID (+ Vercel's built-in OIDC token) or BLOB_READ_WRITE_TOKEN, set automatically when a private Blob store is connected to the project.
// Local: STORAGE=local (default when nothing else is configured), STORAGE_DIR (default ./.data)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { httpError } = require('./http');
const { sign, verify } = require('./auth');

const useDrive = () => process.env.STORAGE !== 'local' && !!process.env.DRIVE_ROOT_ID &&
  !!(process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_SA_JSON);

function cleanKey(key) {
  const parts = String(key).split('/').filter(Boolean);
  if (!parts.length || parts.some((p) => p === '.' || p === '..' || /[\\:*?"<>|\x00-\x1f]/.test(p))) throw httpError(400, 'Bad storage key');
  return parts;
}

// =================== local ===================
const LOCAL_DIR = () => path.resolve(process.env.STORAGE_DIR || path.join(__dirname, '..', '..', '.data'));
const local = {
  file: (key) => path.join(LOCAL_DIR(), ...cleanKey(key)),
  async readJSON(key) { try { return JSON.parse(await fs.promises.readFile(this.file(key), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
  async writeJSON(key, obj) {
    const f = this.file(key); await fs.promises.mkdir(path.dirname(f), { recursive: true });
    const tmp = f + '.' + crypto.randomBytes(4).toString('hex'); await fs.promises.writeFile(tmp, JSON.stringify(obj, null, 2)); await fs.promises.rename(tmp, f);
  },
  async writeFile(key, buf, mime) {
    const f = this.file(key); await fs.promises.mkdir(path.dirname(f), { recursive: true });
    await fs.promises.writeFile(f, buf); await fs.promises.writeFile(f + '.mime', mime || 'application/octet-stream');
    return cleanKey(key).join('/');
  },
  async readFile(ref) {
    const f = this.file(ref);
    let mime = 'application/octet-stream'; try { mime = await fs.promises.readFile(f + '.mime', 'utf8'); } catch (_) { /* default */ }
    try { return { buf: await fs.promises.readFile(f), mime }; } catch (e) { if (e.code === 'ENOENT') throw httpError(404, 'File not found'); throw e; }
  },
  async beginUpload(key, mime, size) { return { key: cleanKey(key).join('/'), mime, size }; },
  async uploadChunk(sess, buf, start) {
    const f = this.file(sess.key); await fs.promises.mkdir(path.dirname(f), { recursive: true });
    const part = f + '.part';
    const have = fs.existsSync(part) ? (await fs.promises.stat(part)).size : 0;
    if (start !== have) throw httpError(409, `Expected chunk at byte ${have}`);
    await fs.promises.appendFile(part, buf);
    if (have + buf.length >= sess.size) {
      await fs.promises.rename(part, f); await fs.promises.writeFile(f + '.mime', sess.mime || 'application/octet-stream');
      return { done: true, ref: sess.key };
    }
    return { done: false };
  },
};

// =================== Google Drive ===================
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
let tokenCache = { v: null, exp: 0 };
const folderCache = new Map();

async function accessToken() {
  if (tokenCache.v && Date.now() < tokenCache.exp - 60_000) return tokenCache.v;
  let body;
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    body = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' });
  } else {
    let sa = process.env.GOOGLE_SA_JSON; try { sa = JSON.parse(sa); } catch (_) { sa = JSON.parse(Buffer.from(sa, 'base64').toString('utf8')); }
    const now = Math.floor(Date.now() / 1000);
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
    const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
    body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` });
  }
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const j = await r.json();
  if (!r.ok) throw httpError(502, `Drive auth failed: ${j.error || r.status}`);
  tokenCache = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.v;
}
async function gd(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${await accessToken()}`, ...(opts.headers || {}) } });
  if (!r.ok && r.status !== 308) {
    const t = await r.text();
    throw httpError(r.status === 404 ? 404 : 502, `Drive error ${r.status}: ${t.slice(0, 200)}`);
  }
  return r;
}
const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const common = 'supportsAllDrives=true&includeItemsFromAllDrives=true';
async function findChild(parent, name, folder) {
  const query = `'${parent}' in parents and name='${q(name)}' and trashed=false` + (folder ? " and mimeType='application/vnd.google-apps.folder'" : '');
  const r = await gd(`${DRIVE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)&pageSize=2&${common}`);
  return (await r.json()).files[0] || null;
}
async function folderFor(parts, create) {
  let parent = process.env.DRIVE_ROOT_ID; let acc = '';
  for (const name of parts) {
    acc += '/' + name;
    if (folderCache.has(acc)) { parent = folderCache.get(acc); continue; }
    let f = await findChild(parent, name, true);
    if (!f) {
      if (!create) return null;
      const r = await gd(`${DRIVE}/files?${common}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }) });
      f = await r.json();
    }
    folderCache.set(acc, f.id); parent = f.id;
  }
  return parent;
}
function multipart(meta, buf, mime) {
  const b = 'bpr' + crypto.randomBytes(8).toString('hex');
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`),
    buf, Buffer.from(`\r\n--${b}--`)]);
  return { body, type: `multipart/related; boundary=${b}` };
}
const drive = {
  async locate(key) {
    const parts = cleanKey(key); const dir = await folderFor(parts.slice(0, -1), false);
    return dir ? { dir, file: await findChild(dir, parts[parts.length - 1], false) } : { dir: null, file: null };
  },
  async readJSON(key) {
    const { file } = await this.locate(key); if (!file) return null;
    const r = await gd(`${DRIVE}/files/${file.id}?alt=media&${common}`); return r.json();
  },
  async writeJSON(key, obj) { await this.writeFile(key, Buffer.from(JSON.stringify(obj, null, 2)), 'application/json'); },
  async writeFile(key, buf, mime = 'application/octet-stream') {
    const parts = cleanKey(key); const dir = await folderFor(parts.slice(0, -1), true);
    const existing = await findChild(dir, parts[parts.length - 1], false);
    if (existing) {
      await gd(`${UPLOAD}/files/${existing.id}?uploadType=media&${common}`, { method: 'PATCH', headers: { 'Content-Type': mime }, body: buf });
      return existing.id;
    }
    const mp = multipart({ name: parts[parts.length - 1], parents: [dir] }, buf, mime);
    const r = await gd(`${UPLOAD}/files?uploadType=multipart&fields=id&${common}`, { method: 'POST', headers: { 'Content-Type': mp.type }, body: mp.body });
    return (await r.json()).id;
  },
  async readFile(ref) {
    const meta = await (await gd(`${DRIVE}/files/${encodeURIComponent(ref)}?fields=mimeType&${common}`)).json();
    const r = await gd(`${DRIVE}/files/${encodeURIComponent(ref)}?alt=media&${common}`);
    return { buf: Buffer.from(await r.arrayBuffer()), mime: meta.mimeType };
  },
  async beginUpload(key, mime, size) {
    const parts = cleanKey(key); const dir = await folderFor(parts.slice(0, -1), true);
    const r = await gd(`${UPLOAD}/files?uploadType=resumable&fields=id&${common}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(size) },
      body: JSON.stringify({ name: parts[parts.length - 1], parents: [dir] }) });
    return { url: r.headers.get('location'), mime, size, key: parts.join('/') };
  },
  async uploadChunk(sess, buf, start) {
    const end = start + buf.length - 1;
    const r = await gd(sess.url, { method: 'PUT', headers: { 'Content-Range': `bytes ${start}-${end}/${sess.size}` }, body: buf });
    if (r.status === 308) return { done: false };
    return { done: true, ref: (await r.json()).id };
  },
};

// =================== Vercel Blob (private store) ===================
// Chosen automatically when BLOB_READ_WRITE_TOKEN is set (Vercel adds it when a Blob store is connected).
// Large uploads arrive in 4 MiB chunks (Vercel's request limit); each chunk is stored as its own part and
// parts are streamed back in order on download, so nothing ever has to be re-assembled server-side.
const useBlob = () => process.env.STORAGE !== 'local' && !useDrive() && !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const CHUNK = 4 * 1024 * 1024;
const blobOpts = (contentType) => ({ access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType });
async function blobGet(pathname) {
  const { get } = require('@vercel/blob');
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return r;
}
async function webToBuffer(stream) { return Buffer.from(await new Response(stream).arrayBuffer()); }
const blob = {
  async readJSON(key) { const r = await blobGet(cleanKey(key).join('/')); return r ? JSON.parse((await webToBuffer(r.stream)).toString('utf8')) : null; },
  async writeJSON(key, obj) { const { put } = require('@vercel/blob'); await put(cleanKey(key).join('/'), JSON.stringify(obj, null, 2), blobOpts('application/json')); },
  async writeFile(key, buf, mime) {
    const { put } = require('@vercel/blob'); const k = cleanKey(key).join('/');
    await put(k, buf, blobOpts(mime || 'application/octet-stream'));
    return k;
  },
  async parts(ref) {
    if (!ref.startsWith('parts:')) return null;
    const meta = await this.readJSON(`${ref.slice(6)}.meta.json`);
    if (!meta) throw httpError(404, 'File not found');
    return meta;
  },
  async readFile(ref) {
    const meta = await this.parts(ref);
    if (meta) {
      const bufs = [];
      for (let i = 0; i < meta.parts; i++) { const r = await blobGet(`${meta.key}.part${i}`); if (!r) throw httpError(404, 'File part missing'); bufs.push(await webToBuffer(r.stream)); }
      return { buf: Buffer.concat(bufs), mime: meta.mime };
    }
    const r = await blobGet(ref); if (!r) throw httpError(404, 'File not found');
    return { buf: await webToBuffer(r.stream), mime: r.blob?.contentType || 'application/octet-stream' };
  },
  async openStream(ref) {
    const { Readable } = require('stream');
    const meta = await this.parts(ref);
    if (!meta) {
      const r = await blobGet(ref); if (!r) throw httpError(404, 'File not found');
      return { stream: Readable.fromWeb(r.stream), mime: r.blob?.contentType, size: r.blob?.size || undefined };
    }
    async function* all() {
      for (let i = 0; i < meta.parts; i++) {
        const r = await blobGet(`${meta.key}.part${i}`); if (!r) throw new Error('File part missing');
        for await (const c of Readable.fromWeb(r.stream)) yield c;
      }
    }
    return { stream: Readable.from(all()), mime: meta.mime, size: meta.size };
  },
  async beginUpload(key, mime, size) { return { key: cleanKey(key).join('/'), mime, size }; },
  async uploadChunk(sess, buf, start) {
    if (start % CHUNK !== 0) throw httpError(409, 'Chunks must be sent in order');
    const { put } = require('@vercel/blob');
    const n = start / CHUNK;
    await put(`${sess.key}.part${n}`, buf, blobOpts('application/octet-stream'));
    if (start + buf.length < sess.size) return { done: false };
    await this.writeJSON(`${sess.key}.meta.json`, { key: sess.key, parts: n + 1, size: sess.size, mime: sess.mime });
    return { done: true, ref: `parts:${sess.key}` };
  },
};

// local + drive streaming (blob has its own)
local.openStream = async function (ref) {
  const f = local.file(ref);
  const st = await fs.promises.stat(f).catch(() => { throw httpError(404, 'File not found'); });
  let mime = 'application/octet-stream'; try { mime = await fs.promises.readFile(f + '.mime', 'utf8'); } catch (_) { /* default */ }
  return { stream: fs.createReadStream(f), mime, size: st.size };
};
drive.openStream = async function (ref) {
  const { Readable } = require('stream');
  const meta = await (await gd(`${DRIVE}/files/${encodeURIComponent(ref)}?fields=mimeType,size&${common}`)).json();
  const r = await gd(`${DRIVE}/files/${encodeURIComponent(ref)}?alt=media&${common}`);
  return { stream: Readable.fromWeb(r.body), mime: meta.mimeType, size: Number(meta.size) || undefined };
};

const impl = () => (useDrive() ? drive : useBlob() ? blob : local);

module.exports = {
  mode: () => (useDrive() ? 'drive' : useBlob() ? 'blob' : 'local'),
  readJSON: (k) => impl().readJSON(k),
  writeJSON: (k, o) => impl().writeJSON(k, o),
  writeFile: (k, b, m) => impl().writeFile(k, b, m),
  readFile: (ref) => impl().readFile(ref),
  // Stream a file to an HTTP response (no size limit from buffering). Returns { stream (node Readable), mime, size }.
  openStream: (ref) => impl().openStream(ref),
  // Upload sessions are signed so the browser can carry them between chunk requests without tampering.
  async beginUpload(key, mime, size, meta) {
    const s = await impl().beginUpload(key, mime, size);
    return sign({ t: 'upload', s, meta, exp: Date.now() + 6 * 3600 * 1000 });
  },
  async uploadChunk(sessionToken, buf, start) {
    const p = verify(sessionToken);
    if (!p || p.t !== 'upload') throw httpError(400, 'Upload session expired, start again');
    const r = await impl().uploadChunk(p.s, buf, start);
    return { ...r, meta: p.meta, size: p.s.size, mime: p.s.mime };
  },
};
