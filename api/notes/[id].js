const { setCors, parseBody, sendJson, withErrors } = require('../_utils');
const { getState, upsertNote, deleteNote } = require('../storage');

module.exports = withErrors(async (req, res) => {
  if (setCors(req, res)) return;

  const noteId = (req.query && req.query.id) || (req.url && req.url.split('/').pop().split('?')[0]);
  if (!noteId) return sendJson(res, 400, { error: 'Mangler note id' });

  if (req.method === 'GET') {
    const { notes } = await getState();
    const note = notes.find(n => n.id === noteId);
    return note ? sendJson(res, 200, note) : sendJson(res, 404, { error: 'Note ikke fundet' });
  }

  if (req.method === 'POST') {
    const body = await parseBody(req);
    const note = await upsertNote({ ...body, id: noteId });
    return sendJson(res, 200, { success: true, note });
  }

  if (req.method === 'DELETE') {
    const deletedAt = Number(req.query && req.query.deletedAt) || Date.now();
    await deleteNote(noteId, deletedAt);
    return sendJson(res, 200, { success: true });
  }

  sendJson(res, 405, { error: 'Method not allowed' });
});
