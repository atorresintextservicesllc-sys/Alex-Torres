// Permit requirements checker: city + roof system -> documents, portal facts, CTA.
(() => {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const city = document.getElementById('ck-city');
  const sys = document.getElementById('ck-system');
  const out = document.getElementById('ck-result');
  let J = []; let meta = {};
  const yes = (v) => /^y/i.test(v || '');

  function find() {
    const v = city.value.trim().toLowerCase();
    return J.find((j) => j.name.toLowerCase() === v) || (v.length > 2 ? J.find((j) => j.name.toLowerCase().startsWith(v)) : null);
  }
  function render() {
    const j = find();
    if (!j) { out.innerHTML = city.value.trim() ? `<p class="card">We don't have a guide for "${esc(city.value)}" yet, but we can still file it. <a href="/contact">Tell us about the job</a>.</p>` : ''; return; }
    const s = sys.value;
    const docs = j.documents.concat(j.systems[s] || []);
    const params = new URLSearchParams({ municipality: j.name, project_type: 'Re-roof' });
    try { localStorage.setItem('ck', JSON.stringify({ c: j.name, s })); } catch (_) { /* optional */ }
    out.innerHTML = `<div class="checker-result">
<div class="card"><p class="eyebrow">${esc(j.county)} County${j.hvhz ? ' · HVHZ' : ''}</p>
<h2>${esc(j.name)}: ${esc(s.toLowerCase())} re-roof permit</h2>
<ol class="doclist doclist--check">${docs.map((d) => `<li><label><input type="checkbox"> ${esc(d)}</label></li>`).join('')}</ol>
<p class="muted small">Use the checkboxes to track what you have. ${esc(meta.note || '')}</p>
<div class="btn-row"><a class="btn btn--ghost btn--sm" href="/permits/${esc(j.slug)}">Full ${esc(j.name)} guide</a><button type="button" class="btn btn--ghost btn--sm" onclick="window.print()">Print checklist</button></div></div>
<aside class="card"><h3>How to file</h3>
<dl class="facts"><div><dt>Portal</dt><dd>${esc(j.platform || 'Contact the building department')}</dd></div>
<div><dt>Online submittal</dt><dd>${j.online ? (yes(j.online) ? 'Yes' : 'No, paper / in person') : 'Verify'}</dd></div>
<div><dt>PDF uploads</dt><dd>${j.upload ? (yes(j.upload) ? 'Yes' : 'No') : 'Verify'}</dd></div>
<div><dt>Phone</dt><dd>${esc(j.phone || 'n/a')}</dd></div></dl>
${j.notes ? `<p class="small">${esc(j.notes)}</p>` : ''}
${j.hvhz ? '<p class="small"><strong>HVHZ:</strong> roofing products need Miami-Dade NOAs, and HVHZ roofing application sections apply.</p>' : ''}
<a class="btn btn--primary btn--block" href="/contact?${params}">Have us pull this permit</a></aside></div>`;
  }
  fetch('/data/jurisdictions.json').then((r) => r.json()).then((d) => {
    J = d.jurisdictions; meta = d._meta || {};
    document.getElementById('ck-cities').innerHTML = J.map((j) => `<option value="${esc(j.name)}">`).join('');
    const q = new URLSearchParams(location.search);
    let saved = {}; try { saved = JSON.parse(localStorage.getItem('ck') || '{}'); } catch (_) { /* optional */ }
    city.value = q.get('city') || saved.c || '';
    if (q.get('system') || saved.s) sys.value = q.get('system') || saved.s;
    render();
  });
  city.addEventListener('input', render); city.addEventListener('change', render); sys.addEventListener('change', render);
})();
