const { setCors, parseBody, sendJson } = require('../_utils');
const { getNotes, saveNotes, recordDeletedNote } = require('../storage');

module.exports = async (req, res) => {
  if (setCors(req, res)) return;

  const noteId = (req.query && req.query.id) || (req.url && req.url.split('/').pop().split('?')[0]);
  if (!noteId) {
    return sendJson(res, 400, { error: 'Mangler note id' });
  }

  let notes = await getNotes();

  // GET: Single note
  if (req.method === 'GET') {
    const note = notes.find(n => n.id === noteId);
    if (note) {
      return sendJson(res, 200, note);
    }
    return sendJson(res, 404, { error: 'Note ikke fundet' });
  }

  // POST: Update or create single note
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const updatedNote = {
      id: noteId,
      title: body.title !== undefined ? body.title : 'Uden titel',
      content: body.content !== undefined ? body.content : '',
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

  // DELETE: Delete single note
  if (req.method === 'DELETE') {
    const originalLength = notes.length;
    notes = notes.filter(n => n.id !== noteId);
    recordDeletedNote(noteId);
    await saveNotes(notes);
    return sendJson(res, 200, { success: true, deleted: originalLength !== notes.length });
  }

  sendJson(res, 405, { error: 'Method not allowed' });
};
