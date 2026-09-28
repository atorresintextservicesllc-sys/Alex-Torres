#!/usr/bin/env node
// Check the live site end to end:  node setup/verify.js [https://example.com]
'use strict';
const fs = require('fs');
const path = require('path');
const site = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site.json'), 'utf8'));
const BASE = (process.argv[2] || site.url).replace(/\/$/, '');
let bad = 0;
const line = (ok, msg) => { if (!ok) bad++; console.log(`${ok ? '  OK ' : '  !! '} ${msg}`); };

(async () => {
  console.log(`Checking ${BASE}`);
  for (const p of ['/', '/services', '/pricing', '/permits', '/permit-checker', '/contact', '/admin', '/portal', '/sign', '/sitemap.xml']) {
    try { const r = await fetch(BASE + p, { redirect: 'follow' }); line(r.ok, `${p} -> ${r.status}`); } catch (e) { line(false, `${p} -> ${e.cause?.code || e.message}`); }
  }
  try {
    const home = await (await fetch(BASE + '/')).text();
    line(home.includes(site.name), `home page shows "${site.name}"`);
  } catch (_) { line(false, 'home page readable'); }
  try {
    const me = await (await fetch(BASE + '/api/admin?action=me')).json();
    line(me.storage === 'blob' || me.storage === 'drive', `file storage: ${me.storage}${me.storage === 'local' ? ' (NOT connected: uploads will fail)' : ''}`);
  } catch (e) { line(false, `API reachable (${e.message})`); }
  try {
    const r = await fetch(BASE + '/api/admin?action=login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'definitely-wrong-password' }) });
    line(r.status === 401, `staff login configured (${r.status === 503 ? 'ADMIN_PASSWORD/APP_SECRET missing' : r.status === 401 ? 'rejects wrong password' : r.status})`);
  } catch (e) { line(false, `login endpoint (${e.message})`); }
  if (!/localhost/.test(BASE)) {
    try { const r = await fetch(BASE.replace('https://', 'https://www.') + '/', { redirect: 'manual' }); line(r.status < 400, `www.${BASE.replace('https://', '')} -> ${r.status}`); } catch (e) { line(false, `www subdomain (${e.cause?.code || e.message})`); }
  }
  console.log(bad ? `\n${bad} problem(s) found.` : '\nEverything checks out.');
  process.exit(bad ? 1 : 0);
})();
