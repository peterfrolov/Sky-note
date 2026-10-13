const { setCors, parseBody, sendJson } = require('../_utils');
const { getNotes, saveNotes } = require('../storage');

module.exports = async (req, res) => {
  if (setCors(req, res)) return;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const body = await parseBody(req);
  if (!body.noteIds || !Array.isArray(body.noteIds)) {
    return sendJson(res, 400, { error: 'Forventede noteIds array' });
  }

  const notes = await getNotes();
  const orderMap = new Map(body.noteIds.map((id, index) => [id, index]));
  notes.sort((a, b) => {
    const orderA = orderMap.has(a.id) ? orderMap.get(a.id) : 999999;
    const orderB = orderMap.has(b.id) ? orderMap.get(b.id) : 999999;
    return orderA - orderB;
  });

  await saveNotes(notes);
  return sendJson(res, 200, { success: true });
};
