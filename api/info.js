const { setCors, sendJson } = require('./_utils');

module.exports = async (req, res) => {
  if (setCors(req, res)) return;

  sendJson(res, 200, {
    ip: 'cloud',
    isCloud: true,
    service: 'Fly Note Cloud',
    version: '1.0.0'
  });
};
