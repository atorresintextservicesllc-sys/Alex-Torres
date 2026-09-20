# Torres Interior & Exterior Services

Marketing website for Torres Interior & Exterior Services, a construction
and remodeling company. Static HTML/CSS/JS site — no build step required.

## Pages

- `index.html` — Home
- `about.html` — About / team / values
- `services.html` — Services detail + FAQ
- `gallery.html` — Filterable project gallery
- `contact.html` — Contact form + business info

## Structure

```
css/style.css   Shared stylesheet
js/script.js    Nav toggle, gallery filter, FAQ accordion, contact form
images/         Project photos (add your own)
```

## Running locally

Any static file server works, e.g.:

```
python3 -m http.server 8080
```

Then open http://localhost:8080/index.html

## Customizing

- Swap the placeholder phone number, email, and address (search for
  `(555) 123-4567`, `info@torresiext.com`, `123 Main Street`).
- Replace the CSS-generated placeholder backgrounds in `.hero`,
  `.split-media`, `.gallery-item`, and `.team-avatar` with real photos.
- Update social links (`#`) in the header and footer.
