#!/usr/bin/env node
// Generate this site's private keys and load them into the linked Vercel project, then write the worker config.
// Nobody types or copies a key: values go straight from this script into Vercel and worker/.worker.env.
//   node setup/secrets.js                 first-time setup (skips keys that already exist in Vercel)
//   node setup/secrets.js --reset-password  new staff password only
// The staff password is shown ONCE on screen and saved to your Desktop as "<brand> - staff login.txt".
'use strict';
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8'));
const isWin = process.platform === 'win32';
const VERCEL = isWin ? 'vercel.cmd' : 'vercel';

const DRY = process.argv.includes('--dry-run'); // test mode: reads Vercel, writes nothing anywhere real
function vercel(args, input) {
  if (DRY && (args[1] === 'add' || args[1] === 'rm')) { console.log(`  [dry-run] vercel ${args.join(' ')}`); return ''; }
  const r = spawnSync(VERCEL, args, { cwd: ROOT, input, encoding: 'utf8', shell: isWin });
  if (r.status !== 0) throw new Error(`vercel ${args.join(' ')} failed:\n${(r.stderr || r.stdout || '').slice(-600)}`);
  return r.stdout;
}
if (!fs.existsSync(path.join(ROOT, '.vercel', 'project.json'))) { console.error('Link the project first: vercel link --yes'); process.exit(1); }

const existing = vercel(['env', 'ls', 'production']);
const has = (name) => new RegExp(`\\b${name}\\b`).test(existing);
function setEnv(name, value, { overwrite = false } = {}) {
  if (has(name) && !overwrite) { console.log(`  ${name}: already set (kept)`); return false; }
  for (const env of ['production', 'preview']) {
    if (has(name)) { try { vercel(['env', 'rm', name, env, '--yes']); } catch (_) { /* not in this env */ } }
    vercel(env === 'preview' ? ['env', 'add', name, env, ''] : ['env', 'add', name, env], value);
  }
  console.log(`  ${name}: set`);
  return true;
}

const words = ['river', 'palm', 'coral', 'harbor', 'sunset', 'breeze', 'marina', 'orchid', 'pelican', 'lagoon', 'citrus', 'tide', 'mango', 'heron', 'dune', 'reef', 'bay', 'grove', 'isle', 'keys'];
const passphrase = () => `${Array.from({ length: 3 }, () => words[crypto.randomInt(words.length)]).join('-')}-${crypto.randomInt(1000, 9999)}`;

const resetOnly = process.argv.includes('--reset-password');
console.log(`Setting up keys for Vercel project (${site.name})…`);
let password = null;
if (!resetOnly) {
  setEnv('APP_SECRET', crypto.randomBytes(32).toString('hex'));
  setEnv('BUSINESS_NAME', site.name, { overwrite: true });
  setEnv('SITE_URL', site.url, { overwrite: true });
}
if (resetOnly || !has('ADMIN_PASSWORD')) { password = passphrase(); setEnv('ADMIN_PASSWORD', password, { overwrite: true }); }
else console.log('  ADMIN_PASSWORD: already set (kept). Use --reset-password to make a new one.');

// Worker token: shared by the website and the office worker. Keep them in sync. (Site-only installs have no worker/.)
const hasWorker = fs.existsSync(path.join(ROOT, 'worker'));
const workerEnvFile = path.join(ROOT, 'worker', DRY ? '.worker.env.dryrun' : '.worker.env');
let workerEnv = fs.existsSync(workerEnvFile) ? fs.readFileSync(workerEnvFile, 'utf8') : '';
const getW = (k) => (workerEnv.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1];
const putW = (k, v) => { workerEnv = new RegExp(`^${k}=`, 'm').test(workerEnv) ? workerEnv.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`) : `${workerEnv}${workerEnv && !workerEnv.endsWith('\n') ? '\n' : ''}${k}=${v}\n`; };
if (!resetOnly && hasWorker) {
  let wt = getW('WORKER_TOKEN');
  if (!wt || !has('WORKER_TOKEN')) { wt = crypto.randomBytes(24).toString('hex'); setEnv('WORKER_TOKEN', wt, { overwrite: true }); }
  else console.log('  WORKER_TOKEN: already set (kept)');
  putW('WORKER_TOKEN', wt);
  putW('BPR_URL', site.url);
  if (!getW('ANTHROPIC_API_KEY')) putW('ANTHROPIC_API_KEY', '');
  fs.writeFileSync(workerEnvFile, workerEnv);
  console.log('  worker/.worker.env: written');
}

if (password) {
  const desktop = [path.join(os.homedir(), 'OneDrive', 'Desktop'), path.join(os.homedir(), 'Desktop')].find((d) => fs.existsSync(d)) || os.homedir();
  const file = DRY ? path.join(os.tmpdir(), 'staff-login.dryrun.txt') : path.join(desktop, `${site.name} - staff login.txt`);
  fs.writeFileSync(file, `${site.name} staff login\n\nWebsite: ${site.url}/admin\nPassword: ${password}\n\nSave this in your phone's password manager, then delete this file.\nForgot it? Ask Claude to run: node setup/secrets.js --reset-password\n`);
  console.log(`\n  STAFF PASSWORD (also saved to ${file}):\n\n      ${password}\n`);
}
console.log('Done. Redeploy for the new keys to take effect: vercel --prod --yes');
