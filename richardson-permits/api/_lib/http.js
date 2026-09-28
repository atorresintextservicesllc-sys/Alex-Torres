// Tiny request/response helpers that work the same on Vercel Node functions and serve.js.
'use strict';

const MAX_JSON = 1_000_000;

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  if (!isBuf && typeof body !== 'string') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    body = JSON.stringify(body);
  }
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}
const ok = (res, body = { ok: true }) => send(res, 200, body);
const fail = (res, status, message) => send(res, status, { error: message });

function rawBody(req, limit) {
  if (req.body !== undefined && Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function json(req) {
  // Vercel may have parsed JSON already
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const buf = await rawBody(req, MAX_JSON);
  return buf.length ? JSON.parse(buf.toString('utf8')) : {};
}

function query(req) {
  return Object.fromEntries(new URL(req.url, 'http://x').searchParams);
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  return (Array.isArray(xf) ? xf[0] : (xf || '')).split(',')[0].trim() || req.socket?.remoteAddress || '';
}

// Wrap a handler: method check + uniform error handling.
function route(methods, fn) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) return fail(res, 405, 'Method not allowed');
      await fn(req, res);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      fail(res, status, status >= 500 ? 'Server error' : e.message);
    }
  };
}

const httpError = (status, message) => Object.assign(new Error(message), { status });

module.exports = { send, ok, fail, rawBody, json, query, clientIp, route, httpError };
