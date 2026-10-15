const { setCors, parseBody, sendJson, withErrors } = require('../_utils');
const { getState, upsertNote, deleteNote, reorder } = require('../storage');

module.exports = withErrors(async (req, res) => {
  if (setCors(req, res)) return;

  if (req.method === 'GET') {
    const { notes } = await getState();
    const id = req.query && req.query.id;
    if (id) {
      const note = notes.find(n => n.id === id);
      return note ? sendJson(res, 200, note) : sendJson(res, 404, { error: 'Note ikke fundet' });
    }
    return sendJson(res, 200, notes);
  }

  if (req.method === 'POST') {
    const body = await parseBody(req);

    if (Array.isArray(body.noteIds)) {
      await reorder(body.noteIds);
      return sendJson(res, 200, { success: true });
    }

    // Bulk upload (offline edits, notes made while the cloud was unreachable)
    if (Array.isArray(body.notes)) {
      const saved = [];
      for (const n of body.notes) if (n && n.id) saved.push(await upsertNote(n));
      return sendJson(res, 200, { success: true, notes: saved.filter(Boolean) });
    }

    const noteId = (req.query && req.query.id) || body.id;
    if (noteId) {
      const note = await upsertNote({ ...body, id: noteId });
      return sendJson(res, 200, { success: true, note });
    }
    return sendJson(res, 400, { error: 'Ugyldig forespørgsel' });
  }

  if (req.method === 'DELETE') {
    const noteId = req.query && req.query.id;
    if (!noteId) return sendJson(res, 400, { error: 'Mangler note id' });
    await deleteNote(noteId);
    return sendJson(res, 200, { success: true });
  }

  sendJson(res, 405, { error: 'Method not allowed' });
});
