// Signing page (/sign#t=&p=&s=): view the PDF with field highlights, draw or type a signature, consent, sign.
(() => {
  'use strict';
  const { $, $$, api, hashParams, setClientToken, toast } = window.BPR;
  const { t, p, s } = hashParams();
  if (!t || !p || !s) { $('#sign-error').hidden = false; return; }
  setClientToken(t);
  const base = `/api/sign?id=${encodeURIComponent(p)}&s=${encodeURIComponent(s)}`;
  const pdfUrl = `${base}&action=pdf&t=${encodeURIComponent(t)}`;
  let R = null; let mode = 'draw'; let drawn = false;

  const pad = $('#sn-pad'); const ctx = pad.getContext('2d');
  function resetPad() { ctx.clearRect(0, 0, pad.width, pad.height); ctx.strokeStyle = '#0b1f5c'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; drawn = false; if (mode === 'type') typeSig(); }
  function typeSig() {
    ctx.clearRect(0, 0, pad.width, pad.height);
    const name = $('#sn-name').value.trim();
    if (!name) return;
    ctx.fillStyle = '#0b1f5c'; ctx.textBaseline = 'middle';
    let size = 72; ctx.font = `italic ${size}px "Brush Script MT", "Segoe Script", cursive`;
    while (ctx.measureText(name).width > pad.width - 40 && size > 24) { size -= 4; ctx.font = `italic ${size}px "Brush Script MT", "Segoe Script", cursive`; }
    ctx.fillText(name, 20, pad.height / 2); drawn = true;
  }
  let last = null;
  const pos = (e) => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * (pad.width / r.width), (e.clientY - r.top) * (pad.height / r.height)]; };
  pad.addEventListener('pointerdown', (e) => { if (mode !== 'draw') return; pad.setPointerCapture(e.pointerId); last = pos(e); });
  pad.addEventListener('pointermove', (e) => { if (!last) return; const pt = pos(e); ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...pt); ctx.stroke(); last = pt; drawn = true; });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => pad.addEventListener(ev, () => { last = null; }));
  $('#sn-clear').addEventListener('click', resetPad);
  $$('.sig-tabs [data-mode]').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode; $$('.sig-tabs [data-mode]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    pad.classList.toggle('is-typed', mode === 'type'); resetPad();
  }));
  $('#sn-name').addEventListener('input', () => { if (mode === 'type') typeSig(); });

  // Trim transparent edges so the stamped signature fills its box.
  function sigPng() {
    const { width: w, height: h } = pad; const d = ctx.getImageData(0, 0, w, h).data;
    let x0 = w; let y0 = h; let x1 = 0; let y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 10) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (x1 <= x0) return null;
    const c = document.createElement('canvas'); c.width = x1 - x0 + 8; c.height = y1 - y0 + 8;
    c.getContext('2d').drawImage(pad, x0 - 4, y0 - 4, c.width, c.height, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  async function load() {
    try { R = await api(`${base}&action=get`); } catch (_) { $('#sign-error').hidden = false; return; }
    $('#sign-view').hidden = false;
    document.title = `Sign: ${R.title}`;
    $('#sn-title').textContent = R.title;
    $('#sn-sub').textContent = [R.project.address, R.project.city].filter(Boolean).join(' · ') + ` · For ${R.signer.name}`;
    $('#sn-name').value = R.signer.name || ''; $('#sn-email').value = R.signer.email || '';
    $('#sn-consent-text').textContent = R.consent;
    $('#sn-download').href = pdfUrl;
    resetPad();
    const buf = await (await fetch(pdfUrl)).arrayBuffer();
    const pages = await window.PDFView.render(buf, $('#sn-pdf'), { maxWidth: 860 });
    if (R.status === 'signed') {
      $('#sn-form').hidden = true; $('#sn-hint').hidden = true;
      const d = $('#sn-done'); d.hidden = false; d.textContent = `Signed on ${new Date(R.signedAt).toLocaleString()}. You can download the signed copy above.`;
      return;
    }
    if (R.status !== 'sent') { $('#sn-form').hidden = true; const d = $('#sn-done'); d.hidden = false; d.textContent = 'This signature request was cancelled.'; return; }
    const labels = { signature: 'Sign here', initials: 'Initial', name: 'Your name', date: 'Date' };
    R.fields.forEach((f) => { const pg = pages[f.page]; if (pg) window.PDFView.box(pg, f, { label: labels[f.type] }); });
    const first = $('.pdf-field'); if (first) first.scrollIntoView({ block: 'center' });
  }

  $('#sn-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const st = $('.form-status', e.target);
    if (!drawn) { st.textContent = mode === 'draw' ? 'Please draw your signature in the box.' : 'Type your name to create your signature.'; st.dataset.state = 'err'; return; }
    if (!$('#sn-consent').checked) { st.textContent = 'Please check the consent box.'; st.dataset.state = 'err'; return; }
    $('#sn-submit').disabled = true; st.textContent = 'Signing…'; st.dataset.state = '';
    try {
      await api(`${base}&action=submit`, { method: 'POST', body: { name: $('#sn-name').value, email: $('#sn-email').value, signature: sigPng(), consent: true } });
      toast('Signed. Thank you!');
      $('#sn-pdf').innerHTML = ''; $('#sn-form').hidden = true;
      load();
    } catch (err) { st.textContent = err.message; st.dataset.state = 'err'; $('#sn-submit').disabled = false; }
  });
  load();
})();
