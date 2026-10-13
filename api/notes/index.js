const { setCors, parseBody, sendJson } = require('../_utils');
const { getNotes, saveNotes, recordDeletedNote } = require('../storage');

module.exports = async (req, res) => {
  if (setCors(req, res)) return;

  const notes = await getNotes();

  // GET: Return all notes
  if (req.method === 'GET') {
    const id = req.query && req.query.id;
    if (id) {
      const note = notes.find(n => n.id === id);
      if (note) {
        return sendJson(res, 200, note);
      }
      return sendJson(res, 404, { error: 'Note ikke fundet' });
    }
    return sendJson(res, 200, notes);
  }

  // POST: Create, update, or reorder
  if (req.method === 'POST') {
    const body = await parseBody(req);

    // Reorder request
    if (body.noteIds && Array.isArray(body.noteIds)) {
      const orderMap = new Map(body.noteIds.map((id, index) => [id, index]));
      notes.sort((a, b) => {
        const orderA = orderMap.has(a.id) ? orderMap.get(a.id) : 999999;
        const orderB = orderMap.has(b.id) ? orderMap.get(b.id) : 999999;
        return orderA - orderB;
      });
      await saveNotes(notes);
      return sendJson(res, 200, { success: true, notes });
    }

    // Bulk notes sync (e.g. from newly connected client)
    if (body.notes && Array.isArray(body.notes)) {
      body.notes.forEach(incoming => {
        const idx = notes.findIndex(n => n.id === incoming.id);
        if (idx !== -1) {
          if ((incoming.updatedAt || 0) > (notes[idx].updatedAt || 0)) {
            notes[idx] = { ...notes[idx], ...incoming };
          }
        } else {
          notes.push(incoming);
        }
      });
      await saveNotes(notes);
      return sendJson(res, 200, { success: true, notes });
    }

    // Single note upsert
    const noteId = (req.query && req.query.id) || body.id;
    if (noteId) {
      const updatedNote = {
        id: noteId,
        title: body.title || 'Uden titel',
        content: body.content || '',
        updatedAt: body.updatedAt || Date.now()
      };

      const idx = notes.findIndex(n => n.id === noteId);
      if (idx !== -1) {
        notes[idx] = updatedNote;
      } else {
        notes.unshift(updatedNote);
      }

      await saveNotes(notes);
      return sendJson(res, 200, { success: true, note: updatedNote });
    }

    return sendJson(res, 400, { error: 'Ugyldig forespørgsel' });
  }

  // DELETE: Delete single note
  if (req.method === 'DELETE') {
    const noteId = req.query && req.query.id;
    if (noteId) {
      const filtered = notes.filter(n => n.id !== noteId);
      recordDeletedNote(noteId);
      await saveNotes(filtered);
      return sendJson(res, 200, { success: true });
    }
    return sendJson(res, 400, { error: 'Mangler note id' });
  }

  sendJson(res, 405, { error: 'Method not allowed' });
};
