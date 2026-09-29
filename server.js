/**
 * Fly Note Server
 * Ultra-lightweight HTTP & Real-time WebSocket synchronization server.
 * Built with pure Node.js standard library (Zero-dependency fallback).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'notes.json');

// Ensure data storage directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory notes database persisted to JSON file
let notes = [];
if (fs.existsSync(DATA_FILE)) {
  try {
    notes = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    notes = [];
  }
}

function saveNotesToDisk() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(notes, null, 2), 'utf8');
  } catch (e) {
    console.error('Kunne ikke gemme noter på disk:', e.message);
  }
}

// Detect Local Network IPv4 Address
function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name in ifaces) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// Connected WebSocket Clients
// Map: socket -> { currentNoteId, deviceId, deviceName }
const clients = new Map();

// Helper: Broadcast to all connected clients (optionally excluding sender)
function broadcast(messageObj, excludeSocket = null, targetNoteId = null) {
  const payload = JSON.stringify(messageObj);
  for (const [sock, meta] of clients.entries()) {
    if (sock === excludeSocket) continue;
    if (targetNoteId && meta.currentNoteId !== targetNoteId) continue;
    sendWsMessage(sock, payload);
  }
}

function updatePresence(noteId) {
  let count = 0;
  for (const [, meta] of clients.entries()) {
    if (meta.currentNoteId === noteId) count++;
  }
  broadcast({ type: 'presence', noteId, count }, null, noteId);
}

// Create HTTP Server
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Endpoints
  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ip: getLocalIp(),
      port: PORT,
      notesCount: notes.length
    }));
    return;
  }

  if (url.pathname === '/api/notes' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(notes));
    return;
  }

  if (url.pathname === '/api/notes/reorder' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (Array.isArray(payload.noteIds)) {
          const orderMap = new Map(payload.noteIds.map((id, index) => [id, index]));
          notes.sort((a, b) => {
            const orderA = orderMap.has(a.id) ? orderMap.get(a.id) : 999999;
            const orderB = orderMap.has(b.id) ? orderMap.get(b.id) : 999999;
            return orderA - orderB;
          });
          saveNotesToDisk();
          broadcast({ type: 'notes_reorder', noteIds: payload.noteIds });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }
      } catch (e) {}
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ugyldig request' }));
    });
    return;
  }

  const noteMatch = url.pathname.match(/^\/api\/notes\/([a-zA-Z0-9_\-]+)$/);
  if (noteMatch) {
    const noteId = noteMatch[1];

    if (req.method === 'GET') {
      const note = notes.find(n => n.id === noteId);
      if (note) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(note));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Note ikke fundet' }));
      }
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const idx = notes.findIndex(n => n.id === noteId);
          const updatedNote = {
            id: noteId,
            title: payload.title || 'Uden titel',
            content: payload.content || '',
            updatedAt: payload.updatedAt || Date.now()
          };

          if (idx !== -1) {
            notes[idx] = updatedNote;
          } else {
            notes.unshift(updatedNote);
          }

          saveNotesToDisk();
          broadcast({ type: 'note_update', note: { ...updatedNote, deviceId: payload.deviceId, deviceName: payload.deviceName } });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, note: updatedNote }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Ugyldig JSON' }));
        }
      });
      return;
    }

    if (req.method === 'DELETE') {
      notes = notes.filter(n => n.id !== noteId);
      saveNotesToDisk();
      broadcast({ type: 'delete_note', noteId });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  
  // Security check: prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Adgang nægtet');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA/PWA routes
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Fejl ved indlæsning af fil');
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content);
    });
  });
});

// Native RFC 6455 WebSocket Handshake & Framing (Pure Node.js)
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`
  ];

  socket.write(headers.join('\r\n') + '\r\n\r\n');

  // Register client
  const clientMeta = { currentNoteId: null, deviceId: null, deviceName: 'Ukendt' };
  clients.set(socket, clientMeta);

  // Send all existing notes on connect
  sendWsMessage(socket, JSON.stringify({ type: 'all_notes', notes }));

  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const byte1 = buffer[0];
      const byte2 = buffer[1];
      const opcode = byte1 & 0x0f;
      const isMasked = (byte2 & 0x80) !== 0;
      let payloadLen = byte2 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buffer.length < 4) return;
        payloadLen = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buffer.length < 10) return;
        payloadLen = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      let maskKey = null;
      if (isMasked) {
        if (buffer.length < offset + 4) return;
        maskKey = buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (buffer.length < offset + payloadLen) return;

      const payload = buffer.subarray(offset, offset + payloadLen);
      buffer = buffer.subarray(offset + payloadLen);

      // Opcode 8: Connection Close
      if (opcode === 0x8) {
        socket.end();
        return;
      }

      // Opcode 9: Ping -> reply Pong
      if (opcode === 0x9) {
        sendWsFrame(socket, 0xa, payload);
        continue;
      }

      // Unmask payload
      if (isMasked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }

      if (opcode === 0x1) {
        // Text frame
        const msgStr = payload.toString('utf8');
        try {
          const data = JSON.parse(msgStr);
          handleClientMessage(socket, clientMeta, data);
        } catch (e) {}
      }
    }
  });

  socket.on('close', () => {
    const noteId = clientMeta.currentNoteId;
    clients.delete(socket);
    if (noteId) {
      updatePresence(noteId);
    }
  });

  socket.on('error', () => {
    clients.delete(socket);
  });
});

function handleClientMessage(socket, meta, data) {
  if (data.type === 'join_note') {
    const prevNote = meta.currentNoteId;
    meta.currentNoteId = data.noteId;
    meta.deviceId = data.deviceId;
    meta.deviceName = data.deviceName || 'Enhed';
    if (prevNote && prevNote !== data.noteId) {
      updatePresence(prevNote);
    }
    updatePresence(data.noteId);
  } else if (data.type === 'note_update') {
    const incoming = data.note;
    if (!incoming || !incoming.id) return;

    const idx = notes.findIndex(n => n.id === incoming.id);
    const cleanNote = {
      id: incoming.id,
      title: incoming.title || 'Uden titel',
      content: incoming.content || '',
      updatedAt: incoming.updatedAt || Date.now()
    };

    if (idx !== -1) {
      notes[idx] = cleanNote;
    } else {
      notes.unshift(cleanNote);
    }
    saveNotesToDisk();

    // Broadcast update to all other connected clients
    broadcast({
      type: 'note_update',
      note: {
        ...cleanNote,
        deviceId: incoming.deviceId,
        deviceName: incoming.deviceName
      }
    }, socket);
  } else if (data.type === 'delete_note') {
    notes = notes.filter(n => n.id !== data.noteId);
    saveNotesToDisk();
    broadcast({ type: 'delete_note', noteId: data.noteId }, socket);
  } else if (data.type === 'notes_reorder') {
    if (Array.isArray(data.noteIds)) {
      const orderMap = new Map(data.noteIds.map((id, index) => [id, index]));
      notes.sort((a, b) => {
        const orderA = orderMap.has(a.id) ? orderMap.get(a.id) : 999999;
        const orderB = orderMap.has(b.id) ? orderMap.get(b.id) : 999999;
        return orderA - orderB;
      });
      saveNotesToDisk();
      broadcast({ type: 'notes_reorder', noteIds: data.noteIds }, socket);
    }
  }
}

// Send standard unmasked text frame from server to client
function sendWsMessage(socket, text) {
  const payload = Buffer.from(text, 'utf8');
  sendWsFrame(socket, 0x1, payload);
}

function sendWsFrame(socket, opcode, payload) {
  try {
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    socket.write(Buffer.concat([header, payload]));
  } catch (e) {}
}

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log(`
==============================================================
  ✈️  FLY NOTE ER KLAR!
==============================================================

  💻 Åbn på PC:
     http://localhost:${PORT}

  📱 Åbn på Mobil (samme Wi-Fi):
     http://${localIp}:${PORT}

  ✨ Tip: Tryk på "Forbind mobil" i appen for at scanne QR-kode!
  ⚡ Kører med ren Node.js uden tunge baggrundsprocesser.
==============================================================
  `);
});
