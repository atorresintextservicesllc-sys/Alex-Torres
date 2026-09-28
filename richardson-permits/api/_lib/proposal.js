// Branded proposal PDF (pdf-lib). The proposal is the CONTRACTOR's (the client company's letterhead and license);
// Best Permit Runners appears only as "prepared by". Returns the PDF plus signature-field coordinates for e-signing.
'use strict';
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

// pdf-lib's standard fonts are WinAnsi only: map common Unicode punctuation and drop the rest.
const safe = (s) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/…/g, '...').replace(/[^\x20-\x7E -ÿ]/g, '');
const money = (n) => `$${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hex = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return rgb(0.12, 0.12, 0.15); const n = parseInt(m[1], 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };

function totals(pr) {
  const markup = 1 + (Number(pr.markupPct) || 0) / 100;
  const sections = (pr.sections || []).map((s) => {
    const items = (s.items || []).filter((i) => i.description).map((i) => {
      const unitPrice = (Number(i.rate) || 0) * markup;
      return { ...i, unitPrice, amount: (Number(i.qty) || 0) * unitPrice };
    });
    return { ...s, items, total: items.reduce((t, i) => t + i.amount, 0) };
  });
  const subtotal = sections.reduce((t, s) => t + s.total, 0);
  const tax = subtotal * (Number(pr.taxPct) || 0) / 100;
  return { sections, subtotal, tax, total: subtotal + tax };
}

async function build(pr, { preparedBy }) {
  const doc = await PDFDocument.create();
  const F = await doc.embedFont(StandardFonts.Helvetica);
  const B = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = hex(pr.color);
  const W = 612; const H = 792; const M = 48;
  const t = totals(pr);
  const co = pr.company || {};
  let page; let y;
  const pages = [];

  const wrap = (text, font, size, width) => {
    const out = [];
    for (const para of safe(text).split(/\n/)) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) > width && line) { out.push(line); line = word; } else line = test;
      }
      out.push(line);
    }
    return out;
  };
  const text = (s, x, yy, { font = F, size = 10, color = rgb(0.12, 0.12, 0.15), align } = {}) => {
    s = safe(s);
    const w = font.widthOfTextAtSize(s, size);
    page.drawText(s, { x: align === 'right' ? x - w : x, y: yy, size, font, color });
  };
  const newPage = () => {
    page = doc.addPage([W, H]); pages.push(page);
    page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: accent });
    y = H - 40;
  };
  const need = (h) => { if (y - h < 70) { newPage(); y = H - 50; } };

  // ---- letterhead ----
  newPage();
  text(co.name || 'Contractor', M, y - 6, { font: B, size: 18 });
  const coLines = [co.license ? `License ${co.license}` : '', [co.address, co.city && `${co.city}, ${co.state || 'FL'} ${co.zip || ''}`].filter(Boolean).join(', '),
    [co.phone, co.email].filter(Boolean).join('  |  ')].filter(Boolean);
  coLines.forEach((l, i) => text(l, M, y - 24 - i * 13, { size: 9.5, color: rgb(0.35, 0.35, 0.4) }));
  text('PROPOSAL', W - M, y - 6, { font: B, size: 18, color: accent, align: 'right' });
  text(`No. ${pr.number || ''}`, W - M, y - 24, { size: 9.5, align: 'right' });
  text(`Date: ${pr.date || ''}`, W - M, y - 37, { size: 9.5, align: 'right' });
  if (pr.validDays) text(`Valid for ${pr.validDays} days`, W - M, y - 50, { size: 9.5, align: 'right' });
  y -= 80;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: rgb(0.85, 0.85, 0.88) });
  y -= 22;
  text('PREPARED FOR', M, y, { font: B, size: 8.5, color: rgb(0.45, 0.45, 0.5) });
  text('PROJECT', 320, y, { font: B, size: 8.5, color: rgb(0.45, 0.45, 0.5) });
  y -= 14;
  const pf = [pr.preparedFor?.name, pr.preparedFor?.address, pr.preparedFor?.email, pr.preparedFor?.phone].filter(Boolean);
  const pj = wrap(pr.title || 'Project', B, 11, W - M - 320).concat(wrap(pr.projectAddress || '', F, 10, W - M - 320));
  const rows = Math.max(pf.length, pj.length);
  for (let i = 0; i < rows; i++) {
    if (pf[i]) text(pf[i], M, y - i * 14, { size: 10 });
    if (pj[i]) text(pj[i], 320, y - i * 14, { size: i === 0 ? 11 : 10, font: i === 0 ? B : F });
  }
  y -= rows * 14 + 14;

  if (pr.summary) {
    for (const l of wrap(pr.summary, F, 10, W - 2 * M)) { need(14); text(l, M, y, { size: 10 }); y -= 14; }
    y -= 10;
  }

  // ---- line items ----
  const unit = pr.showUnitPrices !== false;
  const cols = unit ? [M, 330, 380, 440, W - M] : [M, W - M];
  const header = () => {
    need(24);
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: rgb(0.15, 0.15, 0.18) });
    const hc = rgb(1, 1, 1);
    text('DESCRIPTION', M + 6, y, { font: B, size: 8.5, color: hc });
    if (unit) { text('QTY', cols[2] - 6, y, { font: B, size: 8.5, color: hc, align: 'right' }); text('UNIT', cols[2] + 6, y, { font: B, size: 8.5, color: hc }); text('UNIT PRICE', cols[3] + 50, y, { font: B, size: 8.5, color: hc, align: 'right' }); }
    text('AMOUNT', W - M - 6, y, { font: B, size: 8.5, color: hc, align: 'right' });
    y -= 22;
  };
  header();
  for (const s of t.sections) {
    need(40);
    text(s.name || 'Scope', M + 2, y, { font: B, size: 10.5, color: accent });
    if (!unit) text(money(s.total), W - M - 6, y, { font: B, size: 10, align: 'right' });
    y -= 16;
    for (const i of s.items) {
      const lines = wrap(i.description, F, 9.5, (unit ? cols[1] - 10 : W - 2 * M - 110) - M);
      need(lines.length * 12 + 8);
      lines.forEach((l, k) => text(l, M + 10, y - k * 12, { size: 9.5 }));
      if (unit) {
        text(String(+Number(i.qty || 0).toFixed(2)), cols[2] - 6, y, { size: 9.5, align: 'right' });
        text(i.unit || '', cols[2] + 6, y, { size: 9.5 });
        text(money(i.unitPrice), cols[3] + 50, y, { size: 9.5, align: 'right' });
        text(money(i.amount), W - M - 6, y, { size: 9.5, align: 'right' });
      }
      y -= lines.length * 12;
      page.drawLine({ start: { x: M, y: y + 5 }, end: { x: W - M, y: y + 5 }, thickness: 0.4, color: rgb(0.9, 0.9, 0.92) });
      y -= 10;
    }
    if (unit) { text(`${safe(s.name || 'Section')} total`, cols[3] + 50, y, { size: 9, color: rgb(0.4, 0.4, 0.45), align: 'right' }); text(money(s.total), W - M - 6, y, { font: B, size: 9.5, align: 'right' }); y -= 18; }
  }
  // totals
  need(70);
  y -= 4;
  const trow = (label, val, bold) => { text(label, W - M - 150, y, { font: bold ? B : F, size: bold ? 12 : 10, align: 'right' }); text(val, W - M - 6, y, { font: bold ? B : F, size: bold ? 12 : 10, align: 'right' }); y -= bold ? 20 : 15; };
  trow('Subtotal', money(t.subtotal));
  if (t.tax) trow(`Tax (${pr.taxPct}%)`, money(t.tax));
  y -= 8;
  page.drawRectangle({ x: W - M - 250, y: y - 6, width: 250, height: 24, color: accent });
  text('TOTAL', W - M - 150, y + 1, { font: B, size: 12, color: rgb(1, 1, 1), align: 'right' });
  text(money(t.total), W - M - 6, y + 1, { font: B, size: 12, color: rgb(1, 1, 1), align: 'right' });
  y -= 36;

  // ---- notes ----
  const block = (title, body) => {
    if (!body || (Array.isArray(body) && !body.length)) return;
    need(34);
    text(title, M, y, { font: B, size: 10.5 }); y -= 15;
    const items = Array.isArray(body) ? body.map((b) => `- ${b}`) : [body];
    for (const it of items) for (const l of wrap(it, F, 9.2, W - 2 * M)) { need(13); text(l, M, y, { size: 9.2, color: rgb(0.25, 0.25, 0.3) }); y -= 12.5; }
    y -= 10;
  };
  block('Assumptions', pr.assumptions);
  block('Exclusions', pr.exclusions);
  block('Terms', pr.terms);

  // ---- acceptance (signature fields) ----
  need(150);
  text('ACCEPTANCE', M, y, { font: B, size: 10.5 }); y -= 15;
  for (const l of wrap(`By signing below, the owner accepts this proposal, the scope and price above (${money(t.total)}), and the terms stated.`, F, 9.5, W - 2 * M)) { text(l, M, y, { size: 9.5 }); y -= 13; }
  y -= 46;
  const sigY = y; const pageIndex = pages.length - 1;
  page.drawLine({ start: { x: M, y: sigY }, end: { x: M + 240, y: sigY }, thickness: 0.8 });
  page.drawLine({ start: { x: M + 270, y: sigY }, end: { x: M + 420, y: sigY }, thickness: 0.8 });
  text('Owner signature', M, sigY - 12, { size: 8.5, color: rgb(0.45, 0.45, 0.5) });
  text('Date', M + 270, sigY - 12, { size: 8.5, color: rgb(0.45, 0.45, 0.5) });
  page.drawLine({ start: { x: M, y: sigY - 44 }, end: { x: M + 240, y: sigY - 44 }, thickness: 0.8 });
  text('Printed name', M, sigY - 56, { size: 8.5, color: rgb(0.45, 0.45, 0.5) });
  // fields use a TOP-left origin
  const fields = [
    { page: pageIndex, type: 'signature', x: M, y: H - sigY - 40, w: 240, h: 38 },
    { page: pageIndex, type: 'date', x: M + 272, y: H - sigY - 20, w: 140, h: 18 },
    { page: pageIndex, type: 'name', x: M + 2, y: H - (sigY - 44) - 20, w: 236, h: 18 },
  ];

  // footer
  pages.forEach((pg, i) => {
    page = pg;
    text(`Proposal ${pr.number || ''}  |  ${co.name || ''}${preparedBy ? `  |  Prepared by ${preparedBy}` : ''}`, M, 28, { size: 7.5, color: rgb(0.5, 0.5, 0.55) });
    text(`Page ${i + 1} of ${pages.length}`, W - M, 28, { size: 7.5, color: rgb(0.5, 0.5, 0.55), align: 'right' });
  });
  return { buf: Buffer.from(await doc.save()), fields, totals: t };
}

module.exports = { build, totals, safe };
