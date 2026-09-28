#!/usr/bin/env node
// Rebrand the site from setup/answers.json (written by the setup agent after interviewing the owner).
//   node setup/configure.js            apply answers.json
//   node setup/configure.js --show     print what is currently applied
// Idempotent: the last applied values live in setup/brand.lock.json, so it can be re-run after any change.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const write = (f, o) => fs.writeFileSync(path.join(ROOT, f), typeof o === 'string' ? o : JSON.stringify(o, null, 2) + '\n');

const LOCK = 'setup/brand.lock.json';
const current = fs.existsSync(path.join(ROOT, LOCK)) ? read(LOCK) : {
  brand: 'Best Permit Runners', legalName: 'Richardson Professional Services LLC', domain: 'bestpermitrunners.com',
  phone: '(754) 214-9077', email: 'nrproservicesllc@gmail.com', ownerFirstName: 'Natasha',
};
if (process.argv.includes('--show')) { console.log(JSON.stringify(current, null, 2)); process.exit(0); }

const A = read('setup/answers.json');
const need = ['brand', 'legalName', 'domain', 'phone', 'email', 'ownerFirstName'];
const missing = need.filter((k) => !String(A[k] || '').trim());
if (missing.length) { console.error('answers.json is missing: ' + missing.join(', ')); process.exit(1); }
A.domain = A.domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
const digits = A.phone.replace(/\D/g, '').slice(-10);
if (digits.length !== 10) { console.error('phone must have 10 digits'); process.exit(1); }
A.phone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
const dashed = (p) => p.replace(/\D/g, '').slice(-10).replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');

// 1) site.json facts
const site = read('site.json');
const legalShort = A.legalName.replace(/,?\s+(LLC|Inc\.?|Corp\.?)$/i, '');
Object.assign(site, {
  name: A.brand, legalName: A.legalName, url: `https://${A.domain}`, phone: A.phone, email: A.email, owner: A.ownerFirstName,
  brandSub: A.brand === A.legalName || A.brand === legalShort ? 'Permit Expediting & Admin Services' : `by ${A.legalName}`,
  monogram: (A.monogram || A.brand.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0]).join('').slice(0, 2)).toUpperCase(),
  description: `${A.brand}${A.brand !== A.legalName ? ` (${A.legalName})` : ''}: flat-fee permit expediting and administrative services for contractors, roofers and restoration companies in Broward, Miami-Dade and Palm Beach.`,
});
if (A.hours) site.hours = A.hours;
site.payments = site.payments || {};
site.payments.zelle = A.zelle || A.email;
site.payments.zelleName = A.legalName;
if (A.invoicePrefix) site.payments.invoicePrefix = A.invoicePrefix;
site._domain_note = `Live at ${A.domain}. Legal name (invoices, footer): ${A.legalName}.`;
write('site.json', site);

// 2) page templates + misc files: swap the previously applied strings for the new ones
const pairs = [
  [current.legalName, A.legalName], [current.brand, A.brand], [current.domain, A.domain],
  [current.phone, A.phone], [dashed(current.phone), dashed(A.phone)], [current.email, A.email],
].filter(([a, b]) => a && b && a !== b);
const files = fs.readdirSync(path.join(ROOT, 'pages')).map((f) => `pages/${f}`).concat(['README.md']);
let changed = 0;
for (const f of files) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  let s = fs.readFileSync(p, 'utf8'); const before = s;
  for (const [a, b] of pairs) s = s.split(a).join(b);
  if (current.ownerFirstName !== A.ownerFirstName && f === 'pages/about.html') s = s.split(current.ownerFirstName).join(A.ownerFirstName);
  if (s !== before) { fs.writeFileSync(p, s); changed++; }
}
write(LOCK, { brand: A.brand, legalName: A.legalName, domain: A.domain, phone: A.phone, email: A.email, ownerFirstName: A.ownerFirstName });
console.log(`Rebranded to "${A.brand}" (${A.legalName}) at https://${A.domain}; ${changed} template(s) updated.`);
console.log('Next: node build.js');
