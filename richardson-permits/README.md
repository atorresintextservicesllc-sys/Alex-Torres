# Natasha — Permit Expediting website

Static, zero-dependency marketing and lead-generation site. Pages: Home · Services · Who We Help · How It Works · About · Contact / Start a Permit.

```
site.json      ← ALL business facts (name, phone, email, municipalities, photos, intake form fields)
theme.css      ← colors and fonts for this brand
pages/*.html   ← page content (template tokens like {{phone}}, components like {{> leadForm}})
src/           ← shared engine (same as alex-gc-site): base.css + main.js
public/        ← copied as-is to the site root (logo.svg, og.jpg)
build.js       ← builds dist/   ·   serve.js ← local preview
```

## Run locally

```bash
npm run dev        # build + serve at http://localhost:4321  (use: node serve.js 4322 for a second port)
```

The build prints every **[TODO]** still showing on the site (yellow marks).

## Before launch: fill in site.json

| Key | What | Status |
|---|---|---|
| `name` | Business name | Richardson Professional Services (LLC in `legalName`) |
| `phone`, `sms`, `email` | Contact info | Set from her price sheet: (754) 214-9077, nrproservicesllc@gmail.com |
| `url` | Final domain | blank |
| `hours` | Office hours | Default Mon–Fri 8–5, confirm |
| `about.story` | Why Natasha started it, years doing permits | **blank** |
| `testimonials` | Real contractor quotes. Hidden until added | empty |
| `stats` | Real numbers only (permits processed, etc.). Hidden until added | empty |
| `crossLink` | Optional "sister company" link in the footer (e.g. Alex's site) | empty |

Copy to confirm with Natasha: the FAQ answer on pricing (`pages/how-it-works.html`) and the list of cities under `areas`.

## Photos

Stock photos are hotlinked from Unsplash's CDN (free for commercial use under the [Unsplash License](https://unsplash.com/license); credits are in `site.json → photos`). Swap any of them by changing the photo `id`.

## Billing, invoices and retainers

| Page | Who | What |
|---|---|---|
| `/billing` | **Natasha only** (not linked, `noindex`) | Invoice builder. Pick services from her price list (plus hourly admin and retainer plans), apply a volume discount, and choose full / 50% deposit / final balance / monthly retainer. Then **Create link**, **Email it** or **Text it**. Keeps an invoice log with Sent/Paid/Void status, CSV export and Backup/Restore |
| `/invoice#i=…` | Client | Branded invoice with Print / Save as PDF, Zelle and ACH instructions (plus a card button if configured), and an "I've sent payment" form that notifies Natasha |
| `/pay` | Anyone (footer link) | General "pay an invoice" page with a copyable Zelle address and a payment-notice form |
| `/pricing#retainers` | Public | Retainer plans from `site.json → retainers` |

How it works, with no backend or accounts needed:
- An invoice's line items travel **inside its link**. **Where to pay never does**: Zelle, ACH and card details always come from `site.json → payments`, so an edited link can't redirect money.
- The invoice log lives in the browser Natasha uses for `/billing`. Use **Backup** regularly and **Restore** on a new device. Invoice numbers auto-increment (`payments.invoicePrefix`).
- Payment notices use `FORM_ENDPOINT` (same as the contact form), or open an email if it isn't set.
- **Card payments (optional):** create a Stripe or Square payment link (customer enters the amount) and paste it into `payments.cardLink`. For a retainer charged automatically, paste a subscription link into that plan's `payLink`.
- `/billing` is hidden, not password-protected. It holds no money or secrets, and the log stays in her browser. If you want it locked, put it behind Vercel password protection or move it to an internal tool.

**Retainer plans and hourly admin rates are PROPOSED** (from `PRICING_RESEARCH.md`): Admin Retainer $400/mo (10 hrs), 10-Permit Plan $3,900/mo, Volume Partner (custom), and admin at $45/hr or $65/hr for consulting. Confirm with Natasha before launch.

## Platform: client portal, uploads, e-sign

| Page | Who | What |
|---|---|---|
| `/admin` | Staff (password) | Project list, new project |
| `/admin-project?id=` | Staff | **Documents** (requests, uploads up to 250 MB, share or staff-only) · **Signatures** (click-to-place fields, signing links) · **Details** · **Activity** |
| `/portal#t=` | Client (link, no password) | Status steps, action items (upload or sign), files, messages |
| `/sign#t=&p=&s=` | Signer (one-document link) | View PDF, draw or type a signature, consent, sign. Output: signed PDF + audit certificate (IP, UA, times, SHA-256) |
| `/permits`, `/permits/<city>` | Public (SEO) | 71 Palm Beach + Broward roofing permit guides from `data/jurisdictions.json` |
| `/permit-checker` | Public | City + roof type → document checklist → "have us pull it" |

**API** (`api/*.js`, Vercel functions): `admin`, `projects`, `files`, `sign`. That's 4 functions, under the Hobby limit of 12.

**Storage** (`api/_lib/store.js`): a private Vercel Blob store in production (connected to the project; big files stored as 4 MB parts). Google Drive is also supported (`DRIVE_ROOT_ID` + OAuth refresh token or Shared-Drive service account). Local `.data/` for development (`STORAGE=local`).

**Required env** (generated by `node setup/secrets.js`, never pasted by hand): `APP_SECRET`, `ADMIN_PASSWORD`, plus file storage: a private Vercel Blob store connected to the project (`BLOB_STORE_ID`), or Google Drive (`DRIVE_ROOT_ID` + `GOOGLE_*`). Until they're set, the portal APIs answer "being set up" (503) and the marketing and SEO pages work normally. Full setup: `handoff/CLAUDE_START_HERE.md`.

### Tests
```bash
npm run dev                                  # local server on :4321 (use: node serve.js 4322)
node tests/api-smoke.js http://localhost:4322
node tests/ui-portal.js http://localhost:4322
node tests/ui-seo.js http://localhost:4322
```

## Environment variables, deploy, form test

- `FORM_ENDPOINT` (Formspree / Web3Forms), `FORM_ACCESS_KEY`, `SITE_URL`, `PLAUSIBLE_DOMAIN`, `GA4_ID`.
- Deploy: `vercel --prod --yes`, then `node setup/verify.js`.
