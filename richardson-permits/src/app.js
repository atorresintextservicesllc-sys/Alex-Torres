// Shared browser helpers for the platform pages (admin, portal, sign). Exposes window.BPR.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hashParams = () => Object.fromEntries(new URLSearchParams(location.hash.replace(/^#/, '')));
  const qs = () => Object.fromEntries(new URLSearchParams(location.search));

  let clientAuth = null; // "Client <token>" for portal/sign pages
  const setClientToken = (t) => { clientAuth = t ? `Client ${t}` : null; };

  async function api(path, { method = 'GET', body, raw, headers = {} } = {}) {
    const h = { ...headers };
    if (clientAuth) h.Authorization = clientAuth;
    if (body !== undefined && !raw) h['Content-Type'] = 'application/json';
    const r = await fetch(path, { method, headers: h, body: raw || (body !== undefined ? JSON.stringify(body) : undefined), credentials: 'same-origin' });
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : await r.text();
    if (!r.ok) throw Object.assign(new Error((data && data.error) || `Request failed (${r.status})`), { status: r.status });
    return data;
  }

  // Chunked upload with progress: onProgress(0..1)
  async function upload(file, { projectId, kind = 'document', requestId, internal, onProgress } = {}) {
    const begin = await api(`/api/files?action=begin&id=${encodeURIComponent(projectId)}`, { method: 'POST',
      body: { name: file.name, size: file.size, mime: file.type || 'application/octet-stream', kind, requestId, internal } });
    let res;
    for (let start = 0; start < file.size; start += begin.chunkSize) {
      const chunk = file.slice(start, start + begin.chunkSize);
      for (let attempt = 1; ; attempt++) {
        try {
          res = await api(`/api/files?action=chunk&upload=${encodeURIComponent(begin.upload)}`, { method: 'PUT', raw: chunk, headers: { 'X-Start': String(start), 'Content-Type': 'application/octet-stream' } });
          break;
        } catch (e) { if (attempt >= 3 || e.status === 400) throw e; await new Promise((r) => setTimeout(r, 800 * attempt)); }
      }
      if (onProgress) onProgress(Math.min(1, (start + chunk.size) / file.size));
    }
    return res.file;
  }

  const fileUrl = (projectId, fileId, dl, token) => `/api/files?action=get&id=${encodeURIComponent(projectId)}&f=${encodeURIComponent(fileId)}${dl ? '&dl=1' : ''}${token ? `&t=${encodeURIComponent(token)}` : ''}`;
  const fmtSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
  const toast = (msg, bad) => {
    let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.className = bad ? 'toast toast--bad' : 'toast'; t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 3500);
  };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch (_) { prompt('Copy this:', text); } };

  // Wire a drop zone + file input. onFiles(FileList)
  function dropzone(el, onFiles) {
    const input = $('input[type=file]', el);
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('is-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('is-over'));
    el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('is-over'); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); });
    input.addEventListener('change', () => { if (input.files.length) onFiles(input.files); input.value = ''; });
  }

  // Upload a list of files, showing progress rows inside `list`.
  async function uploadAll(files, opts, list) {
    const out = [];
    for (const file of files) {
      const row = document.createElement('div'); row.className = 'up-row';
      row.innerHTML = `<span>${esc(file.name)}</span><progress max="1" value="0"></progress>`;
      list && list.appendChild(row);
      try {
        out.push(await upload(file, { ...opts, onProgress: (v) => { $('progress', row).value = v; } }));
        row.classList.add('is-done');
      } catch (e) { row.classList.add('is-bad'); row.querySelector('span').textContent = `${file.name}: ${e.message}`; }
    }
    setTimeout(() => list && out.length && [...list.querySelectorAll('.is-done')].forEach((r) => r.remove()), 2500);
    return out;
  }

  window.BPR = { $, $$, esc, api, upload, uploadAll, dropzone, fileUrl, fmtSize, fmtWhen, toast, copy, hashParams, qs, setClientToken };
})();
