// Project records: one JSON file per project + a small index for the dashboard list.
'use strict';
const crypto = require('crypto');
const store = require('./store');
const { httpError } = require('./http');

const STATUSES = [
  ['intake', 'Intake'], ['docs', 'Waiting on documents'], ['prep', 'Preparing application'],
  ['submitted', 'Submitted to the city'], ['comments', 'Resolving plan-review comments'],
  ['issued', 'Permit issued'], ['inspections', 'Inspections'], ['closed', 'Closed out'],
];
const STATUS_KEYS = STATUSES.map((s) => s[0]);

const id = (prefix) => `${prefix}${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex')}`;
const key = (pid) => `projects/${pid}/project.json`;
const now = () => new Date().toISOString();

async function load(pid) {
  if (!/^[A-Za-z0-9-]{4,40}$/.test(pid || '')) throw httpError(400, 'Bad project id');
  const p = await store.readJSON(key(pid));
  if (!p) throw httpError(404, 'Project not found');
  return p;
}

function summary(p) {
  const openReq = (p.requests || []).filter((r) => r.status === 'open').length;
  const toSign = (p.signing || []).filter((s) => s.status === 'sent').length;
  return { id: p.id, company: p.client?.company || '', name: p.client?.name || '', address: p.job?.address || '', city: p.job?.city || '',
    type: p.job?.type || '', status: p.status, updated: p.updated, openRequests: openReq, awaitingSignature: toSign };
}

async function save(p) {
  p.updated = now();
  await store.writeJSON(key(p.id), p);
  const idx = (await store.readJSON('index.json')) || { projects: [] };
  idx.projects = idx.projects.filter((x) => x.id !== p.id);
  idx.projects.unshift(summary(p));
  await store.writeJSON('index.json', idx);
  return p;
}

async function list() { return ((await store.readJSON('index.json')) || { projects: [] }).projects; }

function create(data, by) {
  const p = {
    id: id('P'), created: now(), updated: now(), tokenVersion: 1, status: 'intake',
    client: pick(data.client, ['company', 'name', 'email', 'phone', 'license', 'qualifier', 'address', 'city', 'state', 'zip']),
    job: pick(data.job, ['address', 'city', 'county', 'zip', 'type', 'owner', 'ownerPhone', 'pcn', 'legal', 'value', 'permitNo', 'notes']),
    timeline: [], requests: [], files: [], signing: [], jobs: [],
  };
  timeline(p, 'Project created', by);
  return p;
}

function pick(src = {}, fields) {
  const o = {};
  for (const f of fields) if (src[f] !== undefined) o[f] = String(src[f]).slice(0, 500).trim();
  return o;
}
function timeline(p, text, by, extra = {}) { p.timeline.unshift({ at: now(), text: String(text).slice(0, 500), by: by || 'System', ...extra }); }

// What a client is allowed to see (never staff notes or internal files).
function clientView(p) {
  return {
    id: p.id, status: p.status, statusLabel: (STATUSES.find((s) => s[0] === p.status) || [])[1],
    statuses: STATUSES, client: { company: p.client.company, name: p.client.name },
    job: { address: p.job.address, city: p.job.city, type: p.job.type, permitNo: p.job.permitNo },
    timeline: p.timeline.filter((t) => !t.internal).slice(0, 50),
    requests: p.requests.map((r) => ({ id: r.id, label: r.label, note: r.note, status: r.status, fileIds: r.fileIds })),
    files: p.files.filter((f) => !f.internal && !f.removed).map(fileView),
    signing: p.signing.filter((s) => s.status !== 'draft').map((s) => ({ id: s.id, title: s.title, status: s.status, signedAt: s.signedAt, signedFileId: s.signedFileId })),
  };
}
const fileView = (f) => ({ id: f.id, name: f.name, size: f.size, mime: f.mime, kind: f.kind, at: f.at, by: f.by, internal: !!f.internal, requestId: f.requestId });

module.exports = { STATUSES, STATUS_KEYS, id, load, save, list, create, pick, timeline, clientView, fileView, now };
