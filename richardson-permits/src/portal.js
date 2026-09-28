// Client portal (/portal#t=<token>): status, document requests, uploads, signatures, messages.
(() => {
  'use strict';
  const { $, esc, api, uploadAll, dropzone, fileUrl, fmtSize, fmtWhen, toast, hashParams, setClientToken } = window.BPR;
  const { t } = hashParams();
  let P = null;
  if (!t) { $('#portal-error').hidden = false; return; }
  setClientToken(t);

  async function load() {
    try { P = (await api(`/api/projects?action=get&id=${encodeURIComponent(projectIdFromToken(t))}`)).project; }
    catch (_) { $('#portal-view').hidden = true; $('#portal-error').hidden = false; return; }
    $('#portal-view').hidden = false;
    render();
  }
  // The project id is inside the signed token payload (not secret, just signed).
  function projectIdFromToken(tok) { try { return JSON.parse(atob(tok.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).p; } catch (_) { return ''; } }

  function render() {
    document.title = `${P.job.address || 'Your project'} | Project portal`;
    $('#pt-title').textContent = P.job.address || P.client.company;
    $('#pt-sub').textContent = [P.job.city, P.job.type, P.job.permitNo ? `Permit #${P.job.permitNo}` : ''].filter(Boolean).join(' · ');
    $('#pt-status').textContent = P.statusLabel;
    const idx = P.statuses.findIndex((s) => s[0] === P.status);
    $('#pt-steps').innerHTML = P.statuses.map(([k, l], i) => `<li class="${i < idx ? 'is-done' : i === idx ? 'is-now' : ''}"${i === idx ? ' aria-current="step"' : ''}><span>${esc(l)}</span></li>`).join('');

    const open = P.requests.filter((r) => r.status === 'open');
    const toSign = P.signing.filter((s) => s.status === 'sent');
    $('#pt-actions').innerHTML = toSign.map((s) => `<li class="req req--open"><div><strong>Sign: ${esc(s.title)}</strong><small>Review and sign electronically</small></div>
<a class="btn btn--primary btn--sm" href="/sign#t=${encodeURIComponent(t)}&p=${encodeURIComponent(P.id)}&s=${encodeURIComponent(s.id)}">Review &amp; sign</a></li>`).join('')
      + open.map((r) => `<li class="req req--open"><div><strong>Upload: ${esc(r.label)}</strong>${r.note ? `<small>${esc(r.note)}</small>` : ''}</div>
<label class="btn btn--primary btn--sm">Upload<input type="file" hidden multiple data-req="${esc(r.id)}"></label></li>`).join('')
      || '<li class="muted">You\'re all caught up. We\'ll let you know if we need anything.</li>';

    $('#pt-files').innerHTML = P.files.map((f) => `<li><a href="${fileUrl(P.id, f.id, 0, t)}" target="_blank" rel="noopener">${esc(f.name)}</a><small>${esc(f.kind)} · ${fmtSize(f.size || 0)} · ${fmtWhen(f.at)}</small></li>`).join('')
      || '<li class="muted">No files yet.</li>';
    $('#pt-timeline').innerHTML = P.timeline.map((x) => `<li class="${x.fromClient ? 'is-client' : ''}"><time>${fmtWhen(x.at)}</time><strong>${esc(x.by)}</strong> ${esc(x.text)}</li>`).join('');
  }

  $('#pt-actions').addEventListener('change', async (e) => {
    const input = e.target.closest('input[data-req]'); if (!input || !input.files.length) return;
    await uploadAll(input.files, { projectId: P.id, kind: 'document', requestId: input.dataset.req }, $('#pt-up-list'));
    toast('Thank you! Uploaded.'); load();
  });
  dropzone($('#pt-drop'), async (files) => {
    await uploadAll(files, { projectId: P.id, kind: $('#pt-kind').value }, $('#pt-up-list'));
    toast('Thank you! Uploaded.'); load();
  });
  $('#pt-msg').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { P = (await api(`/api/projects?action=message&id=${P.id}`, { method: 'POST', body: { text: e.target.text.value } })).project; render(); e.target.reset(); toast('Message sent'); }
    catch (err) { toast(err.message, true); }
  });
  load();
})();
