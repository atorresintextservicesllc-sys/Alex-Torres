#!/usr/bin/env node
// Zero-dependency static site builder: site.json + theme.css + pages/*.html -> dist/
// Facts (phone, license, email...) live ONLY in site.json. Empty values render as a
// visible yellow [TODO] mark and are listed at the end of the build — never invented.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8'));
const env = process.env;

const cfg = {
  url: (env.SITE_URL || site.url ||
    (env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + env.VERCEL_PROJECT_PRODUCTION_URL : '')).replace(/\/$/, ''),
  formEndpoint: env.FORM_ENDPOINT || '',
  formAccessKey: env.FORM_ACCESS_KEY || '',
  ga4: env.GA4_ID || '',
  plausible: env.PLAUSIBLE_DOMAIN || '',
  noindex: env.VERCEL_ENV === 'preview',
};

// ---------- helpers ----------
const todos = new Set();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const get = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const has = (v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);
const todo = (label) => { todos.add(label); return `<mark class="todo">[${esc(label)}]</mark>`; };
const parseArgs = (s) => [...s.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => (m[1] !== undefined ? m[1] : m[2]));
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const digits = (s) => (s || '').replace(/\D/g, '').slice(-10);
const phone10 = digits(site.phone);
const tel = phone10 ? `tel:+1${phone10}` : '';
const sms10 = digits(site.sms || site.phone);
const sms = sms10 ? `sms:+1${sms10}` : '';
const year = new Date().getFullYear();

const ctx = {
  ...site, tel, sms, year, siteUrl: cfg.url, formEndpoint: cfg.formEndpoint,
  areaText: (site.areas || []).map((a) => a.county).join(', ').replace(/, ([^,]*)$/, ' & $1'),
};

