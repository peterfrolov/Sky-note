/**
 * Cloud & Local Storage Adapter for Fly Note
 *
 * On Vercel, every request can land on a different serverless instance, so
 * memory and /tmp are NOT shared between your PC and your phone. Notes must
 * live in Upstash Redis (Vercel Marketplace: Storage → Upstash for Redis),
 * which sets KV_REST_API_URL / KV_REST_API_TOKEN automatically.
 *
 * Without it on Vercel the API answers 503 `cloud_storage_missing`, so the
 * app can tell the user instead of pretending notes were saved.
 *
 * Layout in Redis (one field per note, so two devices never overwrite each
 * other's notes):
 *   flynote:notes    hash  id -> JSON note
 *   flynote:deleted  hash  id -> deletedAt (ms)
 *   flynote:order    string JSON array of ids
 * Locally (node server.js / no Vercel) the same shape is kept in data/notes.json.
 */

const fs = require('fs');
const path = require('path');

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ON_VERCEL = !!process.env.VERCEL;

const NOTES_KEY = 'flynote:notes';
const DELETED_KEY = 'flynote:deleted';
const ORDER_KEY = 'flynote:order';
const LEGACY_KEY = 'flynote_notes';

const LOCAL_DATA_FILE = path.join(__dirname, '..', 'data', 'notes.json');

class StorageNotConfigured extends Error {
  constructor() {
    super('Sky-lager er ikke forbundet. Tilføj Upstash Redis til projektet i Vercel.');
    this.code = 'cloud_storage_missing';
  }
}

function mode() {
  if (KV_URL && KV_TOKEN) return 'redis';
  if (ON_VERCEL) throw new StorageNotConfigured();
  return 'file';
}

function isConfigured() {
  return !!(KV_URL && KV_TOKEN) || !ON_VERCEL;
}

// ---------- Redis (Upstash REST) ----------

async function redis(commands) {
  const res = await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  const out = await res.json();
  return out.map((r) => {
    if (r.error) throw new Error(`Redis: ${r.error}`);
    return r.result;
  });
}

const pairs = (flat) => {
  const obj = {};
  for (let i = 0; flat && i < flat.length; i += 2) obj[flat[i]] = flat[i + 1];
  return obj;
};

// Atomic "write only if not older than what is stored, and not deleted after it"
const UPSERT_LUA = `
local cur = redis.call('HGET', KEYS[1], ARGV[1])
local ts = tonumber(ARGV[3])
if cur then
  local ok, c = pcall(cjson.decode, cur)
  if ok and c.updatedAt and tonumber(c.updatedAt) > ts then return cur end
end
local del = redis.call('HGET', KEYS[2], ARGV[1])
if del and tonumber(del) >= ts then return false end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('HDEL', KEYS[2], ARGV[1])
return ARGV[2]`;

let migrated = false;
async function migrateLegacy() {
  if (migrated) return;
  migrated = true;
  const [count, legacy] = await redis([['HLEN', NOTES_KEY], ['GET', LEGACY_KEY]]);
  if (count > 0 || !legacy) return;
  let list = [];
  try { list = JSON.parse(legacy); if (typeof list === 'string') list = JSON.parse(list); } catch (e) { return; }
  if (!Array.isArray(list) || !list.length) return;
  const cmd = ['HSET', NOTES_KEY];
  list.forEach((n) => n && n.id && cmd.push(n.id, JSON.stringify(n)));
  if (cmd.length > 2) await redis([cmd, ['SET', ORDER_KEY, JSON.stringify(list.map((n) => n.id))]]);
}

// ---------- Local file ----------

function readFile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LOCAL_DATA_FILE, 'utf8'));
    if (Array.isArray(parsed)) return { notes: parsed, deleted: {} }; // old format
    return { notes: parsed.notes || [], deleted: parsed.deleted || {} };
  } catch (e) {
    return { notes: [], deleted: {} };
  }
}

function writeFile(state) {
  fs.mkdirSync(path.dirname(LOCAL_DATA_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// ---------- Public API ----------

/** @returns {Promise<{notes: object[], deleted: Record<string, number>}>} */
async function getState() {
  if (mode() === 'file') return readFile();
  await migrateLegacy();
  const [notesFlat, deletedFlat, orderJson] = await redis([
    ['HGETALL', NOTES_KEY], ['HGETALL', DELETED_KEY], ['GET', ORDER_KEY]
  ]);
  const notes = Object.values(pairs(notesFlat)).map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
  const deleted = {};
  for (const [id, ts] of Object.entries(pairs(deletedFlat))) deleted[id] = Number(ts);
  let order = [];
  try { order = JSON.parse(orderJson) || []; } catch (e) {}
  const pos = new Map(order.map((id, i) => [id, i]));
  notes.sort((a, b) => {
    const pa = pos.has(a.id) ? pos.get(a.id) : -1, pb = pos.has(b.id) ? pos.get(b.id) : -1;
    if (pa !== pb) return pa - pb; // unordered (new) notes first
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  return { notes, deleted };
}

/** Saves a note unless the stored copy is newer. Returns the note now stored (or null if it was deleted later). */
async function upsertNote(input) {
  const note = {
    id: String(input.id),
    title: input.title !== undefined ? input.title : 'Uden titel',
    content: input.content !== undefined ? input.content : '',
    updatedAt: Number(input.updatedAt) || Date.now()
  };
  if (mode() === 'file') {
    const state = readFile();
    if ((state.deleted[note.id] || 0) >= note.updatedAt) return null;
    const idx = state.notes.findIndex((n) => n.id === note.id);
    if (idx !== -1 && (state.notes[idx].updatedAt || 0) > note.updatedAt) return state.notes[idx];
    if (idx !== -1) state.notes[idx] = note; else state.notes.unshift(note);
    delete state.deleted[note.id];
    writeFile(state);
    return note;
  }
  const [stored] = await redis([['EVAL', UPSERT_LUA, '2', NOTES_KEY, DELETED_KEY, note.id, JSON.stringify(note), String(note.updatedAt)]]);
  return stored ? JSON.parse(stored) : null;
}

async function deleteNote(id, deletedAt = Date.now()) {
  if (mode() === 'file') {
    const state = readFile();
    state.notes = state.notes.filter((n) => n.id !== id);
    state.deleted[id] = deletedAt;
    writeFile(state);
    return;
  }
  await redis([['HDEL', NOTES_KEY, id], ['HSET', DELETED_KEY, id, String(deletedAt)]]);
}

async function reorder(ids) {
  if (mode() === 'file') {
    const state = readFile();
    const pos = new Map(ids.map((id, i) => [id, i]));
    state.notes.sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 1e9) - (pos.has(b.id) ? pos.get(b.id) : 1e9));
    writeFile(state);
    return;
  }
  await redis([['SET', ORDER_KEY, JSON.stringify(ids)]]);
}

module.exports = { getState, upsertNote, deleteNote, reorder, isConfigured, StorageNotConfigured };
