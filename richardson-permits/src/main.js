(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const track = (name) => {
    try {
      if (window.gtag) window.gtag('event', name);
      if (window.plausible) window.plausible(name);
    } catch (_) { /* analytics is optional */ }
  };

  // Mobile menu
  const toggle = $('.nav-toggle');
  const nav = $('#site-nav');
  if (toggle && nav) {
    const set = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      nav.classList.toggle('is-open', open);
      document.body.classList.toggle('nav-open', open);
    };
    toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  }

  // Click-to-call / click-to-text tracking
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-track]');
    if (a) track(a.dataset.track);
  });

  // Reveal-on-scroll for content below the first screen (skipped for reduced motion)
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    $$('.card, .step, .service, .tile, .quote, .frame, .timeline > li').forEach((el) => {
      if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('reveal'); io.observe(el); }
    });
  }

  // Gallery filters
  $$('[data-filters]').forEach((bar) => {
    const target = $(bar.dataset.filters);
    if (!target) return;
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]');
      if (!b) return;
      $$('button', bar).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const f = b.dataset.f;
      $$('[data-cat]', target).forEach((t) => { t.hidden = f !== 'all' && t.dataset.cat !== f; });
    });
  });

  // Arriving from a plan button (/contact?plan=...): note it in the message box
  const params = new URLSearchParams(location.search);
  const lead = $('form[data-lead]');
  if (lead) {
    // Prefill matching fields from links like /contact?municipality=Boca%20Raton&project_type=Re-roof
    params.forEach((v, k) => { const el = lead.elements[k]; if (el && !el.value && k !== 'subject') el.value = v; });
    const plan = params.get('plan'); const msg = $('textarea', lead);
    if (plan && msg && !msg.value) msg.value = `I'm interested in the ${plan}. `;
  }

  // Lead forms
  $$('form[data-lead]').forEach((form) => {
    const status = $('.form-status', form);
    const btn = $('button[type="submit"]', form);
    const success = form.nextElementSibling && form.nextElementSibling.matches('.form-success') ? form.nextElementSibling : null;
    const phone = form.dataset.phone;
    const say = (msg, state) => { status.textContent = msg; status.dataset.state = state || ''; };
    const fallback = phone ? ` Please call or text ${phone}.` : '';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.elements._gotcha && form.elements._gotcha.value) return; // bot
      const endpoint = form.dataset.endpoint;

      if (!endpoint) {
        // No form service configured yet: hand the lead to the visitor's email app.
        const to = form.dataset.email;
        if (!to) { say('Our online form is being set up.' + fallback, 'err'); return; }
        const lines = $$('[data-label]', form)
          .filter((el) => el.value.trim())
          .map((el) => `${el.dataset.label}: ${el.value.trim()}`);
        location.href = `mailto:${to}?subject=${encodeURIComponent(form.dataset.subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
        say('Opening your email app to send this request…', 'ok');
        track('lead_mailto');
        return;
      }

      btn.disabled = true;
      say('Sending…');
      try {
        const res = await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
        track('lead_submit');
        form.reset();
        if (success) {
          form.hidden = true;
          success.hidden = false;
          success.focus();
        } else {
          say('Thanks — we got it and will be in touch shortly.', 'ok');
        }
      } catch (_) {
        say('Sorry, that didn\'t go through.' + fallback, 'err');
      } finally {
        btn.disabled = false;
      }
    });
  });

  // GA4 only after consent (Plausible is cookieless and loads directly)
  const ga = document.documentElement.dataset.ga4;
  if (ga) {
    const load = () => {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', ga);
    };
    let choice = null;
    try { choice = localStorage.getItem('consent'); } catch (_) { /* storage blocked */ }
    if (choice === 'yes') load();
    else if (choice !== 'no') {
      const banner = $('#consent');
      if (banner) {
        banner.hidden = false;
        banner.addEventListener('click', (e) => {
          const v = e.target.dataset && e.target.dataset.consent;
          if (!v) return;
          try { localStorage.setItem('consent', v); } catch (_) { /* storage blocked */ }
          banner.hidden = true;
          if (v === 'yes') load();
        });
      }
    }
  }
})();
