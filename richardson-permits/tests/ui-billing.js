// UI test of invoice links: staff login -> /billing -> signed link -> /invoice verifies; tampered/unsigned links are refused.
// node tests/ui-billing.js [baseUrl] [shotsDir]
'use strict';
const fs = require('fs');
const path = require('path');
const { launch } = require('./cdp');

const BASE = process.argv[2] || 'http://localhost:4322';
const SHOTS = process.argv[3] || path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
let n = 0; const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); n++; console.log('  ✓', m); };

(async () => {
  const page = await launch({ width: 1280, height: 1000 });
  try {
    await page.goto(`${BASE}/admin?next=/billing`);
    await page.waitFor("document.getElementById('login-view') && !document.getElementById('login-view').hidden");
    await page.eval(`const f=document.getElementById('login-form'); f.name.value='Natasha'; f.password.value=${JSON.stringify(env.ADMIN_PASSWORD)}; f.requestSubmit();`);
    await page.waitFor("location.pathname==='/billing' && document.getElementById('invoice-builder')", 10000);
    ok(true, 'login with ?next=/billing lands on the invoice builder');
    await page.eval(`const F=document.getElementById('invoice-builder').elements; F.c.value='Sunrise Roofing LLC'; F.nm.value='Maria';
      const tr=document.querySelector('#items tr'); tr.querySelector('.it-d').value='Permit processing: test'; tr.querySelector('.it-r').value='350';
      document.getElementById('invoice-builder').dispatchEvent(new Event('input')); document.getElementById('make-link').click();`);
    await page.waitFor("!document.getElementById('link-out').hidden && /&s=/.test(document.getElementById('link-url').value)", 10000);
    const url = await page.eval("return document.getElementById('link-url').value");
    ok(/#i=[^&]+&s=[\w-]{27}$/.test(url), 'builder made a signed invoice link');
    await page.goto(url);
    await page.waitFor("document.querySelector('#invoice-view .invoice') || /verify|incomplete/.test(document.getElementById('invoice-view').textContent)", 10000);
    ok(await page.eval("return !!document.querySelector('#invoice-view .invoice') && document.body.textContent.includes('Sunrise Roofing LLC')"), 'signed link shows the invoice');
    await page.screenshot(path.join(SHOTS, 'billing-invoice.png'));
    const bad = url.replace(/#i=([^&]+)/, (m, i) => '#i=' + i.slice(0, -2) + (i.slice(-2) === 'fQ' ? 'fX' : 'fQ'));
    for (const [u, label] of [[bad, 'tampered link'], [url.replace(/&s=.*$/, ''), 'unsigned link']]) {
      await page.goto('about:blank'); await page.goto(u);
      await page.waitFor("/verify|incomplete/.test(document.getElementById('invoice-view').textContent) || document.querySelector('#invoice-view .invoice')", 10000);
      ok(await page.eval("return !document.querySelector('#invoice-view .invoice')"), `${label} is refused`);
    }
    await page.screenshot(path.join(SHOTS, 'billing-refused.png'));
    console.log(`\nAll ${n} billing checks passed.`);
  } finally { await page.close(); }
})().catch((e) => { console.error(e.message); process.exit(1); });
