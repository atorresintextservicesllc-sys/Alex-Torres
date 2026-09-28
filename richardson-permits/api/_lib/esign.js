// Electronic signatures with pdf-lib.
// Evidence kept for every signature (ESIGN Act, 15 U.S.C. §7001; Florida UETA, Fla. Stat. §668.50):
//   consent text shown + accepted, signer name/email, IP, user agent, timestamps (sent/viewed/signed),
//   SHA-256 of the original and of the signed PDF, and an audit certificate appended to the document.
// NOT for documents that must be notarized (e.g. Notice of Commencement): those need RON or an in-person notary.
'use strict';
const crypto = require('crypto');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { safe } = require('./proposal'); // WinAnsi-safe text for standard fonts

const CONSENT = 'I agree to use electronic records and signatures. By clicking "Sign", I adopt the signature shown as my ' +
  'legal signature on this document, with the same effect as a handwritten signature (15 U.S.C. §7001; Fla. Stat. §668.50). ' +
  'I can request a paper copy at any time.';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function pageSizes(pdfBuf) {
  const doc = await PDFDocument.load(pdfBuf, { ignoreEncryption: true });
  return doc.getPages().map((p) => ({ w: p.getWidth(), h: p.getHeight() }));
}

// fields: [{page (0-based), x, y, w, h, type}] in PDF points, origin TOP-left (as placed in the browser).
async function stamp(pdfBuf, { fields, signaturePng, initialsPng, name: rawName, signedAt, ref, business }) {
  const name = safe(rawName);
  const doc = await PDFDocument.load(pdfBuf, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const sig = signaturePng ? await doc.embedPng(signaturePng) : null;
  const ini = initialsPng ? await doc.embedPng(initialsPng) : null;
  const pages = doc.getPages();
  const dateStr = new Date(signedAt).toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  const touched = new Set();
  for (const f of fields) {
    const page = pages[f.page]; if (!page) continue;
    touched.add(f.page);
    const H = page.getHeight();
    const x = f.x; const y = H - f.y - f.h; // to bottom-left origin
    if ((f.type === 'signature' && sig) || (f.type === 'initials' && (ini || sig))) {
      const img = f.type === 'initials' ? (ini || sig) : sig;
      const scale = Math.min(f.w / img.width, f.h / img.height);
      const w = img.width * scale; const h = img.height * scale;
      page.drawImage(img, { x: x + (f.w - w) / 2, y: y + (f.h - h) / 2, width: w, height: h });
    } else {
      const text = f.type === 'date' ? dateStr : name;
      const size = Math.max(7, Math.min(12, f.h * 0.6));
      page.drawText(text, { x: x + 2, y: y + (f.h - size) / 2 + 1, size, font, color: rgb(0.05, 0.05, 0.2) });
    }
  }
  for (const i of touched) {
    const p = pages[i];
    p.drawText(`Signed electronically by ${name} on ${dateStr} via ${business} · Ref ${ref}`, { x: 24, y: 10, size: 6.5, font, color: rgb(0.35, 0.35, 0.4) });
  }
  return doc;
}

const when = (iso) => (iso ? `${new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'medium' })} ET  (${iso.replace(/\.\d+Z$/, 'Z')})` : '—');

async function certificate(doc, a) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  let y = 740;
  const line = (label, value, opts = {}) => {
    page.drawText(label, { x: 50, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.35) });
    const words = safe(value || '-').split(' '); let row = ''; let yy = y;
    for (const w of words) {
      const test = row ? `${row} ${w}` : w;
      if (font.widthOfTextAtSize(test, opts.size || 9.5) > 380) { page.drawText(row, { x: 180, y: yy, size: opts.size || 9.5, font }); row = w; yy -= 13; } else row = test;
    }
    page.drawText(row, { x: 180, y: yy, size: opts.size || 9.5, font });
    y = yy - 20;
  };
  page.drawRectangle({ x: 0, y: 772, width: 612, height: 20, color: rgb(0.745, 0.094, 0.365) });
  page.drawText('CERTIFICATE OF ELECTRONIC SIGNATURE', { x: 50, y: 700, size: 16, font: bold });
  y = 670;
  line('Document', a.title);
  line('Reference', a.ref);
  line('Prepared by', a.business);
  line('Signer', `${a.name}${a.email ? ` <${a.email}>` : ''}`);
  line('Sent', when(a.sentAt));
  line('First viewed', when(a.viewedAt));
  line('Signed', when(a.signedAt));
  line('Signer IP address', a.ip);
  line('Signer device', a.ua, { size: 8 });
  line('Original SHA-256', a.originalSha, { size: 8 });
  line('Consent accepted', CONSENT, { size: 8.5 });
  line('Signature fields', `${a.fieldCount} field(s) on page(s) ${a.pages}`);
  page.drawText('The SHA-256 fingerprint of this signed file is recorded in the audit log kept with the project.', { x: 50, y: 80, size: 8, font, color: rgb(0.4, 0.4, 0.45) });
  page.drawText('Electronic signature under 15 U.S.C. §7001 (ESIGN) and Fla. Stat. §668.50 (UETA). Not a notarization.', { x: 50, y: 66, size: 8, font, color: rgb(0.4, 0.4, 0.45) });
  return doc;
}

async function signPdf(original, opts) {
  const doc = await stamp(original, opts);
  await certificate(doc, opts.audit);
  const out = Buffer.from(await doc.save());
  return { buf: out, sha: sha256(out) };
}

// Decode a data:image/png;base64 URL into bytes (size-limited).
function pngFromDataUrl(s) {
  if (!s) return null;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(s);
  if (!m) throw Object.assign(new Error('Signature must be a PNG image'), { status: 400 });
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 400_000) throw Object.assign(new Error('Signature image too large'), { status: 400 });
  return buf;
}

module.exports = { CONSENT, sha256, pageSizes, signPdf, pngFromDataUrl };
