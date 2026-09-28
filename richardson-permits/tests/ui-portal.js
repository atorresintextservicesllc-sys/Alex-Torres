// UI test of phase 1 (staff workspace -> signature placement -> client portal -> signing page) in headless Edge.
// node tests/ui-portal.js [baseUrl] [shotsDir]
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
    // staff login
    await page.goto(`${BASE}/admin`);
    await page.waitFor("document.getElementById('login-view') && !document.getElementById('login-view').hidden");
    await page.eval(`const f=document.getElementById('login-form'); f.name.value='Natasha'; f.password.value=${JSON.stringify(env.ADMIN_PASSWORD)}; f.requestSubmit();`);
    await page.sleep(1500);
    await page.waitFor("!document.getElementById('dash-view').hidden");
    ok(true, 'staff signed in through the login form');
    // create project through the form
    await page.eval(`document.getElementById('new-btn').click(); const f=document.getElementById('new-form');
      f.company.value='Sunrise Roofing LLC'; f.elements.name.value='Maria Lopez'; f.email.value='maria@example.com'; f.phone.value='5615550199';
      f.address.value='88 Ocean Blvd'; f.city.value='Delray Beach'; f.requestSubmit();`);
    await page.sleep(1500);
    await page.waitFor("location.pathname==='/admin-project' && window.BPRProject");
    ok(true, 'project created from the dashboard form');
    // upload a test PDF through the dropzone input
    await page.eval("document.getElementById('up-kind').value='document'");
    await page.setFiles('#staff-drop input[type=file]', [path.join(__dirname, 'last-signed.pdf')]);
    await page.waitFor("[...document.querySelectorAll('#files a')].some(a=>a.textContent.includes('last-signed'))", 15000);
    ok(true, 'staff uploaded a PDF through the drop zone');
    await page.eval("document.querySelector('#quick-requests [data-quick]').click()");
    await page.waitFor("document.querySelectorAll('#requests li.req').length===1");
    ok(true, 'quick document request added');
    await page.screenshot(path.join(SHOTS, 'p1-workspace.png'));

    // signature placement
    await page.eval(`document.querySelector('[data-tab=sign]').click(); document.getElementById('sign-new').click();
      const sel=document.getElementById('sg-file'); sel.value=[...sel.options].find(o=>o.text.includes('last-signed')).value; sel.dispatchEvent(new Event('change'));`);
    await page.waitFor("document.querySelectorAll('#sg-pdf .pdf-page').length===3", 20000);
    await page.sleep(800);
    await page.eval(`const pages=document.querySelectorAll('#sg-pdf .pdf-page'); const ov=pages[1].querySelector('.pdf-overlay'); const r=ov.getBoundingClientRect();
      const place=(t,fx,fy)=>{document.querySelector('[data-place='+t+']').click(); ov.dispatchEvent(new MouseEvent('click',{clientX:r.left+r.width*fx, clientY:r.top+r.height*fy, bubbles:true}));};
      place('signature',.3,.6); place('date',.7,.61); place('initials',.85,.9);`);
    ok(await page.eval("return document.querySelectorAll('#sg-pdf .pdf-field').length") === 3, 'placed signature, date and initials fields');
    await page.eval("document.getElementById('sg-title').value='Permit authorization'; window.__copied=null; navigator.clipboard.writeText=async(t)=>{window.__copied=t}; document.getElementById('sg-send').click();");
    await page.waitFor('window.__copied', 10000);
    const signUrl = await page.eval('return window.__copied');
    ok(/\/sign#t=/.test(signUrl), 'signing link created');
    // portal link
    await page.eval("window.__copied=null; document.querySelector('[data-share=copy]').click();");
    await page.waitFor('window.__copied');
    const portalUrl = await page.eval('return window.__copied');
    ok(/\/portal#t=/.test(portalUrl), 'client portal link copied');

    // client portal (fresh context: clear cookies)
    await page.send('Network.clearBrowserCookies');
    await page.goto(portalUrl.replace(/^https?:\/\/[^/]+/, BASE));
    await page.waitFor("!document.getElementById('portal-view').hidden", 10000);
    const actions = await page.eval("return [...document.querySelectorAll('#pt-actions li')].map(l=>l.innerText.split('\\n')[0])");
    ok(actions.some((a) => a.startsWith('Sign: Permit authorization')) && actions.some((a) => a.startsWith('Upload:')), 'portal shows sign + upload actions');
    await page.setFiles('#pt-actions input[type=file]', [path.join(__dirname, 'sig.png').replace('sig.png', 'last-signed.pdf')]);
    await page.waitFor("![...document.querySelectorAll('#pt-actions li')].some(l=>l.innerText.startsWith('Upload:'))", 15000);
    ok(true, 'client uploaded against the request and it cleared');
    await page.screenshot(path.join(SHOTS, 'p1-portal.png'));

    // signing page from portal
    await page.eval("location.href=document.querySelector('#pt-actions a.btn').href");
    await page.sleep(1200);
    await page.waitFor("!document.getElementById('sign-view').hidden && document.querySelectorAll('#sn-pdf .pdf-field').length===3", 20000);
    ok(true, 'signing page shows the document with 3 highlighted fields');
    await page.eval(`const c=document.getElementById('sn-pad'); const r=c.getBoundingClientRect();
      const ev=(t,x,y)=>c.dispatchEvent(new PointerEvent(t,{clientX:r.left+x,clientY:r.top+y,pointerId:1,bubbles:true}));
      ev('pointerdown',30,60); for(let i=0;i<40;i++) ev('pointermove',30+i*12,60+Math.sin(i/3)*25); ev('pointerup',520,60);
      document.getElementById('sn-consent').checked=true;`);
    await page.eval("document.getElementById('sn-form').scrollIntoView({block:'center'})"); await page.sleep(300);
    ok(await page.eval("const f=document.getElementById('sn-form').getBoundingClientRect(); const c=document.querySelector('.sign-consent').getBoundingClientRect(); return c.left>=f.left && c.right<=f.right && c.top>=f.top && c.bottom<=f.bottom"), 'consent checkbox sits inside the signing form');
    await page.screenshot(path.join(SHOTS, 'p1-sign.png'), false);
    await page.eval("document.getElementById('sn-form').requestSubmit()");
    await page.waitFor("!document.getElementById('sn-done').hidden && document.getElementById('sn-done').textContent.startsWith('Signed')", 20000);
    ok(true, 'signed from the browser; page shows the signed confirmation');
    await page.screenshot(path.join(SHOTS, 'p1-signed.png'), false);

    // mobile portal
    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await page.goto(portalUrl.replace(/^https?:\/\/[^/]+/, BASE));
    await page.waitFor("!document.getElementById('portal-view').hidden", 10000);
    ok(await page.eval('return document.documentElement.scrollWidth <= 392'), 'mobile portal has no horizontal scroll');
    await page.screenshot(path.join(SHOTS, 'p1-portal-mobile.png'));
    ok(page.errors.length === 0, `no JS errors (${page.errors.join(' | ')})`);
    console.log(`\nAll ${n} UI checks passed. Screenshots in ${SHOTS}`);
  } catch (e) { console.error(e.message); console.error('JS errors:', page.errors); process.exitCode = 1; } finally { await page.close(); }
})();
