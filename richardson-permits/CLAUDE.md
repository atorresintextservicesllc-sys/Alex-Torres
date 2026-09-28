# Project context for Claude

A permit-expediting business website + staff platform. Owner is **not technical**: explain in plain English, do the work, verify it.

## Layout
- `site.json`: all business facts (name, legal name, phone, email, domain, prices, retainer plans, Zelle). **Rebrand with `setup/configure.js`** (reads `setup/answers.json`), not by hand-editing pages.
- `pages/*.html` + `components.js` + `theme.css` → `node build.js` → `dist/` (static). `data/jurisdictions.json` generates the 71 `/permits/<city>` pages.
- `api/*.js`: Vercel functions (admin, projects, files, sign). `api/_lib/store.js` = storage (Vercel Blob private store → `BLOB_STORE_ID`; Google Drive and local disk are also supported).
- `setup/`: `configure.js` (rebrand), `secrets.js` (keys + staff password → Vercel env; `--reset-password`), `verify.js` (live checks), `local-env.js`.
- Tests: `node tests/api-smoke.js`, `tests/ui-*.js` (headless Edge), against `node serve.js 4321`.

## Everyday tasks
- Change text/prices/contact info → edit `site.json` or the page, `node build.js`, check locally, then `vercel --prod --yes`, then `node setup/verify.js`.
- Reset staff password → `node setup/secrets.js --reset-password` then `vercel --prod --yes`.

## Rules
- Never put fake reviews, stats, licenses or credentials on the site.
- Never type passwords, card numbers or API keys into websites; the owner does that. Keys come from `setup/secrets.js`.
- E-signatures aren't notarization: NOCs and notarized affidavits go through RON or a mobile notary.
