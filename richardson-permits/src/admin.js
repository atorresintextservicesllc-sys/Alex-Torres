// Staff pages: /admin (login + project list) and /admin-project?id= (workspace).
(() => {
  'use strict';
  const { $, $$, esc, api, uploadAll, dropzone, fileUrl, fmtSize, fmtWhen, toast, copy, qs } = window.BPR;
  let STATUSES = [];
  const statusLabel = (k) => (STATUSES.find((s) => s[0] === k) || [k, k])[1];
  const pill = (k) => `<span class="pill pill--${esc(k)}">${esc(statusLabel(k))}</span>`;

  async function me() { try { return await api('/api/admin?action=me'); } catch (_) { return { admin: false }; } }

  // ================= dashboard =================
  async function dashboard() {
    const who = await me();
    if (!who.admin) {
      $('#login-view').hidden = false;
      $('#login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target; const st = $('.form-status', f);
        st.textContent = 'Signing in…';
        try { await api('/api/admin?action=login', { method: 'POST', body: { name: f.name.value, password: f.password.value } });
          const next = new URLSearchParams(location.search).get('next'); // only same-site paths (e.g. /billing)
          if (next && /^\/[a-z0-9-]+$/i.test(next)) location.href = next; else location.reload(); }
        catch (err) { st.textContent = err.message; st.dataset.state = 'err'; }
      });
      return;
    }
    $('#dash-view').hidden = false;
    if (who.storage === 'local') { const n = $('#storage-note'); n.hidden = false; n.textContent = 'Storage: local test mode. Files are saved on this computer, not Google Drive.'; }
    $('#logout').addEventListener('click', async () => { await api('/api/admin?action=logout', { method: 'POST' }); location.reload(); });
    $('#new-btn').addEventListener('click', () => { const f = $('#new-form'); f.hidden = !f.hidden; if (!f.hidden) f.company.focus(); });
    $('#new-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      try {
        const { project } = await api('/api/projects?action=create', { method: 'POST', body: {
          client: { company: f.company.value, name: f.elements.name.value, email: f.email.value, phone: f.phone.value },
          job: { address: f.address.value, city: f.city.value, type: f.type.value, county: f.county.value } } });
        location.href = `/admin-project?id=${project.id}`;
      } catch (err) { toast(err.message, true); }
    });
    const data = await api('/api/projects?action=list');
    STATUSES = data.statuses;
    $('#status-filter').insertAdjacentHTML('beforeend', STATUSES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join(''));
    const render = () => {
      const q = $('#search').value.toLowerCase(); const st = $('#status-filter').value;
      const rows = data.projects.filter((p) => (!st || p.status === st) && (!q || `${p.company} ${p.name} ${p.address} ${p.city}`.toLowerCase().includes(q)));
      $('#projects').innerHTML = rows.map((p) => `<tr data-href="/admin-project?id=${esc(p.id)}" tabindex="0">
<td><strong>${esc(p.company || p.name)}</strong><br><small>${esc(p.name)}</small></td>
<td>${esc(p.address)}<br><small>${esc(p.city)} · ${esc(p.type)}</small></td>
<td>${pill(p.status)}</td>
<td class="num">${p.openRequests ? `${p.openRequests} doc${p.openRequests > 1 ? 's' : ''}` : ''}${p.awaitingSignature ? `<br>${p.awaitingSignature} signature${p.awaitingSignature > 1 ? 's' : ''}` : ''}</td>
<td><small>${fmtWhen(p.updated)}</small></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No projects yet. Click "+ New project".</td></tr>';
    };
    $('#search').addEventListener('input', render); $('#status-filter').addEventListener('change', render);
    $('#projects').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-href]'); if (tr) location.href = tr.dataset.href; });
    $('#projects').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.href) location.href = e.target.dataset.href; });
    render();
  }

  // ================= project workspace =================
  const CLIENT_FIELDS = [['company', 'Company'], ['name', 'Contact name'], ['email', 'Email'], ['phone', 'Mobile'], ['license', 'Contractor license #'], ['qualifier', 'Qualifier name'], ['address', 'Office address'], ['city', 'City'], ['state', 'State'], ['zip', 'ZIP']];
  const JOB_FIELDS = [['address', 'Job address'], ['city', 'City / municipality'], ['county', 'County'], ['zip', 'ZIP'], ['type', 'Permit type'], ['owner', 'Property owner'], ['ownerPhone', 'Owner phone'], ['pcn', 'Parcel # (PCN / folio)'], ['legal', 'Legal description'], ['value', 'Job value ($)'], ['permitNo', 'Permit #'], ['notes', 'Notes (staff)']];
  const QUICK = ['Signed contract', 'Certificate of insurance (COI)', "Workers' comp certificate", 'Product approvals (NOA / FL #)', 'Signed permit application', 'Recorded Notice of Commencement', 'HOA approval letter', 'Plans / drawings', 'Roof report / measurements', 'Owner authorization letter'];
  let P = null; let portalUrl = null;

  async function project() {
    const id = qs().id;
    const who = await me();
    if (!who.admin) { $('#project-login').hidden = false; return; }
    $('#project-view').hidden = false;
    await load(id);
    wire();
  }

  async function load(id) {
    const d = await api(`/api/projects?action=get&id=${encodeURIComponent(id || P.id)}`);
    P = d.project; STATUSES = d.statuses;
    window.BPRProject = { get project() { return P; }, reload: () => load(P.id).then(() => P) };
    render();
    document.dispatchEvent(new CustomEvent('project:loaded', { detail: P }));
  }

  function render() {
    document.title = `${P.client.company || P.client.name} | Project`;
    $('#pj-id').textContent = `Project ${P.id}`;
    $('#pj-title').textContent = P.client.company || P.client.name;
    $('#pj-sub').textContent = [P.job.address, P.job.city, P.job.type].filter(Boolean).join(' · ');
    $('#pj-status').innerHTML = STATUSES.map(([k, l]) => `<option value="${k}"${k === P.status ? ' selected' : ''}>${esc(l)}</option>`).join('');
    // requests
    $('#requests').innerHTML = P.requests.map((r) => {
      const files = r.fileIds.map((fid) => P.files.find((f) => f.id === fid)).filter(Boolean);
      return `<li class="req req--${r.status}"><div><strong>${esc(r.label)}</strong>${r.note ? `<small>${esc(r.note)}</small>` : ''}
${files.map((f) => `<a href="${fileUrl(P.id, f.id)}" target="_blank" rel="noopener">${esc(f.name)}</a>`).join(' ')}</div>
<button class="btn btn--ghost btn--sm" data-req="${r.id}" data-to="${r.status === 'open' ? 'received' : 'open'}">${r.status === 'open' ? 'Mark received' : 'Reopen'}</button></li>`;
    }).join('') || '<li class="muted">Nothing requested yet.</li>';
    $('#quick-requests').innerHTML = QUICK.filter((q) => !P.requests.some((r) => r.label === q)).map((q) => `<button type="button" class="chip-btn" data-quick="${esc(q)}">+ ${esc(q)}</button>`).join('');
    // files
    const files = P.files.filter((f) => !f.removed);
    $('#files').innerHTML = files.map((f) => `<tr>
<td><a href="${fileUrl(P.id, f.id)}" target="_blank" rel="noopener">${esc(f.name)}</a><br><small>${fmtSize(f.size || 0)} · ${fmtWhen(f.at)}</small></td>
<td>${esc(f.kind)}</td><td><small>${esc(f.by || '')}${f.byRole === 'client' ? ' (client)' : ''}</small></td>
<td><label class="check"><input type="checkbox" data-vis="${f.id}"${f.internal ? '' : ' checked'}> ${f.internal ? 'Staff only' : 'Shared'}</label></td>
<td class="num"><a class="btn btn--ghost btn--sm" href="${fileUrl(P.id, f.id, 1)}">Download</a> <button class="btn btn--ghost btn--sm" data-rm="${f.id}" aria-label="Remove ${esc(f.name)}">Remove</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No files yet.</td></tr>';
    // signing
    $('#signing').innerHTML = P.signing.map((s) => `<tr><td>${esc(s.title)}<br><small>Sent ${fmtWhen(s.sentAt)}${s.viewedAt ? ` · viewed ${fmtWhen(s.viewedAt)}` : ''}</small></td>
<td>${esc(s.signer.name)}<br><small>${esc(s.signer.email || '')}</small></td>
<td>${s.status === 'signed' ? `<span class="pill pill--issued">Signed ${fmtWhen(s.signedAt)}</span>` : s.status === 'void' ? '<span class="pill">Cancelled</span>' : '<span class="pill pill--docs">Waiting</span>'}</td>
<td class="num">${s.status === 'signed' ? `<a class="btn btn--ghost btn--sm" href="${fileUrl(P.id, s.signedFileId)}" target="_blank" rel="noopener">Signed PDF</a>` : ''}
${s.status === 'sent' ? `<button class="btn btn--ghost btn--sm" data-slink="${s.id}">Copy link</button> <button class="btn btn--ghost btn--sm" data-svoid="${s.id}">Cancel</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No signature requests yet.</td></tr>';
    // details
    const field = (group, [k, label]) => `<div class="field field--half"><label for="d-${group}-${k}">${label}</label>${k === 'notes' || k === 'legal'
      ? `<textarea id="d-${group}-${k}" data-g="${group}" data-k="${k}" rows="2">${esc(P[group][k] || '')}</textarea>`
      : `<input id="d-${group}-${k}" data-g="${group}" data-k="${k}" value="${esc(P[group][k] || '')}">`}</div>`;
    $('#client-fields').innerHTML = CLIENT_FIELDS.map((f) => field('client', f)).join('');
    $('#job-fields').innerHTML = JOB_FIELDS.map((f) => field('job', f)).join('');
    // timeline
    $('#timeline').innerHTML = P.timeline.map((t) => `<li class="${t.internal ? 'is-internal' : ''}${t.fromClient ? ' is-client' : ''}"><time>${fmtWhen(t.at)}</time><strong>${esc(t.by)}</strong> ${esc(t.text)}${t.internal ? ' <span class="pill">Staff only</span>' : ''}</li>`).join('');
    // signature file choices
    const pdfs = files.filter((f) => /pdf/i.test(f.mime || '') || /\.pdf$/i.test(f.name));
    $('#sg-file').innerHTML = '<option value="">Choose a PDF…</option>' + pdfs.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
  }

  const post = (action, body) => api(`/api/projects?action=${action}&id=${P.id}`, { method: 'POST', body }).then((d) => { if (d.project) { P = d.project; render(); } return d; });

  function wire() {
    // tabs
    $$('.app-tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
      $$('.app-tabs [data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      $$('.app-panel').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
    }));
    $('#pj-status').addEventListener('change', (e) => post('update', { status: e.target.value }).then(() => toast('Status updated')));
    // share
    $$('[data-share]').forEach((b) => b.addEventListener('click', async () => {
      const act = b.dataset.share;
      if (act === 'revoke' && !confirm('Reset links? Every portal and signing link sent so far will stop working.')) return;
      const { url } = await api(`/api/projects?action=link&id=${P.id}`, { method: 'POST', body: act === 'revoke' ? { revoke: true } : {} });
      portalUrl = url;
      const msg = `Hi ${P.client.name || ''}, here is your project portal for ${P.job.address || 'your permit'}. Upload documents, sign, and track status here: ${url}`;
      if (act === 'copy' || act === 'revoke') { copy(url); if (act === 'revoke') { toast('Old links disabled. New link copied.'); load(P.id); } }
      if (act === 'text') location.href = `sms:${(P.client.phone || '').replace(/\D/g, '').slice(-10) ? '+1' + P.client.phone.replace(/\D/g, '').slice(-10) : ''}?&body=${encodeURIComponent(msg)}`;
      if (act === 'email') location.href = `mailto:${encodeURIComponent(P.client.email || '')}?subject=${encodeURIComponent('Your permit project portal')}&body=${encodeURIComponent(msg)}`;
    }));
    // requests
    $('#req-form').addEventListener('submit', async (e) => { e.preventDefault(); await post('request', { label: e.target.label.value }); e.target.reset(); });
    $('#quick-requests').addEventListener('click', (e) => { const b = e.target.closest('[data-quick]'); if (b) post('request', { label: b.dataset.quick }); });
    $('#requests').addEventListener('click', (e) => { const b = e.target.closest('[data-req]'); if (b) post('request-status', { requestId: b.dataset.req, status: b.dataset.to }); });
    // uploads
    dropzone($('#staff-drop'), async (files) => {
      await uploadAll(files, { projectId: P.id, kind: $('#up-kind').value, internal: $('#up-internal').checked }, $('#staff-up-list'));
      await load(P.id); toast('Uploaded');
    });
    $('#files').addEventListener('change', async (e) => {
      const id = e.target.dataset.vis; if (!id) return;
      await api(`/api/files?action=update&id=${P.id}&f=${id}`, { method: 'POST', body: { internal: !e.target.checked } }); load(P.id);
    });
    $('#files').addEventListener('click', async (e) => {
      const id = e.target.dataset.rm; if (!id || !confirm('Remove this file from the project?')) return;
      await api(`/api/files?action=remove&id=${P.id}&f=${id}`, { method: 'POST', body: {} }); load(P.id);
    });
    // details
    $('#details-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const client = {}; const job = {};
      $$('[data-g]', e.target).forEach((el) => { (el.dataset.g === 'client' ? client : job)[el.dataset.k] = el.value; });
      await post('update', { client, job }); toast('Saved');
    });
    // notes
    $('#note-form').addEventListener('submit', async (e) => { e.preventDefault(); await post('note', { text: e.target.text.value, internal: e.target.internal.checked }); e.target.reset(); });
    // signing list actions
    $('#signing').addEventListener('click', async (e) => {
      const l = e.target.dataset.slink; const v = e.target.dataset.svoid;
      if (l) { const { url } = await api(`/api/sign?action=link&id=${P.id}&s=${l}`, { method: 'POST', body: {} }); copy(url); }
      if (v && confirm('Cancel this signature request?')) { await api(`/api/sign?action=void&id=${P.id}&s=${v}`, { method: 'POST', body: {} }); load(P.id); }
    });
    wireSignSetup();
  }

  // ---- signature field placement ----
  function wireSignSetup() {
    const setup = $('#sign-setup'); let pages = []; let fields = []; let placing = null;
    const sizes = { signature: [180, 44], initials: [60, 36], name: [170, 20], date: [100, 20] };
    $('#sign-new').addEventListener('click', () => {
      setup.hidden = false; fields = []; placing = null;
      $('#sg-name').value = P.job.owner || P.client.name || ''; $('#sg-email').value = P.client.email || '';
      setup.scrollIntoView({ behavior: 'smooth' });
    });
    $('#sg-cancel').addEventListener('click', () => { setup.hidden = true; });
    $('#sg-file').addEventListener('change', async (e) => {
      fields = []; const id = e.target.value; if (!id) return;
      const f = P.files.find((x) => x.id === id);
      if (!$('#sg-title').value) $('#sg-title').value = f.name.replace(/\.pdf$/i, '');
      $('#sg-pdf').innerHTML = '<p class="muted">Rendering…</p>';
      const buf = await (await fetch(fileUrl(P.id, id), { credentials: 'same-origin' })).arrayBuffer();
      pages = await window.PDFView.render(buf, $('#sg-pdf'), { maxWidth: 820 });
      pages.forEach((pg) => pg.overlay.addEventListener('click', (ev) => {
        if (!placing || ev.target !== pg.overlay) return;
        const r = pg.overlay.getBoundingClientRect();
        const [w, h] = sizes[placing];
        const fld = { page: pg.index, type: placing, w, h, x: Math.max(0, (ev.clientX - r.left) / pg.scale - w / 2), y: Math.max(0, (ev.clientY - r.top) / pg.scale - h / 2) };
        fields.push(fld);
        window.PDFView.box(pg, fld, { draggable: true, onRemove: () => { fields = fields.filter((x) => x !== fld); } });
      }));
    });
    $$('[data-place]').forEach((b) => b.addEventListener('click', () => {
      placing = b.dataset.place;
      $$('[data-place]').forEach((x) => x.classList.toggle('is-on', x === b));
      $('#place-hint').textContent = `Click on the page to place: ${b.textContent}`;
    }));
    $('#sg-send').addEventListener('click', async () => {
      try {
        const r = await api(`/api/sign?action=prepare&id=${P.id}`, { method: 'POST', body: { fileId: $('#sg-file').value, title: $('#sg-title').value,
          signerName: $('#sg-name').value, signerEmail: $('#sg-email').value, fields } });
        setup.hidden = true; await load(P.id);
        copy(r.url); toast('Signing link copied. Send it to the signer.');
      } catch (err) { toast(err.message, true); }
    });
  }

  if ($('#dash-view')) dashboard();
  if ($('#project-view')) project();
})();
