# Owner's guide

Your site has two sides: the **public website** that brings in business, and the **staff dashboard** where you run jobs.

## Signing in
Go to **yourdomain.com/admin** and enter your name and the staff password.
Forgot it? Open Claude Code in the site folder and say *"reset my staff password"*.

## A new permit job, start to finish
1. **+ New project**: the contractor's company, contact, job address, city and permit type.
2. **Copy link** (or **Text it**): send the client their portal link. No password needed; the link is their key.
   Want to cut off old links? **Reset links** makes a new one and disables every link sent so far.
3. **Documents** tab → **Requested from client**: click the chips (Signed contract, COI, NOA…) or type your own.
   The client sees each request with an Upload button. When they upload, it's marked received automatically.
4. **Status** (top right): move the job along (Waiting on documents → Submitted → Comments → Issued…). The client sees the progress bar.
5. **Activity** tab: post updates. Tick **Staff only** for private notes.

## Getting something signed
**Signatures** tab → **+ Send a PDF for signature** → pick the PDF → click **Signature / Initials / Name / Date**, then click on the page
where each goes (drag to adjust) → **Create signing link** → send it.
When they sign, the signed PDF (with a certificate page proving who signed, and when) appears in Files.
⚠️ **Documents that must be notarized** (Notice of Commencement, some affidavits) can't be e-signed. Use your RON or mobile-notary service.

## Invoices
Go to **yourdomain.com/billing** (bookmark it). Build the invoice from your price list, then **Text it** or **Email it**.
Clients pay by Zelle and tap "I've sent payment". Tip: **Backup** the invoice log now and then.

## Changing things on the site
Open Claude Code in the site folder and ask in plain words, for example:
- "Change my phone number to …" / "Update my hours"
- "Add this testimonial from a client: …"
- "Change the price of a small building permit to $500"
- "Add a new service page for …"
Claude edits it, checks it, and republishes (`vercel --prod`).

## Keep it healthy
- Once a month: glance at yourdomain.com/permits. City rules change; tell Claude if you spot anything outdated.
- Upgrade hosting to Vercel **Pro ($20/mo)** once the site is running your business.
