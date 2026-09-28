// Renders a PDF into stacked page canvases with an overlay layer per page (for signature boxes).
// Coordinates exposed to callers are PDF points with a TOP-left origin (what the server expects).
(() => {
  'use strict';
  const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  let loading;
  const loadLib = () => loading || (loading = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = LIB; s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; res(window.pdfjsLib); }; s.onerror = rej;
    document.head.appendChild(s);
  }));

  // data: ArrayBuffer. Returns [{index, el, overlay, scale, width, height}] (width/height in PDF points).
  async function render(data, container, { maxWidth } = {}) {
    const pdfjs = await loadLib();
    const doc = await pdfjs.getDocument({ data }).promise;
    container.innerHTML = '';
    const pages = [];
    const avail = Math.min(maxWidth || 900, container.clientWidth || 900);
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = avail / base.width;
      const vp = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
      const wrap = document.createElement('div'); wrap.className = 'pdf-page'; wrap.style.width = `${base.width * scale}px`; wrap.style.height = `${base.height * scale}px`;
      const canvas = document.createElement('canvas'); canvas.width = vp.width; canvas.height = vp.height;
      canvas.style.width = '100%'; canvas.style.height = '100%';
      const overlay = document.createElement('div'); overlay.className = 'pdf-overlay';
      const label = document.createElement('span'); label.className = 'pdf-pageno'; label.textContent = `Page ${i} of ${doc.numPages}`;
      wrap.append(canvas, overlay, label); container.appendChild(wrap);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      pages.push({ index: i - 1, el: wrap, overlay, scale, width: base.width, height: base.height });
    }
    return pages;
  }

  // Place a box (PDF points, top-left origin) on a rendered page's overlay.
  function box(pageInfo, f, { cls = '', label = '', onRemove, draggable } = {}) {
    const b = document.createElement('div');
    b.className = `pdf-field pdf-field--${f.type} ${cls}`;
    const s = pageInfo.scale;
    Object.assign(b.style, { left: `${f.x * s}px`, top: `${f.y * s}px`, width: `${f.w * s}px`, height: `${f.h * s}px` });
    b.innerHTML = `<span>${label || f.type}</span>`;
    if (onRemove) {
      const x = document.createElement('button'); x.type = 'button'; x.className = 'pdf-field__x'; x.setAttribute('aria-label', 'Remove field'); x.textContent = '×';
      x.addEventListener('click', (e) => { e.stopPropagation(); b.remove(); onRemove(); });
      b.appendChild(x);
    }
    if (draggable) {
      b.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.pdf-field__x')) return;
        e.preventDefault(); b.setPointerCapture(e.pointerId);
        const sx = e.clientX; const sy = e.clientY; const ox = f.x; const oy = f.y;
        const move = (ev) => {
          f.x = Math.max(0, Math.min(pageInfo.width - f.w, ox + (ev.clientX - sx) / s));
          f.y = Math.max(0, Math.min(pageInfo.height - f.h, oy + (ev.clientY - sy) / s));
          b.style.left = `${f.x * s}px`; b.style.top = `${f.y * s}px`;
        };
        const up = () => { b.removeEventListener('pointermove', move); b.removeEventListener('pointerup', up); };
        b.addEventListener('pointermove', move); b.addEventListener('pointerup', up);
      });
    }
    pageInfo.overlay.appendChild(b);
    return b;
  }

  window.PDFView = { render, box };
})();
