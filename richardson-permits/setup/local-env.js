#!/usr/bin/env node
// Create .env.local for LOCAL testing only (random throwaway values, files stored in ./.data).
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(f) && !process.argv.includes('--force')) { console.log('.env.local already exists (use --force to replace)'); process.exit(0); }
fs.writeFileSync(f, [
  `APP_SECRET=${crypto.randomBytes(32).toString('hex')}`,
  `ADMIN_PASSWORD=localtest-${crypto.randomBytes(4).toString('hex')}`,
  `WORKER_TOKEN=${crypto.randomBytes(24).toString('hex')}`,
  'STORAGE=local', '',
].join('\n'));
console.log('Wrote .env.local (local test values only; never used by the live site).');
