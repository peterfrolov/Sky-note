const { setCors, parseBody, sendJson, withErrors } = require('../_utils');
const { reorder } = require('../storage');

module.exports = withErrors(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const body = await parseBody(req);
  if (!Array.isArray(body.noteIds)) return sendJson(res, 400, { error: 'Forventede noteIds array' });

  await reorder(body.noteIds);
  return sendJson(res, 200, { success: true });
});