// ---------- icons (Lucide-style strokes) ----------
const ICONS = {
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  roller: '<rect x="2" y="2" width="16" height="6" rx="2"/><path d="M10 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="8" y="16" width="4" height="6" rx="1"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M10 20v-6h4v6"/>',
  crack: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 3 1.5 5L8 12l3 4-1 5M15 3l-1 4 2.5 4-2 4 1.5 6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  stamp: '<path d="M5 22h14M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.5c0-.66-.26-1.3-.73-1.77zM14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  map: '<path d="M14.1 6 9.9 4 3 6.6V20l6.9-2.6 4.2 2 6.9-2.6V4z"/><path d="M9.9 4v13.4M14.1 6v14"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  hardhat: '<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 15V6.5a1.5 1.5 0 0 1 3 0V15M4 15v-3a6 6 0 0 1 6-6M14 6a6 6 0 0 1 6 6v3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  roof: '<path d="M2 12 12 4l10 8"/><path d="M4 10.5V20h16v-9.5M2 16h20"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
};
function icon(name) {
  const p = ICONS[name.trim()];
  if (!p) throw new Error(`Unknown icon "${name}"`);
  return `<svg class="i" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
}

// ---------- photos (Unsplash CDN, resized + WebP/AVIF on the fly) ----------
const photos = site.photos || {};
function photoUrl(key, w, h) {
  const p = photos[key];
  if (!p) throw new Error(`Unknown photo "${key}" — add it to site.json "photos"`);
  return `https://images.unsplash.com/${p.id}?auto=format&fit=crop&w=${w}${h ? `&h=${h}` : ''}&q=${p.q || 62}${p.crop ? `&crop=${p.crop}` : ''}`;
}
function photoTag(key, w, h, { cls = '', eager = false, sizes } = {}) {
  const p = photos[key];
  const r = h / w;
  const set = [0.5, 1, 1.5].map((m) => { const W = Math.round(w * m); return `${photoUrl(key, W, Math.round(W * r))} ${W}w`; }).join(', ');
  return `<img${cls ? ` class="${cls}"` : ''} src="${photoUrl(key, w, h)}" srcset="${set}" sizes="${sizes || `(max-width: 700px) 100vw, ${w}px`}" width="${w}" height="${h}" alt="${esc(p.alt || '')}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

// ---------- components ----------
const brandMark = () => (exists('public/logo.svg')
  ? '<img class="brand__logo" src="/logo.svg" alt="" width="40" height="40">'
  : `<span class="brand__mark" aria-hidden="true">${esc(site.monogram)}</span>`);

const callLink = (cls = 'btn btn--ghost') => (tel
  ? `<a class="${cls}" href="${tel}" data-track="call_click">${icon('phone')}<span>${esc(site.phone)}</span></a>`
  : '');

const components = {
  header(_, page) {
    const links = site.nav.map((n) => `<li><a href="${n.href}"${n.href === page.path ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`).join('');
    const call = tel
      ? `<a class="btn btn--primary call-btn" href="${tel}" data-track="call_click" aria-label="Call ${esc(site.phone)}">${icon('phone')}<span>${esc(site.phone)}</span></a>`
      : `<a class="btn btn--primary call-btn" href="${site.cta.href}" aria-label="${esc(site.cta.label)}">${icon('arrow')}<span>${esc(site.cta.label)}</span></a>`;
    return `<header class="site-header"><div class="container">
<a class="brand" href="/">${brandMark()}<span class="brand__name">${esc(site.name)}<span class="brand__sub">${esc(site.brandSub)}</span></span></a>
<nav class="nav" id="site-nav" aria-label="Main"><ul>${links}<li class="nav__cta"><a class="btn btn--primary" href="${site.cta.href}">${esc(site.cta.label)}</a></li></ul></nav>
${call}
<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">${icon('menu')}</button>
</div></header>`;
  },

  footer() {
    const lic = site.licenseLabel
      ? `<p class="footer__lic">${esc(site.licenseLabel)} ${has(site.license) ? esc(site.license) : todo('license')}</p>` : '';
    const contact = [
      tel ? `<li><a href="${tel}" data-track="call_click">${icon('phone')}${esc(site.phone)}</a></li>` : `<li>${icon('phone')}${todo('phone')}</li>`,
      sms ? `<li><a href="${sms}" data-track="text_click">${icon('message')}Text us</a></li>` : '',
      has(site.email) ? `<li><a href="mailto:${esc(site.email)}">${icon('mail')}${esc(site.email)}</a></li>` : `<li>${icon('mail')}${todo('email')}</li>`,
      has(site.hours) ? `<li>${icon('clock')}${esc(site.hours)}</li>` : '',
    ].join('');
    const cross = has(site.crossLink && site.crossLink.url)
      ? `<p class="footer__cross">${esc(site.crossLink.label)} <a href="${esc(site.crossLink.url)}" rel="noopener">${esc(site.crossLink.name)}</a></p>` : '';
    return `<footer class="site-footer"><div class="container footer__grid">
<div class="footer__brand"><a class="brand" href="/">${brandMark()}<span class="brand__name">${esc(site.name)}<span class="brand__sub">${esc(site.brandSub)}</span></span></a>
<p>${esc(site.footerBlurb)}</p>${lic}${cross}</div>
<div><h2 class="footer__h">Contact</h2><ul class="footer__list">${contact}</ul></div>
<div><h2 class="footer__h">Service area</h2><ul class="footer__list">${site.areas.map((a) => `<li>${icon('pin')}${esc(a.county)}</li>`).join('')}</ul></div>
<div><h2 class="footer__h">Explore</h2><ul class="footer__list footer__nav">${site.nav.concat(site.footerLinks || []).map((n) => `<li><a href="${n.href}">${esc(n.label)}</a></li>`).join('')}</ul></div>
</div><div class="container footer__base"><p>&copy; ${year} ${esc(site.legalName || site.name)}. All rights reserved.</p></div></footer>`;
  },

  actionBar() {
    const t = tel || site.cta.href;
    const s = sms || site.cta.href;
    return `<nav class="action-bar" aria-label="Quick contact">
<a href="${t}"${tel ? ' data-track="call_click"' : ''}>${icon('phone')}Call</a>
<a href="${s}"${sms ? ' data-track="text_click"' : ''}>${icon('message')}Text</a>
<a class="is-primary" href="${site.cta.href}">${icon(site.cta.icon || 'file')}${esc(site.cta.short || 'Quote')}</a></nav>`;
  },

  ctaBand() {
    const b = site.ctaBand;
    return `<section class="cta-band"><div class="container">
<div><h2>${esc(b.heading)}</h2><p>${esc(b.text)}</p></div>
<div class="btn-row"><a class="btn ${b.buttonClass}" href="${site.cta.href}">${esc(site.cta.label)}${icon('arrow')}</a>${callLink('btn btn--ghost')}</div>
</div></section>`;
  },

  leadForm() {
    const f = site.form;
    const fields = f.fields.map((x) => {
      const id = 'f-' + x.name;
      const req = x.required ? ' required' : '';
      const common = `id="${id}" name="${x.name}" data-label="${esc(x.label)}"${req}${x.autocomplete ? ` autocomplete="${x.autocomplete}"` : ''}`;
      let ctl;
      if (x.type === 'select') {
        ctl = `<select ${common}><option value="">Select…</option>${x.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`;
      } else if (x.type === 'textarea') {
        ctl = `<textarea ${common} rows="5"${x.placeholder ? ` placeholder="${esc(x.placeholder)}"` : ''}></textarea>`;
      } else {
        ctl = `<input ${common} type="${x.type || 'text'}"${x.placeholder ? ` placeholder="${esc(x.placeholder)}"` : ''}${x.type === 'tel' ? ' inputmode="tel"' : ''}>`;
      }
      return `<div class="field${x.half ? ' field--half' : ''}"><label for="${id}">${esc(x.label)}${x.required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>${ctl}${x.hint ? `<small>${esc(x.hint)}</small>` : ''}</div>`;
    }).join('\n');
    const hidden = [
      `<input type="hidden" name="subject" value="${esc(f.subject)}">`,
      `<input type="hidden" name="from_name" value="${esc(site.name)} website">`,
      cfg.formAccessKey ? `<input type="hidden" name="access_key" value="${esc(cfg.formAccessKey)}">` : '',
      '<div class="hp" aria-hidden="true"><label for="f-gotcha">Leave this empty</label><input id="f-gotcha" type="text" name="_gotcha" tabindex="-1" autocomplete="off"></div>',
    ].join('');
    return `<form class="form" data-lead data-endpoint="${esc(cfg.formEndpoint)}" data-email="${esc(site.email || '')}" data-phone="${esc(site.phone || '')}" data-subject="${esc(f.subject)}" action="${esc(cfg.formEndpoint || '#')}" method="POST">
${hidden}
${fields}
<div class="field"><button class="btn btn--primary btn--block" type="submit">${esc(f.submitLabel)}${icon('arrow')}</button>
<p class="form-note">${esc(f.note)}</p></div>
<p class="form-status" role="status" aria-live="polite"></p>
</form>
<div class="form-success" hidden tabindex="-1"><div class="form-success__icon">${icon('check')}</div><h3>${esc(f.successHeading)}</h3><p>${esc(f.successText)}</p></div>`;
  },

  testimonials() {
    const list = (site.testimonials || []).filter((t) => has(t.quote) && has(t.name));
    if (!list.length) return '';
    return `<section class="section section--alt"><div class="container">
<div class="section-head section-head--center"><p class="eyebrow">What clients say</p><h2>${esc(site.testimonialsHeading || 'Straight from our clients')}</h2></div>
<div class="grid">${list.map((t) => `<figure class="quote"><blockquote><p>${esc(t.quote)}</p></blockquote><figcaption><strong>${esc(t.name)}</strong>${t.role ? `<span>${esc(t.role)}</span>` : ''}</figcaption></figure>`).join('')}</div>
</div></section>`;
  },

  stats() {
    const list = (site.stats || []).filter((s) => has(s.value));
    if (!list.length) return '';
    return `<ul class="stats">${list.map((s) => `<li><strong>${esc(s.value)}</strong><span>${esc(s.label)}</span></li>`).join('')}</ul>`;
  },

  areas() {
    return `<div class="grid area-grid">${site.areas.map((a) => `<div class="card area"><h3>${icon('pin')}${esc(a.county)}</h3><p>${a.cities.map(esc).join(' · ')}</p></div>`).join('')}</div>`;
  },

  munis() {
    return site.areas.map((a) => `<div class="card muni"><h3>${icon('pin')}${esc(a.county)}</h3><ul>${a.cities.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>`).join('');
  },

  photo([key, w = '800', h = '600', cls = '', load = '']) {
    return photoTag(key, +w, +h, { cls, eager: load === 'eager', sizes: load === 'eager' ? '(max-width: 1000px) 92vw, 520px' : undefined });
  },

  heroImg([key]) {
    const p = photos[key];
    // Sits under a ~90% dark overlay, so low quality is invisible and keeps LCP fast.
    const u = (W) => photoUrl(key, W, Math.round(W * 0.62)).replace(/&q=\d+/, '&q=40');
    const set = [480, 800, 1200, 1800].map((W) => `${u(W)} ${W}w`).join(', ');
    return `<img class="hero__bg" src="${u(1200)}" srcset="${set}" sizes="100vw" width="1200" height="744" alt="${esc(p.alt || '')}" fetchpriority="high" decoding="async">`;
  },

  marquee([src]) {
    const items = src === 'cities' ? site.areas.flatMap((a) => a.cities) : site.marquee;
    const run = items.map((t) => `<span>${esc(t)}</span>`).join('');
    return `<div class="marquee" aria-hidden="true"><div class="marquee__track">${run}${run}</div></div>`;
  },

  priceTables() {
    return site.pricing.groups.map((g) => `<div class="price-group"><h3>${esc(g.title)}</h3><table class="price-table"><tbody>${g.items.map(([name, note, price]) => `<tr><th scope="row">${esc(name)}${note ? `<small>${esc(note)}</small>` : ''}</th><td>${esc(price)}</td></tr>`).join('')}</tbody></table></div>`).join('');
  },

  retainers() {
    const plans = (site.retainers || []).filter((r) => has(r.price));
    if (!plans.length) return '';
    return `<div class="plans">${plans.map((r) => `<article class="plan${r.featured ? ' plan--featured' : ''}">
${r.featured ? '<p class="plan__flag">Best value</p>' : ''}<h3>${esc(r.name)}</h3><p class="plan__for">${esc(r.for)}</p>
<p class="plan__price"><strong>${esc(r.price)}</strong><span>${esc(r.per || '/ month')}</span></p>
<ul class="checks">${r.includes.map((t) => `<li>${icon('check')}<span>${esc(t)}</span></li>`).join('')}</ul>
${r.payLink ? `<a class="btn btn--primary btn--block" href="${esc(r.payLink)}" rel="noopener">Start by card</a>` : ''}
<a class="btn ${r.payLink ? 'btn--ghost' : 'btn--primary'} btn--block" href="/contact?plan=${encodeURIComponent(r.name)}">Start this plan</a>
</article>`).join('')}</div>`;
  },

  list([p, cls = 'checks', ic = 'check']) {
    return `<ul class="${cls}">${get(ctx, p).map((t) => `<li>${icon(ic)}<span>${esc(t)}</span></li>`).join('')}</ul>`;
  },

  paras([p, label, optional]) {
    const v = get(ctx, p);
    if (has(v)) return [].concat(v).map((t) => `<p>${esc(t)}</p>`).join('');
    if (optional) { todos.add(`${label || p} (optional, hidden until filled)`); return ''; }
    return `<p>${todo(label || p)}</p>`;
  },

  projectFilters() {
    const cats = site.projectCategories;
    return `<div class="filters" role="group" aria-label="Filter projects" data-filters="#gallery">
<button type="button" data-f="all" aria-pressed="true">All work</button>${cats.map((c) => `<button type="button" data-f="${c.id}" aria-pressed="false">${esc(c.label)}</button>`).join('')}</div>`;
  },

  projects([limit]) {
    const cats = Object.fromEntries(site.projectCategories.map((c) => [c.id, c]));
    let list = (site.projects || []).filter((p) => has(p.title));
    const real = list.length > 0;
    if (!real) list = site.projectCategories.flatMap((c) => c.examples.map((e) => ({ ...(typeof e === 'string' ? { title: e } : e), category: c.id, sample: true })));
    if (limit) list = list.slice(0, +limit);
    const tiles = list.map((p) => {
      const c = cats[p.category] || { label: p.category, icon: 'building' };
      let media;
      if (p.image) media = `<img src="${esc(p.image)}" alt="${esc(p.alt || p.title)}" loading="lazy" decoding="async" width="800" height="600">`;
      else if (p.photo) media = photoTag(p.photo, 640, 480, { sizes: '(max-width: 700px) 100vw, 380px' });
      else media = icon(c.icon);
      if (p.sample) media += '<span class="tile__note">Representative photo</span>';
      return `<article class="tile" data-cat="${esc(p.category)}"><div class="tile__media">${media}</div>
<div class="tile__body"><p class="tile__cat">${esc(c.label)}</p><h3>${esc(p.title)}</h3>${p.location ? `<p class="tile__loc">${icon('pin')}${esc(p.location)}</p>` : ''}</div></article>`;
    }).join('');
    return `<div class="gallery" id="gallery">${tiles}</div>`;
  },

  map() {
    const a = site.address || {};
    if (!has(a.street)) return '';
    const q = encodeURIComponent(`${a.street}, ${a.city}, ${a.state} ${a.zip}`);
    return `<iframe class="map" title="Map to our office" src="https://www.google.com/maps?q=${q}&amp;output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  },
};

// ---------- template engine ----------
function render(tpl, page) {
  tpl = tpl.replace(/\{\{#if\s+([\w.]+)\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (m, p, a, b = '') => (has(get(ctx, p)) ? a : b));
  return tpl.replace(/\{\{\s*(>|=|icon\s)?\s*([^}]*?)\s*\}\}/g, (m, kind, body) => {
    if (kind === '>') {
      const [name, ...args] = parseArgs(body);
      if (!components[name]) throw new Error(`Unknown component "${name}" in ${page.file}`);
      return components[name](args, page);
    }
    if (kind && kind.trim() === 'icon') return icon(body);
    const v = get(ctx, body);
    if (kind === '=') return has(v) ? esc(v) : '';
    return has(v) ? esc(v) : todo(body);
  });
}

function jsonld() {
  const d = {
    '@context': 'https://schema.org', '@type': site.schemaType, name: site.name, description: site.description,
    areaServed: site.areas.map((a) => ({ '@type': 'AdministrativeArea', name: `${a.county}, FL` })),
  };
  if (cfg.url) { d.url = cfg.url + '/'; d['@id'] = cfg.url + '/#business'; }
  if (phone10) d.telephone = `+1-${phone10.slice(0, 3)}-${phone10.slice(3, 6)}-${phone10.slice(6)}`;
  if (has(site.email)) d.email = site.email;
  if (has(site.openingHours)) d.openingHours = site.openingHours;
  if (has(site.owner)) d.founder = { '@type': 'Person', name: site.owner };
  const a = site.address || {};
  if (has(a.street)) d.address = { '@type': 'PostalAddress', streetAddress: a.street, addressLocality: a.city, addressRegion: a.state, postalCode: a.zip, addressCountry: 'US' };
  if (cfg.url && exists('public/logo.svg')) d.logo = cfg.url + '/logo.svg';
  if (cfg.url && exists('public/og.jpg')) d.image = cfg.url + '/og.jpg';
  return JSON.stringify(d).replace(/</g, '\\u003c');
}

// Business + pricing facts handed to page scripts (billing tools). Never includes secrets.
function pageData() {
  const { name, legalName, monogram, phone, email, pricing, payments, retainers } = site;
  return JSON.stringify({ name, legalName, monogram, phone, email, pricing, payments, retainers, formEndpoint: cfg.formEndpoint, formAccessKey: cfg.formAccessKey })
    .replace(/</g, '\\u003c');
}

function layout(page, body, cssHref) {
  const title = page.fullTitle || `${page.title} | ${site.name}`;
  const canon = cfg.url ? cfg.url + (page.path === '/' ? '/' : page.path) : '';
  const ogImg = cfg.url && exists('public/og.jpg') ? cfg.url + '/og.jpg' : '';
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(page.description)}">`,
    cfg.noindex || page.noindex ? '<meta name="robots" content="noindex">' : '',
    canon ? `<link rel="canonical" href="${canon}">` : '',
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${esc(site.name)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    canon ? `<meta property="og:url" content="${canon}">` : '',
    ogImg ? `<meta property="og:image" content="${ogImg}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">',
    `<meta name="theme-color" content="${site.colors.theme}">`,
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    Object.keys(photos).length ? '<link rel="preconnect" href="https://images.unsplash.com">' : '',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="${site.fonts}">`,
    `<link rel="stylesheet" href="${cssHref}">`,
    `<script type="application/ld+json">${jsonld()}</script>`,
    cfg.plausible ? `<script defer data-domain="${esc(cfg.plausible)}" src="https://plausible.io/js/script.js"></script>` : '',
  ].filter(Boolean).join('\n');
  const consent = cfg.ga4
    ? `<div class="consent" id="consent" hidden role="region" aria-label="Cookie choice"><p>We use Google Analytics cookies to see which pages help people. OK?</p><div class="btn-row"><button class="btn btn--primary" data-consent="yes">Allow</button><button class="btn btn--ghost" data-consent="no">No thanks</button></div></div>` : '';
  return `<!doctype html>
<html lang="en"${cfg.ga4 ? ` data-ga4="${esc(cfg.ga4)}"` : ''}>
<head>
${head}
</head>
<body class="${site.themeClass}">
<a class="skip" href="#main">Skip to content</a>
${components.header([], page)}
<main id="main">
${body}
</main>
${components.footer()}
${page.app ? '' : components.actionBar()}
${consent}
${page.data ? `<script id="site-data" type="application/json">${pageData()}</script>` : ''}
<script src="/main.js" defer></script>
${(page.scripts || []).map((src) => `<script src="${src}" defer></script>`).join('\n')}
</body>
</html>
`;
}

// ---------- build ----------
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
copyDir(path.join(ROOT, 'public'), OUT);

const css = ['src/base.css', 'src/app.css', 'theme.css'].filter((f) => fs.existsSync(path.join(ROOT, f)))
  .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const cssName = `styles.${crypto.createHash('md5').update(css).digest('hex').slice(0, 8)}.css`;
fs.writeFileSync(path.join(OUT, cssName), css);
for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter((n) => n.endsWith('.js'))) fs.copyFileSync(path.join(ROOT, 'src', f), path.join(OUT, f));

if (!exists('public/favicon.svg')) {
  const r = site.faviconRadius ?? 14;
  fs.writeFileSync(path.join(OUT, 'favicon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${r}" fill="${site.colors.accent}"/><text x="32" y="42" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="26" text-anchor="middle" fill="${site.colors.onAccent}">${esc(site.monogram)}</text></svg>`);
}

// Collections: data/<name>.json -> one page per item for templates with {"collection": "<name>", "path": "/x/{slug}"}.
// Item fields are available as {{item.field}} and to components via page.item. Copied to dist/data/ for page scripts.
const collections = {};
if (fs.existsSync(path.join(ROOT, 'data'))) {
  fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'data')).filter((n) => n.endsWith('.json'))) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
    collections[f.replace(/\.json$/, '')] = d;
    fs.copyFileSync(path.join(ROOT, 'data', f), path.join(OUT, 'data', f));
  }
}
// Site-specific components (optional): components.js exports (helpers) => ({ name(args, page) { return html } })
if (exists('components.js')) Object.assign(components, require(path.join(ROOT, 'components.js'))({ site, ctx, cfg, esc, icon, has, get, photoTag, collections }));
const fill = (s, item) => String(s).replace(/\{([\w.]+)\}/g, (m, k) => (get(item, k) ?? m));

const pages = fs.readdirSync(path.join(ROOT, 'pages')).filter((f) => f.endsWith('.html')).flatMap((file) => {
  const raw = fs.readFileSync(path.join(ROOT, 'pages', file), 'utf8');
  const m = raw.match(/^<!--\s*(\{[\s\S]*?\})\s*-->/);
  if (!m) throw new Error(`${file}: missing <!-- {json meta} --> header`);
  const meta = { file, ...JSON.parse(m[1]), tpl: raw.slice(m[0].length) };
  if (!meta.collection) return [meta];
  const col = collections[meta.collection];
  if (!col) throw new Error(`${file}: data/${meta.collection}.json not found`);
  const items = Array.isArray(col) ? col : col[meta.collection] || col.items;
  return items.map((item) => ({ ...meta, item, path: fill(meta.path, item), title: fill(meta.title, item), description: fill(meta.description, item),
    fullTitle: meta.fullTitle && fill(meta.fullTitle, item) }));
});

for (const page of pages) {
  ctx.item = page.item; ctx.page = page;
  const html = layout(page, render(page.tpl, page), '/' + cssName);
  const out = page.path === '/' ? 'index.html' : page.path.replace(/^\//, '') + '.html';
  fs.mkdirSync(path.dirname(path.join(OUT, out)), { recursive: true });
  fs.writeFileSync(path.join(OUT, out), html);
}
delete ctx.item;

const indexable = pages.filter((p) => !p.noindex);
if (cfg.url) {
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map((p) => `  <url><loc>${cfg.url}${p.path === '/' ? '/' : p.path}</loc><priority>${p.priority ?? 0.7}</priority></url>`).join('\n')}\n</urlset>\n`);
}
fs.writeFileSync(path.join(OUT, 'robots.txt'),
  cfg.noindex ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\n${cfg.url ? `\nSitemap: ${cfg.url}/sitemap.xml\n` : ''}`);

// ---------- report ----------
const notes = [];
if (!cfg.url) notes.push('No site URL (site.json "url" or SITE_URL env) — canonical tags and sitemap.xml skipped.');
if (!cfg.formEndpoint) notes.push('No FORM_ENDPOINT — the quote form falls back to opening the visitor\'s email app.');
if (!cfg.ga4 && !cfg.plausible) notes.push('No analytics (GA4_ID or PLAUSIBLE_DOMAIN).');
if ((site.projectCategories || []).length && !(site.projects || []).some((p) => has(p.image))) notes.push('No real project photos in site.json "projects" — gallery shows stock photos labeled "Representative photo".');
if (!(site.testimonials || []).some((t) => has(t.quote))) notes.push('No testimonials — testimonial sections are hidden until added.');
if (!exists('public/og.jpg')) notes.push('No public/og.jpg (1200x630) — link previews will be text-only.');
console.log(`Built ${pages.length} pages -> dist/`);
if (todos.size) console.log(`\nVisible [TODO] marks on the site — fill these in site.json:\n  - ${[...todos].join('\n  - ')}`);
if (notes.length) console.log(`\nNotes:\n  - ${notes.join('\n  - ')}`);
