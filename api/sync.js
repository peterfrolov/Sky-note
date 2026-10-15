const { setCors, parseBody, sendJson, withErrors } = require('./_utils');
const { getState, upsertNote, deleteNote, reorder } = require('./storage');

module.exports = withErrors(async (req, res) => {
  if (setCors(req, res)) return;
  const now = Date.now();

  // GET: all notes plus deleted ids
  if (req.method === 'GET') {
    const { notes, deleted } = await getState();
    return sendJson(res, 200, { serverTime: now, notes, deletedIds: Object.keys(deleted), deleted });
  }

  if (req.method === 'POST') {
    const body = await parseBody(req);
    const action = body.action || (body.note ? 'update' : 'unknown');

    if (action === 'update' && body.note && body.note.id) {
      const note = await upsertNote(body.note);
      return sendJson(res, 200, { success: true, serverTime: now, note });
    }
    if (action === 'delete' && (body.noteId || body.id)) {
      const id = body.noteId || body.id;
      await deleteNote(id, body.deletedAt);
      return sendJson(res, 200, { success: true, serverTime: now, deleted: id });
    }
    if (action === 'reorder' && Array.isArray(body.noteIds)) {
      await reorder(body.noteIds);
      return sendJson(res, 200, { success: true, serverTime: now });
    }
    return sendJson(res, 400, { error: 'Ukendt sync handling' });
  }

  sendJson(res, 405, { error: 'Method not allowed' });
});
