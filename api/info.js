const { setCors, sendJson } = require('./_utils');
const { isConfigured } = require('./storage');

module.exports = async (req, res) => {
  if (setCors(req, res)) return;

  sendJson(res, 200, {
    ip: 'cloud',
    isCloud: true,
    cloudStorage: isConfigured(),
    service: 'Fly Note Cloud',
    version: '1.1.0'
  });
};
