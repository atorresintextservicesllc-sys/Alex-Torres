// Billing tools: invoice builder (/billing), client invoice view (/invoice), payment notice (/pay).
// An invoice's details travel inside its link (#i=...&s=<server signature>), and never the payment
// destination. Zelle/ACH/card details always come from site.json, so a tampered link can't
// redirect money. Natasha's invoice log lives in her own browser (with backup export).
(async () => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const D = JSON.parse(($('#site-data') || {}).textContent || '{}');
  const P = D.payments || {};
  const money = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const fmtDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const store = {
    get(k, d) { try { const v = localStorage.getItem('rps.' + k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('rps.' + k, JSON.stringify(v)); return true; } catch (_) { return false; } },
  };

  // ---- link encoding (UTF-8 safe base64url) ----
  const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const dec = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return JSON.parse(decodeURIComponent(escape(atob(s)))); };

  // ---- math ----
  const KINDS = {
    full: 'Invoice', deposit: 'Deposit invoice', balance: 'Final invoice', retainer: 'Retainer invoice',
  };
  function totals(inv) {
    const items = inv.items || [];
    const base = items.filter((i) => !i.pct).reduce((s, i) => s + (Number(i.q) || 0) * (Number(i.r) || 0), 0);
    const lines = items.map((i) => ({ ...i, amt: i.pct ? base * (Number(i.r) || 0) / 100 * (Number(i.q) || 1) : (Number(i.q) || 0) * (Number(i.r) || 0) }));
    const discount = inv.disc ? -(base * Number(inv.disc) / 100) : 0;
    const subtotal = lines.reduce((s, l) => s + l.amt, 0) + discount;
    const paid = Number(inv.paid) || 0;
    let due;
    if (inv.k === 'deposit') due = subtotal * (Number(inv.dep) || 50) / 100;
    else due = subtotal - paid;
    return { lines, discount, subtotal, paid, due: Math.max(0, Math.round(due * 100) / 100) };
  }

  // ---- shared invoice renderer ----
  function renderInvoice(inv) {
    const t = totals(inv);
    const to = inv.to || {};
    const rows = t.lines.map((l) => `<tr><td>${esc(l.d)}</td><td class="num">${l.pct ? `${esc(l.r)}%` : esc(l.q)}</td><td class="num">${l.pct ? '' : money(l.r)}</td><td class="num">${money(l.amt)}</td></tr>`).join('');
    const card = P.cardLink ? `<a class="btn btn--primary" href="${esc(P.cardLink)}" rel="noopener" target="_blank">Pay by card</a>` : '';
    return `<article class="invoice">
<header class="invoice__head">
  <div class="invoice__brand"><span class="brand__mark">${esc(D.monogram)}</span><div><strong>${esc(D.legalName || D.name)}</strong><span>${esc(D.phone)} · ${esc(D.email)}</span></div></div>
  <div class="invoice__title"><h2>${esc(KINDS[inv.k] || 'Invoice')}</h2><p>#${esc(inv.n)}</p></div>
</header>
<div class="invoice__meta">
  <div><h3>Bill to</h3><p><strong>${esc(to.c || to.nm)}</strong>${to.c && to.nm ? `<br>${esc(to.nm)}` : ''}${to.e ? `<br>${esc(to.e)}` : ''}${to.p ? `<br>${esc(to.p)}` : ''}</p></div>
  <dl><div><dt>Date</dt><dd>${fmtDate(inv.d)}</dd></div><div><dt>Due</dt><dd>${inv.due ? fmtDate(inv.due) : 'On receipt'}</dd></div>${inv.proj ? `<div><dt>Project</dt><dd>${esc(inv.proj)}</dd></div>` : ''}</dl>
</div>
<table class="invoice__items"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">No line items yet</td></tr>'}</tbody></table>
<table class="invoice__totals"><tbody>
${t.discount ? `<tr><th>Volume discount (${esc(inv.disc)}%)</th><td>${money(t.discount)}</td></tr>` : ''}
<tr><th>Total</th><td>${money(t.subtotal)}</td></tr>
${inv.k === 'deposit' ? `<tr><th>Deposit due now (${esc(inv.dep || 50)}%)</th><td></td></tr>` : ''}
${t.paid && inv.k !== 'deposit' ? `<tr><th>Less payments received</th><td>−${money(t.paid)}</td></tr>` : ''}
<tr class="invoice__due"><th>Amount due</th><td>${money(t.due)}</td></tr>
</tbody></table>
${inv.note ? `<p class="invoice__note">${esc(inv.note).replace(/\n/g, '<br>')}</p>` : ''}
<section class="invoice__pay">
  <h3>How to pay</h3>
  <ol>
    <li><strong>Zelle</strong> to <strong>${esc(P.zelle)}</strong>${P.zelleName ? ` (${esc(P.zelleName)})` : ''}. Put <strong>#${esc(inv.n)}</strong> in the memo.</li>
    ${P.ach ? `<li><strong>ACH</strong>: ${esc(P.ach)}</li>` : ''}
    ${P.cardLink ? '<li><strong>Card</strong>: use the button below and enter the amount due.</li>' : ''}
  </ol>
  <div class="btn-row no-print">${card}</div>
  ${P.terms ? `<p class="muted small">${esc(P.terms)}</p>` : ''}
</section>
<footer class="invoice__foot">${esc(D.legalName || D.name)} · Professionalism · Reliability · Results</footer>
</article>`;
  }

  // The server signs each link (staff session required) and /invoice checks the signature, so a hand-made link
  // can't pass as one of ours.
  const post = async (action, body) => {
    const r = await fetch(`/api/admin?action=${action}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `Error ${r.status}`); e.status = r.status; throw e; }
    return j;
  };
  async function invoiceUrl(inv) {
    const i = enc(inv);
    const { s } = await post('invoice-sign', { i });
    return `${location.origin}/invoice#i=${i}&s=${s}`;
  }

  async function notify(fields) {
    // Tells Natasha a client says they've paid. Uses the site's form service, else email.
    if (D.formEndpoint) {
      const fd = new FormData();
      Object.entries({ subject: `Payment sent — invoice ${fields.invoice}`, from_name: 'Website payment notice', ...fields }).forEach(([k, v]) => fd.append(k, v));
      if (D.formAccessKey) fd.append('access_key', D.formAccessKey);
      const r = await fetch(D.formEndpoint, { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(r.status);
      return 'sent';
    }
    const body = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');
    location.href = `mailto:${D.email}?subject=${encodeURIComponent('Payment sent — invoice ' + fields.invoice)}&body=${encodeURIComponent(body)}`;
    return 'mailto';
  }

  function wirePaidForm(form, getDefaults) {
    if (!form) return;
    const status = $('.form-status', form);
    const d = getDefaults ? getDefaults() : {};
    if (d.invoice && form.elements.invoice) form.elements.invoice.value = d.invoice;
    if (d.amount && form.elements.amount) form.elements.amount.value = d.amount;
    if (d.name && form.elements.name) form.elements.name.value = d.name;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      status.textContent = 'Sending…';
      try {
        const how = await notify({ invoice: f.invoice, amount: f.amount, method: f.method, name: f.name, note: f.note || '' });
        status.textContent = how === 'sent' ? 'Thank you! We\'ll confirm once the payment arrives.' : 'Opening your email app to send the notice…';
        status.dataset.state = 'ok';
        if (how === 'sent') form.reset();
      } catch (_) {
        status.textContent = `That didn't go through. Please text ${D.phone} instead.`;
        status.dataset.state = 'err';
      }
    });
  }

  // =============== /invoice (client view) ===============
  const view = $('#invoice-view');
  if (view) {
    let inv = null;
    const raw = (location.hash.match(/[#&]i=([^&]+)/) || [])[1];
    const sig = (location.hash.match(/[#&]s=([^&]+)/) || [])[1];
    try { if (raw) inv = dec(raw); } catch (_) { inv = null; }
    const fail = (title) => { view.innerHTML = `<div class="card center"><h2>${title}</h2><p>Please use the full link you were sent, or contact us at ${esc(D.phone)} before paying.</p></div>`; };
    if (!inv || !inv.n) fail('This invoice link is incomplete');
    else {
      view.innerHTML = '<div class="card center"><p class="muted">Checking your invoice…</p></div>';
      let valid = false;
      try { valid = !!sig && (await post('invoice-check', { i: raw, s: sig })).valid; } catch (_) { valid = false; }
      if (!valid) { fail('We couldn&rsquo;t verify this invoice'); inv = null; }
    }
    if (inv) {
      document.title = `${KINDS[inv.k] || 'Invoice'} #${inv.n} | ${D.name}`;
      view.innerHTML = renderInvoice(inv);
      const t = totals(inv);
      wirePaidForm($('#paid-form'), () => ({ invoice: inv.n, amount: t.due.toFixed(2), name: (inv.to || {}).nm || '' }));
    }
    $$('[data-print]').forEach((b) => b.addEventListener('click', () => window.print()));
  }

  // =============== /pay (public) ===============
  wirePaidForm($('#pay-form'), () => {
    const q = new URLSearchParams(location.search);
    return { invoice: q.get('invoice') || '', amount: q.get('amount') || '' };
  });
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; } catch (_) { b.textContent = b.dataset.copy; }
    setTimeout(() => { b.textContent = 'Copy'; }, 1800);
  }));

  // =============== /billing (Natasha's builder) ===============
  const builder = $('#invoice-builder');
  if (!builder) return;

  // Catalog: her price list + hourly admin + retainer plans + custom
  const catalog = [];
  (D.pricing?.groups || []).forEach((g) => g.items.forEach(([name, note, price]) => {
    const pct = /%/.test(price);
    const num = Number((String(price).match(/[\d,.]+/) || ['0'])[0].replace(/,/g, ''));
    const group = g.title.replace(/ only$/i, '');
    catalog.push({ group: g.title, label: `${name} — ${price}`, d: /hourly/i.test(g.title) ? name : `${group}: ${name}`, r: num, pct, hourly: /\/\s*hr/i.test(price) });
  }));
  (D.retainers || []).filter((r) => r.rate).forEach((r) => catalog.push({ group: 'Retainer plans', label: `${r.name} — ${r.price}`, d: `${r.name} (${r.period || 'monthly retainer'})`, r: r.rate, retainer: true }));

  const F = builder.elements;
  const itemsBody = $('#items');
  const preview = $('#preview');
  let draft = store.get('draft', null);

  function nextNumber() {
    const n = store.get('next', 1001);
    return `${P.invoicePrefix || 'INV-'}${n}`;
  }
  function blank() {
    return { n: nextNumber(), d: today(), due: addDays(today(), Number(P.dueDays) || 7), k: 'full', dep: 50, paid: 0, disc: 0, to: {}, proj: '', items: [], note: '' };
  }

  function rowHTML(it) {
    const opts = ['<option value="">Custom…</option>'].concat(
      [...new Set(catalog.map((c) => c.group))].map((g) => `<optgroup label="${esc(g)}">${catalog.map((c, i) => (c.group === g ? `<option value="${i}">${esc(c.label)}</option>` : '')).join('')}</optgroup>`)).join('');
    return `<tr>
<td><select class="it-pick" aria-label="Service">${opts}</select><input class="it-d" aria-label="Description" placeholder="Description (add job address / permit #)" value="${esc(it.d)}"></td>
<td><input class="it-q" type="number" min="0" step="0.25" aria-label="Quantity or hours" placeholder="Qty / hrs" value="${esc(it.q ?? 1)}"></td>
<td><div class="it-rate"><input class="it-r" type="number" min="0" step="0.01" aria-label="Rate" placeholder="Rate $" value="${esc(it.r ?? '')}"><label title="Percent of permit fees"><input class="it-pct" type="checkbox" ${it.pct ? 'checked' : ''}> %</label></div></td>
<td><button type="button" class="it-del" aria-label="Remove line">✕</button></td></tr>`;
  }

  function readForm() {
    const inv = {
      n: F.n.value.trim(), d: F.d.value, due: F.due.value, k: F.k.value, dep: Number(F.dep.value) || 50,
      paid: Number(F.paid.value) || 0, disc: Number(F.disc.value) || 0, proj: F.proj.value.trim(), note: F.note.value.trim(),
      to: { c: F.c.value.trim(), nm: F.nm.value.trim(), e: F.e.value.trim(), p: F.p.value.trim() },
      items: $$('tr', itemsBody).map((tr) => ({ d: $('.it-d', tr).value.trim(), q: Number($('.it-q', tr).value) || 0, r: Number($('.it-r', tr).value) || 0, pct: $('.it-pct', tr).checked }))
        .filter((i) => i.d || i.r),
    };
    // keep links short: drop empty fields
    Object.keys(inv.to).forEach((k) => { if (!inv.to[k]) delete inv.to[k]; });
    ['proj', 'note', 'due'].forEach((k) => { if (!inv[k]) delete inv[k]; });
    if (!inv.paid) delete inv.paid; if (!inv.disc) delete inv.disc; if (inv.k !== 'deposit') delete inv.dep;
    inv.items = inv.items.map((i) => { const o = { d: i.d, q: i.q, r: i.r }; if (i.pct) o.pct = 1; return o; });
    return inv;
  }

  function fillForm(inv) {
    F.n.value = inv.n; F.d.value = inv.d; F.due.value = inv.due || ''; F.k.value = inv.k || 'full';
    F.dep.value = inv.dep || 50; F.paid.value = inv.paid || ''; F.disc.value = inv.disc || ''; F.proj.value = inv.proj || ''; F.note.value = inv.note || '';
    const to = inv.to || {}; F.c.value = to.c || ''; F.nm.value = to.nm || ''; F.e.value = to.e || ''; F.p.value = to.p || '';
    itemsBody.innerHTML = (inv.items.length ? inv.items : [{ d: '', q: 1, r: '' }]).map(rowHTML).join('');
    sync();
  }

  function sync() {
    const inv = readForm();
    $('#dep-wrap').hidden = inv.k !== 'deposit';
    $('#paid-wrap').hidden = inv.k === 'deposit';
    preview.innerHTML = renderInvoice(inv);
    store.set('draft', inv);
    return inv;
  }

  itemsBody.addEventListener('change', (e) => {
    const tr = e.target.closest('tr');
    if (e.target.matches('.it-pick') && e.target.value !== '') {
      const c = catalog[Number(e.target.value)];
      $('.it-d', tr).value = c.d; $('.it-r', tr).value = c.r; $('.it-pct', tr).checked = !!c.pct;
      if (c.retainer) F.k.value = 'retainer';
    }
    sync();
  });
  itemsBody.addEventListener('click', (e) => {
    if (!e.target.matches('.it-del')) return;
    e.target.closest('tr').remove();
    if (!$('tr', itemsBody)) itemsBody.insertAdjacentHTML('beforeend', rowHTML({ d: '', q: 1, r: '' }));
    sync();
  });
  builder.addEventListener('input', sync);
  $('#add-line').addEventListener('click', () => { itemsBody.insertAdjacentHTML('beforeend', rowHTML({ d: '', q: 1, r: '' })); $('tr:last-child .it-pick', itemsBody).focus(); });
  $('#new-invoice').addEventListener('click', () => { if (confirm('Start a new blank invoice? The current draft will be cleared.')) fillForm(blank()); });

  // clients remembered from the log
  const log = () => store.get('log', []);
  function refreshClients() {
    const seen = {};
    log().forEach((x) => { if (x.to && x.to.c) seen[x.to.c] = x.to; });
    $('#clients').innerHTML = Object.keys(seen).map((c) => `<option value="${esc(c)}">`).join('');
    return seen;
  }
  F.c.addEventListener('change', () => {
    const to = refreshClients()[F.c.value];
    if (to) { if (!F.nm.value) F.nm.value = to.nm || ''; if (!F.e.value) F.e.value = to.e || ''; if (!F.p.value) F.p.value = to.p || ''; sync(); }
  });

  // ---- create link / send ----
  const out = $('#link-out');
  async function finalize() {
    if (!builder.reportValidity()) return null;
    const inv = sync();
    if (!inv.items.length) { alert('Add at least one line item.'); return null; }
    let url;
    try { url = await invoiceUrl(inv); } catch (e) {
      if (e.status === 401) { location.href = '/admin?next=/billing'; return null; }
      alert(`The invoice link couldn't be created (${e.message}). Check your connection and try again.`); return null;
    }
    const t = totals(inv);
    const entries = log().filter((x) => x.n !== inv.n);
    entries.unshift({ n: inv.n, d: inv.d, to: inv.to, k: inv.k, due: t.due, total: t.subtotal, url, status: 'sent' });
    store.set('log', entries);
    // advance the counter past this number
    const num = Number(String(inv.n).replace(/\D/g, ''));
    if (num >= store.get('next', 1001)) store.set('next', num + 1);
    out.hidden = false;
    $('#link-url').value = url;
    $('#link-amount').textContent = money(t.due);
    renderLog();
    return { inv, url, t };
  }
  $('#make-link').addEventListener('click', () => finalize());
  $('#copy-link').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#link-url').value); $('#copy-link').textContent = 'Copied'; setTimeout(() => { $('#copy-link').textContent = 'Copy link'; }, 1500); } catch (_) { $('#link-url').select(); } });
  $('#open-link').addEventListener('click', () => window.open($('#link-url').value, '_blank', 'noopener'));
  const message = (inv, url, t) => `Hi ${inv.to.nm || inv.to.c || ''},\n\nHere is ${KINDS[inv.k].toLowerCase()} #${inv.n} from ${D.legalName || D.name}${inv.proj ? ` for ${inv.proj}` : ''}.\nAmount due: ${money(t.due)}${inv.due ? ` (due ${fmtDate(inv.due)})` : ''}\n\nView and pay: ${url}\n\nThank you!\n${D.name} · ${D.phone}`;
  $('#email-link').addEventListener('click', async () => {
    const r = await finalize(); if (!r) return;
    location.href = `mailto:${encodeURIComponent(r.inv.to.e || '')}?subject=${encodeURIComponent(`${KINDS[r.inv.k]} #${r.inv.n} — ${D.name}`)}&body=${encodeURIComponent(message(r.inv, r.url, r.t))}`;
  });
  $('#text-link').addEventListener('click', async () => {
    const r = await finalize(); if (!r) return;
    const num = (r.inv.to.p || '').replace(/\D/g, '').slice(-10);
    location.href = `sms:${num ? '+1' + num : ''}?&body=${encodeURIComponent(message(r.inv, r.url, r.t))}`;
  });

  // ---- log ----
  function renderLog() {
    const rows = log();
    const open = rows.filter((x) => x.status === 'sent').reduce((s, x) => s + (Number(x.due) || 0), 0);
    $('#log-summary').textContent = rows.length ? `${rows.length} invoice${rows.length > 1 ? 's' : ''} · ${money(open)} outstanding` : 'No invoices yet.';
    $('#log-body').innerHTML = rows.map((x, i) => `<tr>
<td>#${esc(x.n)}<br><small>${fmtDate(x.d)}</small></td><td>${esc((x.to && (x.to.c || x.to.nm)) || '')}<br><small>${esc(KINDS[x.k] || '')}</small></td>
<td class="num">${money(x.due)}</td>
<td><select data-i="${i}" class="log-status" aria-label="Status"><option value="sent"${x.status === 'sent' ? ' selected' : ''}>Sent</option><option value="paid"${x.status === 'paid' ? ' selected' : ''}>Paid</option><option value="void"${x.status === 'void' ? ' selected' : ''}>Void</option></select></td>
<td class="log-actions"><a href="${esc(x.url)}" target="_blank" rel="noopener">View</a> <button type="button" data-edit="${i}">Edit</button></td></tr>`).join('');
  }
  $('#log-body').addEventListener('change', (e) => {
    if (!e.target.matches('.log-status')) return;
    const rows = log(); rows[Number(e.target.dataset.i)].status = e.target.value; store.set('log', rows); renderLog();
  });
  $('#log-body').addEventListener('click', (e) => {
    const i = e.target.dataset.edit; if (i === undefined) return;
    const m = log()[Number(i)].url.match(/#i=([^&]+)/);
    if (m) { fillForm(dec(m[1])); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  const download = (name, text, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#export-csv').addEventListener('click', () => {
    const head = ['Invoice', 'Date', 'Client', 'Contact', 'Type', 'Total', 'Amount due', 'Status', 'Link'];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head.join(',')].concat(log().map((x) => [x.n, x.d, x.to?.c, x.to?.nm, KINDS[x.k], (x.total ?? '').toString(), x.due, x.status, x.url].map(q).join(','))).join('\n');
    download(`invoices-${today()}.csv`, csv, 'text/csv');
  });
  $('#backup').addEventListener('click', () => download(`invoice-backup-${today()}.json`, JSON.stringify({ log: log(), next: store.get('next', 1001) }, null, 2), 'application/json'));
  $('#restore').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.log)) throw new Error('bad file');
      store.set('log', data.log); if (data.next) store.set('next', data.next);
      renderLog(); refreshClients(); alert(`Restored ${data.log.length} invoices.`);
    } catch (_) { alert('That file is not an invoice backup.'); }
    e.target.value = '';
  });

  if (!store.set('probe', 1)) $('#storage-warning').hidden = false;
  fillForm(draft && draft.items ? draft : blank());
  refreshClients();
  renderLog();
})();
