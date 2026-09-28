// Local preview server for dist/ with Vercel-style clean URLs (/services -> services.html)
// and Vercel-style API routes (/api/<name> -> api/<name>.js), with .env.local loaded for secrets.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || process.argv[2] || 4321);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

// .env.local (KEY=value lines) for local API testing; never committed.
const envFile = path.join(ROOT, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  // Local-only fake form endpoint: build with FORM_ENDPOINT=http://localhost:<port>/__form-test to exercise forms.
  if (req.method === 'POST' && p === '/__form-test') {
    let n = 0;
    req.on('data', (c) => { n += c.length; });
    req.on('end', () => { console.log(`[form-test] received ${n} bytes`); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
    return;
  }

  const api = p.match(/^\/api\/([a-z0-9-]+)$/);
  if (api && fs.existsSync(path.join(ROOT, 'api', `${api[1]}.js`))) {
    const file = path.join(ROOT, 'api', `${api[1]}.js`);
    // hot reload API code in dev
    for (const k of Object.keys(require.cache)) if (k.startsWith(path.join(ROOT, 'api'))) delete require.cache[k];
    try { await require(file)(req, res); } catch (e) { console.error(e); if (!res.headersSent) { res.writeHead(500); res.end('error'); } }
    return;
  }

  if (p.endsWith('/')) p += 'index';
  const file = path.join(DIST, p);
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  const hit = [file, file + '.html', path.join(file, 'index.html')].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
  if (!hit) {
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    res.end(fs.readFileSync(path.join(DIST, '404.html')));
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(hit)] || 'application/octet-stream' });
  fs.createReadStream(hit).pipe(res);
}).listen(PORT, () => console.log(`Serving dist/ + api/ at http://localhost:${PORT}`));
