// Phase 2 checks: city pages (unique titles, valid JSON-LD, no private brand text), hub search, permit checker.
'use strict';
const fs = require('fs');
const path = require('path');
const { launch } = require('./cdp');

const BASE = process.argv[2] || 'http://localhost:4322';
const SHOTS = process.argv[3] || path.join(__dirname, 'shots');
let n = 0; const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); n++; console.log('  ✓', m); };

(async () => {
  // static checks over dist
  const dist = path.join(__dirname, '..', 'dist');
  const files = fs.readdirSync(path.join(dist, 'permits')).map((f) => path.join(dist, 'permits', f));
  const titles = new Set(); let ld = 0;
  for (const f of files) {
    const html = fs.readFileSync(f, 'utf8');
    titles.add(html.match(/<title>([^<]+)<\/title>/)[1]);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { JSON.parse(m[1]); ld++; }
    if (/sea\s*breeze|ccc1328689|carreiro/i.test(html)) throw new Error('private brand text in ' + f);
    if (/mark class="todo"/.test(html)) throw new Error('TODO mark in ' + f);
  }
  ok(titles.size === files.length, `${files.length} city pages have unique titles`);
  ok(ld >= files.length * 2, `JSON-LD parses on every city page (${ld} blocks)`);
  ok(true, 'no private SeaBreeze text or TODO marks on city pages');

  const page = await launch({ width: 1280, height: 950 });
  try {
    await page.goto(`${BASE}/permits/boca-raton`);
    const h1 = await page.eval("return document.querySelector('h1').textContent");
    ok(h1.includes('Boca Raton'), 'city page renders: ' + h1);
    ok(await page.eval("return document.querySelectorAll('.jdocs .doclist li').length") > 8, 'city page lists documents');
    await page.screenshot(path.join(SHOTS, 'p2-city.png'));

    await page.goto(`${BASE}/permits`);
    await page.eval("const q=document.getElementById('jsearch'); q.value='coral'; q.dispatchEvent(new Event('input'))");
    const visible = await page.eval("return [...document.querySelectorAll('#jindex li')].filter(l=>!l.hidden).map(l=>l.textContent)");
    ok(visible.length >= 1 && visible.every((v) => /coral/i.test(v)), 'hub search filters cities: ' + visible.join(', '));

    await page.goto(`${BASE}/permit-checker`);
    await page.waitFor("document.getElementById('ck-cities').options.length > 60");
    await page.eval("const c=document.getElementById('ck-city'); c.value='Coconut Creek'; c.dispatchEvent(new Event('input')); const s=document.getElementById('ck-system'); s.value='Tile'; s.dispatchEvent(new Event('change'));");
    const res = await page.eval("return {h: document.querySelector('#ck-result h2')?.textContent, n: document.querySelectorAll('#ck-result .doclist li').length, hvhz: /HVHZ/.test(document.getElementById('ck-result').textContent), cta: document.querySelector('#ck-result a.btn--primary').href}");
    ok(res.h && res.h.includes('Coconut Creek') && res.n > 5 && res.hvhz, `checker shows ${res.n} documents + HVHZ note for Coconut Creek tile`);
    await page.screenshot(path.join(SHOTS, 'p2-checker.png'));
    await page.goto(res.cta);
    const pre = await page.eval("const f=document.querySelector('form[data-lead]'); return [f.elements.municipality.value, f.elements.project_type.value]");
    ok(pre[0] === 'Coconut Creek' && pre[1] === 'Re-roof', 'checker CTA pre-fills the intake form: ' + pre.join(' / '));

    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await page.goto(`${BASE}/permits/fort-lauderdale`);
    ok(await page.eval('return document.documentElement.scrollWidth <= 392'), 'mobile city page has no horizontal scroll');
    ok(page.errors.length === 0, `no JS errors ${page.errors.join(' | ')}`);
    console.log(`\nAll ${n} phase-2 checks passed.`);
  } catch (e) { console.error(e.message, page.errors); process.exitCode = 1; } finally { await page.close(); }
})();
