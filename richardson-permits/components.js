// Site-specific components for jurisdiction (city) pages and the permit checker. Loaded by build.js.
'use strict';
module.exports = ({ site, cfg, esc, icon, collections }) => {
  const data = collections.jurisdictions || { jurisdictions: [], _meta: {} };
  const J = data.jurisdictions;
  const yes = (v) => /^y/i.test(v || '');
  const SYSTEMS = ['Shingle', 'Tile', 'Metal', 'Flat'];

  const faq = (j) => {
    const qa = [
      [`What documents do I need for a re-roof permit in ${j.name}?`,
        `A typical ${j.name} re-roof submittal includes: ${j.documents.join('; ')}; plus the roof-system forms for your roofing type and product approvals for each material.`],
      [`Can I apply for a roofing permit online in ${j.name}?`,
        j.online ? (yes(j.online) ? `Yes. ${j.name} accepts permit applications online${j.platform ? ` through ${j.platform}` : ''}${yes(j.upload) ? ', including PDF plan uploads' : ''}.` : `${j.name} generally requires paper or in-person submittal${j.platform ? ` (${j.platform})` : ''}.`) : `Contact the ${j.name} building department to confirm how submittals are accepted.`],
      [`Is ${j.name} in the High-Velocity Hurricane Zone (HVHZ)?`,
        j.hvhz ? `Yes. ${j.name} is in ${j.county} County, which is in Florida's HVHZ. Roofing permits need HVHZ roofing applications and Miami-Dade NOAs for roofing products.`
          : `No. ${j.county} County is outside the HVHZ, but roofing products still need Florida Product Approval and wind-load compliance.`],
      [`Who can pull a permit in ${j.name}?`, 'The permit is issued to a licensed contractor (or an owner-builder). A permit runner prepares, submits and manages the permit on the contractor\'s behalf as an authorized agent.'],
    ];
    return qa;
  };

  return {
    jFacts(_, page) {
      const j = page.item;
      const rows = [
        ['Permit portal', j.platform || 'Contact the building department'],
        ['Online submittal', j.online ? (yes(j.online) ? 'Yes' : 'No (paper / in person)') : 'Verify with the city'],
        ['PDF plan uploads', j.upload ? (yes(j.upload) ? 'Yes' : 'No') : 'Verify with the city'],
        ['High-Velocity Hurricane Zone', j.hvhz ? 'Yes (HVHZ forms + Miami-Dade NOAs)' : 'No'],
        ['Building department phone', j.phone || 'n/a'],
      ];
      return `<dl class="facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
${j.portalUrl ? `<p><a class="btn btn--ghost btn--sm" href="${esc(j.portalUrl)}" rel="noopener nofollow" target="_blank">${esc(j.name)} permit portal ${icon('arrow')}</a></p>` : ''}
${j.notes ? `<p class="facts__note">${icon('alert')}<span>${esc(j.notes)}</span></p>` : ''}`;
    },

    jDocs(_, page) {
      const j = page.item;
      return `<div class="jdocs">
<div class="card"><h3>Application documents</h3><ol class="doclist">${j.documents.map((d) => `<li>${esc(d)}</li>`).join('')}</ol></div>
<div class="card"><h3>Roof-system documents</h3>
${SYSTEMS.map((s, i) => `<details${i === 0 ? ' open' : ''}><summary>${s} roof</summary><ul class="doclist">${(j.systems[s] || []).map((d) => `<li>${esc(d)}</li>`).join('')}</ul></details>`).join('')}
</div></div>`;
    },

    jNearby(_, page) {
      const j = page.item;
      const same = J.filter((x) => x.county === j.county && x.slug !== j.slug);
      const i = J.indexOf(j);
      const pick = same.sort((a, b) => Math.abs(J.indexOf(a) - i) - Math.abs(J.indexOf(b) - i)).slice(0, 12).sort((a, b) => a.name.localeCompare(b.name));
      return `<ul class="chips">${pick.map((x) => `<li><a href="/permits/${x.slug}">${esc(x.name)}</a></li>`).join('')}</ul>`;
    },

    jFaq(_, page) {
      return `<div class="faq">${faq(page.item).map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`;
    },

    jSchema(_, page) {
      const j = page.item;
      const url = cfg.url ? `${cfg.url}/permits/${j.slug}` : undefined;
      const graph = [
        { '@type': 'FAQPage', mainEntity: faq(j).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
        { '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: cfg.url ? `${cfg.url}/` : undefined },
          { '@type': 'ListItem', position: 2, name: 'Permit requirements', item: cfg.url ? `${cfg.url}/permits` : undefined },
          { '@type': 'ListItem', position: 3, name: `${j.name} roofing permits`, item: url }] },
        { '@type': 'Service', name: `Roofing permit expediting in ${j.name}, FL`, serviceType: 'Permit expediting', provider: { '@type': 'ProfessionalService', name: site.name },
          areaServed: { '@type': 'City', name: `${j.name.replace(/^Unincorporated /, '')}, FL` } },
      ];
      return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`;
    },

    jIndex() {
      const counties = [...new Set(J.map((j) => j.county))];
      return counties.map((c) => `<section class="jindex"><h2>${esc(c)} County</h2><ul class="jindex__list">${J.filter((j) => j.county === c)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((j) => `<li><a href="/permits/${j.slug}">${esc(j.name)}</a>${j.hvhz ? '<span class="tag">HVHZ</span>' : ''}${/^y/i.test(j.online) ? '<span class="tag tag--ok">Online</span>' : ''}</li>`).join('')}</ul></section>`).join('');
    },

    jCount() { return String(J.length); },
    jUpdated() { return esc(new Date((data._meta.generated || '2026-01-01') + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })); },
  };
};
