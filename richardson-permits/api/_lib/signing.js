// Create a signature request on a project (used by /api/sign prepare and by proposals).
'use strict';
const store = require('./store');
const P = require('./projects');
const E = require('./esign');
const auth = require('./auth');
const { httpError } = require('./http');

const FIELD_TYPES = ['signature', 'initials', 'name', 'date'];

async function createRequest(p, { fileId, title, signerName, signerEmail, fields, by }) {
  const file = p.files.find((f) => f.id === fileId && !f.removed);
  if (!file) throw httpError(404, 'Pick a PDF from this project');
  const { buf } = await store.readFile(file.ref);
  if (buf.slice(0, 5).toString() !== '%PDF-') throw httpError(400, 'Only PDF files can be sent for signature');
  const sizes = await E.pageSizes(buf);
  const clean = (fields || []).filter((f) => FIELD_TYPES.includes(f.type) && sizes[f.page])
    .map((f) => ({ page: f.page | 0, type: f.type, x: +f.x, y: +f.y, w: Math.max(20, +f.w), h: Math.max(10, +f.h) }));
  if (!clean.some((f) => f.type === 'signature')) throw httpError(400, 'Place at least one signature field');
  if (!signerName) throw httpError(400, 'Who is signing?');
  const r = {
    id: P.id('S'), title: String(title || file.name).slice(0, 200), fileId: file.id, originalSha: E.sha256(buf), pages: sizes.length,
    fields: clean, signer: { name: String(signerName).slice(0, 120), email: String(signerEmail || '').slice(0, 200) },
    status: 'sent', sentAt: P.now(), sentBy: by, events: [{ type: 'sent', at: P.now(), by }],
  };
  p.signing.push(r);
  P.timeline(p, `Sent for signature: ${r.title} → ${r.signer.name}`, by);
  return r;
}

const signUrl = (origin, p, r) => `${origin}/sign#t=${auth.clientToken(p, { s: r.id })}&p=${p.id}&s=${r.id}`;

module.exports = { createRequest, signUrl, FIELD_TYPES };
