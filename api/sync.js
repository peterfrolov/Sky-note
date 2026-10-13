const { setCors, parseBody, sendJson } = require('./_utils');
const { getNotes, saveNotes, recordDeletedNote, getDeletedNotes } = require('./storage');

module.exports = async (req, res) => {
  if (setCors(req, res)) return;

  const notes = await getNotes();
  const now = Date.now();

  // GET: Fetch notes, updates, and deleted IDs
  if (req.method === 'GET') {
    const since = parseInt((req.query && req.query.since) || '0', 10);
    const hasUpdates = notes.some(n => (n.updatedAt || 0) > since);

    return sendJson(res, 200, {
      serverTime: now,
      hasUpdates: hasUpdates,
      notes: notes,
      deletedIds: getDeletedNotes()
    });
  }

  // POST: Sync action
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const action = body.action || (body.note ? 'update' : 'unknown');

    if (action === 'update' && body.note && body.note.id) {
      const incoming = body.note;
      const idx = notes.findIndex(n => n.id === incoming.id);
      const updatedNote = {
        id: incoming.id,
        title: incoming.title !== undefined ? incoming.title : 'Uden titel',
        content: incoming.content !== undefined ? incoming.content : '',
        updatedAt: incoming.updatedAt || now
      };

      if (idx !== -1) {
        notes[idx] = updatedNote;
      } else {
        notes.unshift(updatedNote);
      }

      await saveNotes(notes);
      return sendJson(res, 200, { success: true, serverTime: now, note: updatedNote });
    }

    if (action === 'delete' && (body.noteId || body.id)) {
      const targetId = body.noteId || body.id;
      const filtered = notes.filter(n => n.id !== targetId);
      recordDeletedNote(targetId);
      await saveNotes(filtered);
      return sendJson(res, 200, { success: true, serverTime: now, deleted: targetId });
    }

    if (action === 'reorder' && Array.isArray(body.noteIds)) {
      const orderMap = new Map(body.noteIds.map((id, index) => [id, index]));
      notes.sort((a, b) => {
        const orderA = orderMap.has(a.id) ? orderMap.get(a.id) : 999999;
        const orderB = orderMap.has(b.id) ? orderMap.get(b.id) : 999999;
        return orderA - orderB;
      });
      await saveNotes(notes);
      return sendJson(res, 200, { success: true, serverTime: now });
    }

    return sendJson(res, 400, { error: 'Ukendt sync handling' });
  }

  sendJson(res, 405, { error: 'Method not allowed' });
};
