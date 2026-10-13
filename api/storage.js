/**
 * Cloud & Local Storage Adapter for Fly Note
 * Supports:
 * 1. Vercel KV / Upstash Redis (zero-config if enabled in Vercel Dashboard)
 * 2. Ephemeral /tmp file storage on Vercel
 * 3. Local data/notes.json when running locally
 */

const fs = require('fs');
const path = require('path');

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const LOCAL_DATA_FILE = process.env.VERCEL
  ? '/tmp/flynote_notes.json'
  : path.join(__dirname, '..', 'data', 'notes.json');

// In-memory cache across serverless function invocations
let memoryNotes = null;
let memoryDeletedIds = [];

async function getNotes() {
  // 1. Try Vercel KV / Upstash Redis if configured
  if (KV_URL && KV_TOKEN) {
    try {
      const res = await fetch(`${KV_URL}/get/flynote_notes`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.result) {
          const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
          if (Array.isArray(parsed) && parsed.length > 0) {
            memoryNotes = parsed;
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn('[Storage] KV read error:', e.message);
    }
  }

  // 2. Memory cache
  if (memoryNotes && Array.isArray(memoryNotes) && memoryNotes.length > 0) {
    return memoryNotes;
  }

  // 3. Local / /tmp File System
  try {
    if (fs.existsSync(LOCAL_DATA_FILE)) {
      const content = fs.readFileSync(LOCAL_DATA_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryNotes = parsed;
        return parsed;
      }
    }
  } catch (e) {}

  // 4. Fallback: Also check if data/notes.json exists locally even in read-only
  try {
    const fallbackPath = path.join(__dirname, '..', 'data', 'notes.json');
    if (fs.existsSync(fallbackPath)) {
      const content = fs.readFileSync(fallbackPath, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryNotes = parsed;
        return parsed;
      }
    }
  } catch (e) {}

  // Default welcome note
  const defaultNotes = [
    {
      id: 'velkommen',
      title: 'Velkommen til Fly Note ✈️',
      content: `# Velkommen til Fly Note! ⚡\n\nDette er dit lynhurtige note-program synkroniseret direkte i skyen på Vercel.\n\n### 📱 Forbind din mobil fra hele verden:\n1. Tryk på knappen **"Forbind mobil"** øverst til højre.\n2. Scan QR-koden med mobilens kamera, eller åbn Vercel-linket direkte på telefonen.\n3. Skriv på PC'en, og se teksten dukke op på mobilen med det samme – og omvendt!\n\n### ⚡ Funktioner:\n- [x] Kører 100% i skyen på Vercel med HTTPS\n- [x] Realtids sky-synkronisering mellem alle enheder\n- [x] Virker overalt (Wi-Fi, 4G, 5G)\n- [x] Kan installeres som rigtig app på telefon og PC (PWA)\n\nGod fornøjelse med Fly Note!`,
      updatedAt: Date.now()
    }
  ];

  memoryNotes = defaultNotes;
  await saveNotes(defaultNotes);
  return defaultNotes;
}

async function saveNotes(notes) {
  memoryNotes = notes;

  // 1. Try Vercel KV / Upstash Redis if configured
  if (KV_URL && KV_TOKEN) {
    try {
      await fetch(`${KV_URL}/set/flynote_notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(JSON.stringify(notes))
      });
    } catch (e) {
      console.warn('[Storage] KV save error:', e.message);
    }
  }

  // 2. Local / /tmp File System
  try {
    const dir = path.dirname(LOCAL_DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_DATA_FILE, JSON.stringify(notes, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Storage] Disk save warning:', e.message);
  }
}

function recordDeletedNote(noteId) {
  if (!memoryDeletedIds.includes(noteId)) {
    memoryDeletedIds.push(noteId);
    if (memoryDeletedIds.length > 100) {
      memoryDeletedIds.shift();
    }
  }
}

function getDeletedNotes() {
  return memoryDeletedIds;
}

module.exports = {
  getNotes,
  saveNotes,
  recordDeletedNote,
  getDeletedNotes
};
